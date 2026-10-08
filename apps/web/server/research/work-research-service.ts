import "server-only";
import { z } from "zod";
import { db } from "@content-center/db";
import { buildBenchmarkPerformance } from "../discovery/benchmark-performance";
import { collectExternalContent } from "../discovery/service";
import { externalContentSchema } from "../discovery/schemas";
import { SourceServiceError } from "../source-service";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import { ResearchError, researchMember, type ResearchActor } from "./access";
import { createResearchSession, reserveResearchRun, researchRunExpired } from "./service";
import { collectWorkResearchEvidence } from "./work-research-evidence";
import { parseWorkResearchState } from "./work-research-contract";
import { workResearchSessionKey as sessionKey } from "./work-research-identity";
import { WORK_DEEP_QUESTION } from "./work-research-run";

const requestSchema = z.object({ requestKey: z.string().uuid(), force: z.boolean().optional() }).strict();
/** Collect only the server-scoped saved work; the browser never supplies a URL or external ID. */
export async function collectWorkSourceForResearch(actor: ResearchActor, accountId: string, workId: string) {
  await researchMember(actor, true);
  const work = await db.benchmarkContentSnapshot.findFirst({ where: { id: workId, workspaceId: actor.workspaceId, benchmarkAccountId: accountId, benchmarkAccount: { workspaceId: actor.workspaceId, enabled: true } },
    select: { id: true, platform: true, externalId: true, title: true, url: true, authorName: true, coverUrl: true, publishedAt: true, metadata: true,
      observedAt: true, observations: { orderBy: [{ observedAt: "desc" }, { id: "desc" }], take: 1, select: { observedAt: true, metrics: true } } } });
  if (!work) throw new ResearchError("NOT_FOUND", "作品不存在或不可访问。", 404);
  if (work.platform !== "DOUYIN" && work.platform !== "XIAOHONGSHU") throw new ResearchError("UNSUPPORTED_PLATFORM", "当前平台作品还不能从这里自动收录，请到资料页导入原件。", 409);
  const metric = buildBenchmarkPerformance([work]).items[0]!;
  const url = /^https:\/\//i.test(work.url) ? work.url : null;
  if (!url) throw new ResearchError("MISSING_WORK_URL", "这条作品没有可用的原链接，请到资料页上传原件。", 409);
  const metadata = work.metadata && typeof work.metadata === "object" && !Array.isArray(work.metadata) ? work.metadata as Record<string, unknown> : {};
  const declaredType = typeof metadata.contentType === "string" ? metadata.contentType : "VIDEO";
  const content = externalContentSchema.parse({ externalId: work.externalId, platform: work.platform,
    contentType: ["VIDEO", "IMAGE", "ARTICLE", "UNKNOWN"].includes(declaredType) ? declaredType : "VIDEO",
    title: work.title.slice(0, 500), description: null, authorId: null, authorName: work.authorName?.slice(0, 300) ?? null,
    authorAvatarUrl: null, coverUrl: work.coverUrl && /^https:\/\//i.test(work.coverUrl) ? work.coverUrl.slice(0, 2000) : null,
    originalUrl: url, publishedAt: work.publishedAt?.toISOString() ?? null,
    metrics: { views: metric.views, ...metric.counts }, durationMs: metric.durationMs, sourceProvider: "REDFOX" });
  try {
    const result = await collectExternalContent({ ...actor, content });
    if (result.sourceItem.status === "ARCHIVED") throw new ResearchError("SOURCE_ARCHIVED", "这条作品的资料已归档，请先在资料库恢复。", 409);
    return { sourceItemId: result.sourceItem.id, created: result.created, status: result.sourceItem.status };
  } catch (error) {
    if (error instanceof SourceServiceError) throw new ResearchError(error.code, error.code === "REDFOX_DISABLED" ? "内容服务已禁用，请到设置中启用后再试。" : "内容服务尚未配置，请到设置中连接 RedFox。", 409);
    throw error;
  }
}
async function findSession(actor: ResearchActor, accountId: string, workId: string) {
  return db.researchSession.findUnique({ where: { workspaceId_createdById_requestKey: { workspaceId: actor.workspaceId, createdById: actor.userId, requestKey: sessionKey(actor, accountId, workId) } } });
}
export async function startWorkDeepResearch(actor: ResearchActor, accountId: string, workId: string, value: unknown) {
  await researchMember(actor, true);
  const input = requestSchema.parse(value);
  const evidence = await collectWorkResearchEvidence(actor, accountId, workId);
  if (!evidence.contentText) throw new ResearchError("NO_READABLE_CONTENT", "这条作品目前没有可读正文。请先到资料页主动转录或补充文字。", 409);
  const existing = await findSession(actor, accountId, workId);
  const session = existing ?? await createResearchSession(actor, { title: `${evidence.title.slice(0, 165)} · 作品研究`, entryTemplate: "BENCHMARK", requestKey: sessionKey(actor, accountId, workId) });
  const reserved = await reserveResearchRun(actor, session.id, { question: WORK_DEEP_QUESTION, requestKey: input.requestKey, scope: {
    materialIds: [], benchmarkAccountIds: [accountId], benchmarkWorkId: workId, researchProfile: "WORK_DEEP", researchDepth: "DEEP", forceReanalysis: Boolean(input.force),
    trendKeys: [], notes: "", useOwnArtifacts: false, useCreatorProfile: false,
  } });
  return { sessionId: session.id, runId: reserved.run.id, version: reserved.run.version, status: researchRunExpired(reserved.run) ? "FAILED" : reserved.run.status, created: reserved.created, unchanged: reserved.unchanged };
}

