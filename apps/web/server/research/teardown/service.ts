import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db, type Prisma } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { DoubaoError, LocalAsrError, extractDouyinShareUrl, openAICompatibleConfigSchema } from "@content-center/providers";
import { normalizeSourceUrl, readTeardownState, renderTeardownMarkdown, TEARDOWN_SCHEMA } from "@content-center/core";
import { enqueueTeardown, teardownWorkerReady } from "@content-center/worker/teardown-queue";
import { configuredWorkerMode } from "@content-center/worker/worker-mode";
import { ResearchError, researchMember, type ResearchActor } from "../access";
import { prepareTeardownMaterial } from "./material-capability";
import { transcriptionProgressLabel } from "@/lib/source-processing-state";

const requestSchema = z.object({ shareText: z.string().trim().min(1).max(4000), requestKey: z.string().uuid() }).strict();
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
function personalRuns(actor: ResearchActor) { return { workspaceId: actor.workspaceId, requestedById: actor.userId, session: { workspaceId: actor.workspaceId, createdById: actor.userId, entryTemplate: "TEARDOWN" } }; }
async function assertTeardownReady(actor: ResearchActor, preflight?: () => Promise<void>) {
  if (preflight) { await preflight(); return; }
  if (configuredWorkerMode() === "disabled") throw new ResearchError("WORKER_DISABLED", "后台任务未启用，请启动后台任务服务后再试。", 503);
  if (!await teardownWorkerReady()) throw new ResearchError("WORKER_NOT_READY", "作品拆解后台尚未就绪，请重启后台服务以加载新模块。", 503);
  const integrations = new IntegrationService();
  const llm = await integrations.getIntegrationStatus(actor.workspaceId, "LLM");
  const redfox = await integrations.getIntegrationStatus(actor.workspaceId, "REDFOX");
  if (llm.status !== "CONFIGURED") throw new ResearchError("LLM_NOT_CONFIGURED", "请在系统设置中配置并启用模型 API。", 409);
  if (redfox.status !== "CONFIGURED") throw new ResearchError("REDFOX_NOT_CONFIGURED", "请在系统设置中配置并启用红狐 API。", 409);
  if (!openAICompatibleConfigSchema.safeParse(await integrations.getDecryptedIntegrationConfig(actor.workspaceId, "LLM")).success) throw new ResearchError("LLM_NOT_CONFIGURED", "模型 API 配置无效，请检查系统设置。", 409);
}
export async function startTeardown(actor: ResearchActor, value: unknown, dependencies: { prepare?: typeof prepareTeardownMaterial; enqueue?: typeof enqueueTeardown; preflight?: () => Promise<void> } = {}) {
  await researchMember(actor, true);
  const input = requestSchema.parse(value);
  let url: string;
  try { url = normalizeSourceUrl(extractDouyinShareUrl(input.shareText)); }
  catch { throw new ResearchError("INVALID_DOUYIN_URL", "请粘贴有效的抖音视频链接或分享文字。", 400); }
  const requestHash = createHash("sha256").update(url).digest("hex");
  const existing = await db.researchRun.findFirst({ where: { ...personalRuns(actor), requestKey: input.requestKey } });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new ResearchError("REQUEST_CONFLICT", "请求标识已用于其他作品，请重新发起。", 409);
    return teardownView(existing);
  }
  await assertTeardownReady(actor, dependencies.preflight);
  let material: Awaited<ReturnType<typeof prepareTeardownMaterial>>;
  try { material = await (dependencies.prepare ?? prepareTeardownMaterial)(actor, url, input.requestKey); }
  catch (error) {
    if (error instanceof DoubaoError || error instanceof LocalAsrError) throw new ResearchError(error.code, error.message, 409);
    throw error;
  }
  const run = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", JSON.stringify(["teardown", actor.workspaceId, actor.userId, input.requestKey]));
    const member = await tx.workspaceMember.findFirst({ where: { workspaceId: actor.workspaceId, userId: actor.userId, role: { not: "VIEWER" }, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } } });
    if (!member) throw new ResearchError("FORBIDDEN", "当前账号没有写入权限。", 403);
    if (!await tx.sourceItem.findFirst({ where: { id: material.sourceItemId, workspaceId: actor.workspaceId, sourcePlatform: "DOUYIN", status: { not: "ARCHIVED" } } })) throw new ResearchError("SOURCE_NOT_FOUND", "资料不存在或不可访问。", 404);
    const replay = await tx.researchRun.findFirst({ where: { ...personalRuns(actor), requestKey: input.requestKey } });
    if (replay) {
      if (replay.requestHash !== requestHash) throw new ResearchError("REQUEST_CONFLICT", "请求标识已用于其他作品。", 409);
      return replay;
    }
    const session = await tx.researchSession.create({ data: { workspaceId: actor.workspaceId, createdById: actor.userId, title: "抖音作品拆解", entryTemplate: "TEARDOWN", requestKey: input.requestKey } });
    const created = await tx.researchRun.create({ data: { workspaceId: actor.workspaceId, requestedById: actor.userId, sessionId: session.id, requestKey: input.requestKey, requestHash, question: "拆解作品主线、语义段落与作者近期表现", version: 1, stage: "MATERIAL", inputScope: { materialIds: [material.sourceItemId], benchmarkAccountIds: [], trendKeys: [], notes: "", useOwnArtifacts: false, useCreatorProfile: false }, coverage: json({ schema: TEARDOWN_SCHEMA, ...material, inputUrl: url, lastStage: "MATERIAL" }), status: "QUEUED" } });
    await tx.auditLog.create({ data: { workspaceId: actor.workspaceId, userId: actor.userId, action: "teardown.requested", resourceType: "research_run", resourceId: created.id, metadata: { sourceItemId: material.sourceItemId } } });
    return created;
  });
  // A failed dispatch leaves the DB reservation intact; the worker reconciler will deliver it.
  await (dependencies.enqueue ?? enqueueTeardown)({ runId: run.id, version: run.version, workspaceId: actor.workspaceId, requestedById: actor.userId }).catch(() => console.warn("TEARDOWN_DISPATCH_PENDING"));
  return teardownView(run);
}