export async function workResearchOverview(actor: ResearchActor, accountId: string, workId: string) {
  await researchMember(actor);
  const [evidence, account, session] = await Promise.all([
    collectWorkResearchEvidence(actor, accountId, workId),
    db.benchmarkAccount.findFirst({ where: { id: accountId, workspaceId: actor.workspaceId, enabled: true }, select: { name: true, platform: true } }),
    findSession(actor, accountId, workId),
  ]);
  if (!account) throw new ResearchError("NOT_FOUND", "账号不存在或不可访问。", 404);
  const runs = session ? await db.researchRun.findMany({ where: { sessionId: session.id, workspaceId: actor.workspaceId, requestedById: actor.userId }, orderBy: { version: "desc" }, take: 30,
    select: { id: true, sessionId: true, version: true, status: true, stage: true, createdAt: true, startedAt: true, aiRunId: true, finishedAt: true, savedAt: true, coverage: true, errorMessage: true, aiRun: { select: { provider: true, model: true } } } }) : [];
  const latest = runs.find(run => run.status === "COMPLETED" && parseWorkResearchState(run.coverage)?.answer) ?? null;
  const state = latest ? parseWorkResearchState(latest.coverage) : null;
  const active = runs.find(run => ["QUEUED", "RUNNING"].includes(run.status) && !researchRunExpired(run)) ?? null;
  return { account, current: evidence, sessionId: session?.id ?? null,
    latest: latest ? { id: latest.id, sessionId: latest.sessionId, version: latest.version, saved: Boolean(latest.savedAt), schemaVersion: state!.schemaVersion,
      finishedAt: latest.finishedAt?.toISOString() ?? latest.createdAt.toISOString(), model: latest.aiRun ? `${latest.aiRun.provider} / ${latest.aiRun.model}` : null,
      evidence: state!.evidence, answer: state!.answer!, currentEvidence: state!.evidence.fingerprint === evidence.fingerprint } : null,
    active: active ? { id: active.id, sessionId: active.sessionId, status: active.status, stage: active.stage } : null,
    failure: runs[0] && runs[0].status === "FAILED" ? runs[0].errorMessage : null,
    history: runs.filter(run => run.status === "COMPLETED").map(run => { const snapshot = parseWorkResearchState(run.coverage); return { id: run.id, sessionId: run.sessionId, version: run.version, saved: Boolean(run.savedAt), date: run.finishedAt?.toISOString() ?? run.createdAt.toISOString(), fingerprint: snapshot?.evidence.fingerprint ?? null }; }) };
}
export type WorkResearchView = Awaited<ReturnType<typeof workResearchOverview>>;