/** Retry a failed task in place; version fences prevent an old worker from publishing over it. */
export async function retryTeardown(actor: ResearchActor, runId: string, value: unknown, dependencies: Parameters<typeof startTeardown>[2] = {}) {
  await researchMember(actor, true);
  const input = z.object({ version: z.number().int().positive(), mode: z.enum(["retry", "refresh"]).default("retry") }).strict().parse(value);
  const original = await db.researchRun.findFirst({ where: { ...personalRuns(actor), id: runId } });
  if (!original) throw new ResearchError("NOT_FOUND", "作品拆解不存在或不可访问。", 404);
  if (original.version !== input.version || ["QUEUED", "RUNNING"].includes(original.status)) return getTeardown(actor, runId);
  const refreshing = input.mode === "refresh" && original.status === "COMPLETED";
  if (original.status !== "FAILED" && !refreshing) throw new ResearchError("RETRY_NOT_ALLOWED", "只有未完成的任务可以重试；已完成的报告请使用更新分析。", 409);
  const state = readTeardownState(original.coverage);
  const url = state?.inputUrl ?? state?.work?.url;
  if (!state || !url) throw new ResearchError("RETRY_NOT_AVAILABLE", "任务缺少作品链接，请粘贴链接创建拆解。", 409);
  await assertTeardownReady(actor, dependencies.preflight);
  const material = refreshing ? { sourceItemId: state.sourceItemId, ingestJobId: state.ingestJobId } : await (dependencies.prepare ?? prepareTeardownMaterial)(actor, url, original.requestKey);
  const retried = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "ResearchRun" WHERE id = ${runId} FOR UPDATE`;
    const current = await tx.researchRun.findFirst({ where: { ...personalRuns(actor), id: runId } });
    if (!current) throw new ResearchError("NOT_FOUND", "作品拆解不存在或不可访问。", 404);
    if (current.version !== input.version || current.status !== original.status) return current;
    const member = await tx.workspaceMember.findFirst({ where: { workspaceId: actor.workspaceId, userId: actor.userId, role: { not: "VIEWER" }, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } } });
    if (!member) throw new ResearchError("FORBIDDEN", "当前账号没有写入权限。", 403);
    if (material.sourceItemId !== state.sourceItemId || !await tx.sourceItem.findFirst({ where: { id: material.sourceItemId, workspaceId: actor.workspaceId, sourcePlatform: "DOUYIN", status: { not: "ARCHIVED" } } })) throw new ResearchError("SOURCE_NOT_FOUND", "原作品资料不存在或不可访问。", 404);
    const nextState = { ...state, ...material };
    if (refreshing) delete nextState.trendContext;
    delete nextState.transcriptionWait;
    const stage = state.work && state.baseline ? "ANALYSIS" : state.lastStage ?? "MATERIAL";
    nextState.lastStage = stage;
    const result = await tx.researchRun.update({ where: { id: runId }, data: { version: current.version + 1, status: "QUEUED", stage, coverage: json(nextState), aiRunId: null, errorCode: null, errorMessage: null, startedAt: new Date(), finishedAt: null, savedAt: null, resultTitle: refreshing ? current.resultTitle : null, blocks: [], sourceRefs: [] } });
    await tx.auditLog.create({ data: { workspaceId: actor.workspaceId, userId: actor.userId, action: refreshing ? "teardown.refreshed" : "teardown.retried", resourceType: "research_run", resourceId: runId, metadata: { previousVersion: current.version, version: result.version, previousAiRunId: current.aiRunId, sourceItemId: material.sourceItemId } } });
    return result;
  });
  if (retried.status === "QUEUED") await (dependencies.enqueue ?? enqueueTeardown)({ runId, version: retried.version, workspaceId: actor.workspaceId, requestedById: actor.userId }).catch(() => console.warn("TEARDOWN_DISPATCH_PENDING"));
  return getTeardown(actor, runId);
}
type StoredRun = Awaited<ReturnType<typeof db.researchRun.findFirst>>;
function teardownView(run: NonNullable<StoredRun>) {
  const state = readTeardownState(run.coverage);
  return { id: run.id, version: run.version, sessionId: run.sessionId, title: run.resultTitle ?? "抖音作品拆解", status: run.status, stage: run.stage, lastStage: state?.lastStage ?? null, comparisonUnavailable: (state?.work ?? state?.report?.work)?.publicDataStatus === "UNAVAILABLE", createdAt: run.createdAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, errorCode: run.errorCode, errorMessage: run.errorMessage, sourceItemId: state?.sourceItemId ?? null, inputUrl: state?.inputUrl ?? state?.work?.url ?? null, report: state?.report ?? null, videoAssetId: null as string | null, transcriptionProgress: null as string | null };
}
export type TeardownView = ReturnType<typeof teardownView>;
export async function getTeardown(actor: ResearchActor, runId: string) {
  await researchMember(actor);
  const run = await db.researchRun.findFirst({ where: { ...personalRuns(actor), id: runId } });
  if (!run) throw new ResearchError("NOT_FOUND", "作品拆解不存在或不可访问。", 404);
  const view = teardownView(run);
  // Older failed runs predate durable progress checkpoints. Recover proven Material steps.
  if (view.sourceItemId && view.status === "FAILED" && !view.lastStage) {
    const source = await db.sourceItem.findFirst({ where: { id: view.sourceItemId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { status: true, transcript: { select: { id: true } } } });
    view.lastStage = run.aiRunId ? "ANALYSIS" : source?.transcript && run.errorCode !== "TEARDOWN_TIMESTAMPS_REQUIRED" ? "BASELINE" : source?.status === "READY" ? "TRANSCRIPTION" : "MATERIAL";
  }
  if (view.sourceItemId) view.videoAssetId = (await db.sourceAsset.findFirst({ where: { workspaceId: actor.workspaceId, sourceItemId: view.sourceItemId, assetType: "VIDEO", status: "STORED", storageKey: { not: null } }, select: { id: true } }))?.id ?? null;
  if (view.sourceItemId && (view.stage === "TRANSCRIPTION" || view.lastStage === "TRANSCRIPTION")) {
    const job = await db.ingestJob.findFirst({ where: { workspaceId: actor.workspaceId, sourceItemId: view.sourceItemId, jobType: "TRANSCRIBE" }, orderBy: { createdAt: "desc" }, select: { metadata: true } });
    view.transcriptionProgress = transcriptionProgressLabel(job?.metadata);
  }
  return view;
}
export const TEARDOWN_HISTORY_PAGE_SIZE = 8;
export async function listTeardowns(actor: ResearchActor, requestedPage: unknown = 1) {
  await researchMember(actor);
  const inputPage = z.coerce.number().int().min(1).max(1000000).parse(requestedPage);
  return db.$transaction(async tx => {
    const where = personalRuns(actor);
    const total = await tx.researchRun.count({ where });
    const pages = Math.max(1, Math.ceil(total / TEARDOWN_HISTORY_PAGE_SIZE));
    const page = Math.min(inputPage, pages);
    const runs = await tx.researchRun.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * TEARDOWN_HISTORY_PAGE_SIZE, take: TEARDOWN_HISTORY_PAGE_SIZE });
    return { items: runs.map(run => ({ ...teardownView(run), report: null })), total, page, pages, pageSize: TEARDOWN_HISTORY_PAGE_SIZE };
  }, { isolationLevel: "RepeatableRead" });
}
export type TeardownHistoryPage = Awaited<ReturnType<typeof listTeardowns>>;

/** Remove only this user's teardown history; Material and shared Artifact snapshots stay owned by their modules. */
export async function deleteTeardownHistory(actor: ResearchActor, runId: string) {
  await researchMember(actor, true);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "ResearchRun" WHERE id = ${runId} FOR UPDATE`;
    const member = await tx.workspaceMember.findFirst({ where: { workspaceId: actor.workspaceId, userId: actor.userId, role: { not: "VIEWER" }, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } } });
    if (!member) throw new ResearchError("FORBIDDEN", "当前账号没有写入权限。", 403);
    const run = await tx.researchRun.findFirst({ where: { ...personalRuns(actor), id: runId } });
    if (!run) throw new ResearchError("NOT_FOUND", "作品拆解不存在或不可访问。", 404);
    await tx.researchRun.delete({ where: { id: runId } });
    await tx.researchSession.deleteMany({ where: { id: run.sessionId, workspaceId: actor.workspaceId, createdById: actor.userId, entryTemplate: "TEARDOWN", runs: { none: {} } } });
    await tx.auditLog.create({ data: { workspaceId: actor.workspaceId, userId: actor.userId, action: "teardown.deleted", resourceType: "research_run", resourceId: runId, metadata: { sessionId: run.sessionId, version: run.version, sourceItemId: readTeardownState(run.coverage)?.sourceItemId ?? null } } });
    return { deletedId: runId };
  });
}
export async function teardownSessionRun(actor: ResearchActor, sessionId: string) {
  await researchMember(actor);
  return db.researchRun.findFirst({ where: { ...personalRuns(actor), sessionId }, orderBy: { version: "desc" }, select: { id: true } });
}
export async function cancelTeardown(actor: ResearchActor, runId: string) {
  await researchMember(actor, true);
  await getTeardown(actor, runId);
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "ResearchRun" WHERE id = ${runId} FOR UPDATE`;
    const stopped = await tx.researchRun.updateMany({ where: { ...personalRuns(actor), id: runId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "FAILED", stage: "CANCELLED", errorCode: "CANCELLED", errorMessage: "拆解已停止。已下载的资料保留，可重新发起。正在执行的外部请求可能已消耗额度。", finishedAt: new Date() } });
    if (stopped.count) await tx.auditLog.create({ data: { workspaceId: actor.workspaceId, userId: actor.userId, action: "teardown.cancelled", resourceType: "research_run", resourceId: runId } });
  });
  return getTeardown(actor, runId);
}
export async function exportTeardown(actor: ResearchActor, runId: string) {
  const run = await getTeardown(actor, runId);
  if (run.status !== "COMPLETED" || !run.report) throw new ResearchError("REPORT_NOT_READY", "报告尚未生成。", 409);
  return renderTeardownMarkdown(run.report);
}