/** Scoped choices for the Research → Project Agent creation handoff. */
export async function workCreationChoices(actor: ResearchActor) {
  await researchMember(actor);
  const [projects, materials] = await Promise.all([
    db.contentProject.findMany({ where: { workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, audience: true, sources: { select: { sourceItemId: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.sourceItem.findMany({ where: { workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } },
      select: { id: true, title: true, sourceType: true }, orderBy: { updatedAt: "desc" }, take: 150 }),
  ]);
  return { projects: projects.map(project => ({ id: project.id, title: project.title, audience: project.audience,
    sourceItemIds: project.sources.map(source => source.sourceItemId) })),
    materials: materials.map(source => ({ id: source.id, title: source.title || "未命名资料", sourceType: source.sourceType })) };
}

/** Reject missing or unreadable own evidence before the Agent is asked to write. */
export async function prepareWorkCreation(actor: ResearchActor, accountId: string, workId: string, runId: string,
  input: { projectId: string; materialIds: string[] }) {
  await researchMember(actor, true);
  const report = await getWorkResearchForExport(actor, accountId, workId, runId);
  if (!("decision" in report.answer)) throw new ResearchError("WORK_DECISION_REQUIRED", "请先升级为新版作品研究，再创作自己的版本。", 409);
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!project) throw new ResearchError("PROJECT_NOT_FOUND", "所选项目不可访问。", 404);
  const ids = [...new Set(input.materialIds)];
  if (ids.length > 8) throw new ResearchError("MATERIAL_REQUIRED", "一次最多选择八条自己的资料。", 400);
  const materials = await db.sourceItem.findMany({ where: { id: { in: ids }, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true, title: true } });
  if (materials.length !== ids.length) throw new ResearchError("MATERIAL_NOT_FOUND", "有资料不存在或不属于当前工作区。", 404);
  const readings = await Promise.all(materials.map(item => getMaterialReadableContent({ ...actor, sourceItemId: item.id })));
  const unreadable = materials.filter((_, index) => !readings[index]?.contentText.trim());
  if (unreadable.length) throw new ResearchError("MATERIAL_UNREADABLE", `${unreadable[0]!.title || "所选资料"}还没有可读正文，请先到资料页完成读取。`, 409);
  return { projectId: project.id, materialIds: ids, researchRunId: report.runId };
}

export async function getWorkResearchForExport(actor: ResearchActor, accountId: string, workId: string, runId: string) {
  await researchMember(actor);
  const run = await db.researchRun.findFirst({ where: { id: runId, workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED", session: { workspaceId: actor.workspaceId, createdById: actor.userId } },
    select: { id: true, sessionId: true, version: true, finishedAt: true, createdAt: true, savedAt: true, coverage: true, aiRun: { select: { provider: true, model: true } } } });
  const state = parseWorkResearchState(run?.coverage);
  if (!run || !state?.answer || state.evidence.accountId !== accountId || state.evidence.workId !== workId) throw new ResearchError("NOT_FOUND", "作品研究版本不存在或不可访问。", 404);
  const account = await db.benchmarkAccount.findFirst({ where: { id: accountId, workspaceId: actor.workspaceId, enabled: true }, select: { name: true } });
  if (!account) throw new ResearchError("NOT_FOUND", "账号不存在或不可访问。", 404);
  return { runId: run.id, sessionId: run.sessionId, version: run.version, saved: Boolean(run.savedAt), finishedAt: (run.finishedAt ?? run.createdAt).toISOString(),
    model: run.aiRun ? `${run.aiRun.provider} / ${run.aiRun.model}` : null, accountName: account.name, evidence: state.evidence, answer: state.answer };
}

/** One scoped lookup for the work library; historical deep runs stay visible as such. */
export async function deepResearchedWorkIds(actor: ResearchActor, accountId: string, workIds: string[]) {
  if (!workIds.length) return new Set<string>();
  const identities = new Map(workIds.map(workId => [sessionKey(actor, accountId, workId), workId]));
  const sessions = await db.researchSession.findMany({ where: { workspaceId: actor.workspaceId, createdById: actor.userId, requestKey: { in: [...identities.keys()] } },
    select: { requestKey: true, runs: { where: { workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1, select: { coverage: true } } } });
  return new Set(sessions.flatMap(session => {
    const workId = identities.get(session.requestKey);
    const state = parseWorkResearchState(session.runs[0]?.coverage);
    return workId && state?.answer && state.evidence.accountId === accountId && state.evidence.workId === workId ? [workId] : [];
  }));
}
