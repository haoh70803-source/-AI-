import { db, type Prisma } from "@content-center/db";
import { readTeardownState, TEARDOWN_SCHEMA, TEARDOWN_LIMITATION, teardownResearchBlocks, teardownInteractionRatios, teardownPercentage, validateTeardownAnalysis, type TeardownAnalysis, type TeardownReport, type TeardownState, type TeardownStage } from "@content-center/core";
import { DoubaoError, LocalAsrError, LLMError, RedFoxError, teardownAnalysisSchema, teardownSystemPrompt, type LLMStructuredResult, type ProviderResult } from "@content-center/providers";
import { DelayedError, UnrecoverableError, Worker, type Job } from "bullmq";
import { createRedisConnection, queuePrefix } from "../redis-connection";
import { loadConfiguredLLMRuntime } from "../llm-runtime";
import { reserveExperienceUsage } from "../experience-limits";
import { runFreeTask } from "../free-runtime";
import { collectTeardownPublicData, collectTeardownTrendContext, ensureTeardownTranscription, readTeardownMaterial, readTeardownTranscript } from "./capabilities";
import { createTeardownQueue, teardownJobId, TEARDOWN_QUEUE, type TeardownPayload } from "./queue";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const activeStatuses = ["QUEUED", "RUNNING"] as const;
export const TEARDOWN_DEADLINE_MS = 45 * 60 * 1000;
const TRANSCRIPTION_WAIT_MS = 7 * 60 * 60_000;
/** Material has its own transcription budget; waiting must not consume the report's analysis budget. */
export function teardownExecutionExpired(run: { startedAt: Date | null; createdAt: Date; coverage: unknown }, now = Date.now()) {
  const started = (run.startedAt ?? run.createdAt).getTime();
  const wait = readTeardownState(run.coverage)?.transcriptionWait;
  let waitingMs = 0;
  if (wait) {
    const from = Date.parse(wait.startedAt), until = wait.finishedAt ? Date.parse(wait.finishedAt) : now;
    if (Number.isFinite(from) && Number.isFinite(until) && from >= started && until >= from && until <= now) {
      waitingMs = until - from;
      if (waitingMs > TRANSCRIPTION_WAIT_MS) return true;
    }
  }
  return now - started - waitingMs > TEARDOWN_DEADLINE_MS;
}
function scope(payload: TeardownPayload) {
  return { id: payload.runId, version: payload.version ?? 1, workspaceId: payload.workspaceId, requestedById: payload.requestedById, session: { workspaceId: payload.workspaceId, createdById: payload.requestedById, entryTemplate: "TEARDOWN" } };
}
export async function teardownWorkerAuthorized(payload: TeardownPayload) {
  return Boolean(await db.workspaceMember.findFirst({ where: { workspaceId: payload.workspaceId, userId: payload.requestedById, role: { not: "VIEWER" }, disabledAt: null, user: { disabledAt: null }, workspace: { disabledAt: null } }, select: { id: true } }));
}
async function checkpoint(payload: TeardownPayload, state: TeardownState, stage: TeardownStage) {
  if (!await teardownWorkerAuthorized(payload)) throw new UnrecoverableError("TEARDOWN_FORBIDDEN");
  state.lastStage = stage;
  if (stage === "TRANSCRIPTION" && !state.transcriptionWait) state.transcriptionWait = { startedAt: new Date().toISOString() };
  else if (stage !== "TRANSCRIPTION" && state.transcriptionWait && !state.transcriptionWait.finishedAt) state.transcriptionWait.finishedAt = new Date().toISOString();
  const result = await db.researchRun.updateMany({ where: { ...scope(payload), status: { in: [...activeStatuses] } }, data: { status: "RUNNING", stage, coverage: json(state), errorCode: null, errorMessage: null } });
  if (!result.count) throw new UnrecoverableError("TEARDOWN_STOPPED");
}
async function delay(job: Job<TeardownPayload>, token?: string): Promise<never> {
  await job.moveToDelayed(Date.now() + 3000, token);
  throw new DelayedError();
}
const messages: Record<string, string> = {
  TEARDOWN_TIMESTAMPS_REQUIRED: "转写没有完整、有效的时间点。请在资料页重新转写后重试。",
  TEARDOWN_CONTENT_TOO_LONG: "正文超过单次拆解范围（6万字或2500条转写记录），请先裁剪为单条作品。",
  TEARDOWN_MATERIAL_FAILED: "作品下载未完成，请在资料页处理失败任务后重试。",
  TEARDOWN_TRANSCRIPTION_FAILED: "转写未完成，请在资料页处理失败任务后重试。",
  TEARDOWN_TIMEOUT: "转写等待或报告处理已超过各自时限，请查看资料任务状态后重试。已完成的转写片段会保留。",
  TEARDOWN_IDENTITY_MISMATCH: "作品数据与下载的作品标识不一致，已停止分析。",
  TEARDOWN_REDFOX_NOT_CONFIGURED: "请在系统设置中配置或启用红狐 API。",
  TEARDOWN_INCOMPLETE_SEGMENTS: "模型返回的分段没有完整覆盖原文，请重试。",
  TEARDOWN_UNKNOWN_QUOTE: "模型引用了不存在的原文编号，请重试。",
  TEARDOWN_UNSUPPORTED_TREND: "模型的热点关联缺少可核实的来源，请重试。",
  TEARDOWN_DUPLICATE_INSIGHT: "传播分析重复了内容优点，请重新生成独立分析。",
  TEARDOWN_UNSUPPORTED_NUMBER: "模型返回了没有证据支持的数字，请重试。",
  TEARDOWN_FORBIDDEN: "当前账号已失去此工作区的写入权限。",
  TEARDOWN_MATERIAL_NOT_FOUND: "资料已归档或不可访问。",
};
export async function failTeardown(payload: TeardownPayload, error: unknown) {
  const providerError = error instanceof LLMError || error instanceof RedFoxError || error instanceof DoubaoError || error instanceof LocalAsrError;
  const code = providerError ? error.code : error instanceof Error && messages[error.message] ? error.message : "TEARDOWN_FAILED";
  await db.researchRun.updateMany({ where: { ...scope(payload), status: { in: [...activeStatuses] } }, data: { status: "FAILED", stage: "FAILED", errorCode: code, errorMessage: providerError ? error.message : messages[code] ?? "作品拆解未完成，请检查服务配置或重试。", finishedAt: new Date() } });
}
export type TeardownDependencies = {
  readMaterial?: typeof readTeardownMaterial; transcribe?: typeof ensureTeardownTranscription;
  collectData?: typeof collectTeardownPublicData; loadRuntime?: typeof loadConfiguredLLMRuntime;
  collectTrends?: typeof collectTeardownTrendContext;
};

/** Durable state machine. Waiting for Material never occupies the ingest/transcription queue. */
export async function processTeardownJob(job: Job<TeardownPayload>, token?: string, dependencies: TeardownDependencies = {}) {
  const payload = job.data;
  const run = await db.researchRun.findFirst({ where: scope(payload) });
  if (!run || !activeStatuses.includes(run.status as typeof activeStatuses[number])) return { status: "stopped" };
  let aiRunId: string | undefined;
  let release: (() => Promise<void>) | undefined;
  try {
    if (!await teardownWorkerAuthorized(payload)) throw new Error("TEARDOWN_FORBIDDEN");
    if (teardownExecutionExpired(run)) throw new Error("TEARDOWN_TIMEOUT");
    const state = readTeardownState(run.coverage);
    if (!state) throw new UnrecoverableError("TEARDOWN_INVALID_STATE");
    await db.researchRun.updateMany({ where: { ...scope(payload), status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() } });
    const material = await (dependencies.readMaterial ?? readTeardownMaterial)(payload, state.sourceItemId);
    await checkpoint(payload, state, material.status === "READY" ? "TRANSCRIPTION" : "MATERIAL");
    const transcript = readTeardownTranscript(material);
    if (!transcript) {
      const ingest = material.ingestJobs.find(row => row.jobType === "PROCESS_MEDIA");
      if (material.status !== "READY" && ingest && ["FAILED", "CANCELLED"].includes(ingest.status)) throw new Error("TEARDOWN_MATERIAL_FAILED");
      if (material.status === "FAILED") throw new Error("TEARDOWN_MATERIAL_FAILED");
      if (material.status !== "READY") { await checkpoint(payload, state, "MATERIAL"); return await delay(job, token); }
      const latestTranscription = material.ingestJobs.find(row => row.jobType === "TRANSCRIBE");
      if (latestTranscription && ["FAILED", "CANCELLED", "SUCCEEDED"].includes(latestTranscription.status)) throw new Error("TEARDOWN_TRANSCRIPTION_FAILED");
      state.transcriptionJobId = latestTranscription?.id ?? await (dependencies.transcribe ?? ensureTeardownTranscription)(payload, material.id);
      await checkpoint(payload, state, "TRANSCRIPTION");
      return await delay(job, token);
    }
    if (!state.work || !state.baseline) {
      await checkpoint(payload, state, "BASELINE");
      const data = await (dependencies.collectData ?? collectTeardownPublicData)(payload, material);
      state.work = data.work; state.baseline = data.baseline;
      await checkpoint(payload, state, "ANALYSIS");
    } else await checkpoint(payload, state, "ANALYSIS");
    if (!state.trendContext) {
      state.trendContext = await (dependencies.collectTrends ?? collectTeardownTrendContext)(payload);
      await checkpoint(payload, state, "ANALYSIS");
    }
    const runtime = await (dependencies.loadRuntime ?? loadConfiguredLLMRuntime)(payload.workspaceId);
    if (runtime.mode === "MOCK" || runtime.providerName === "MOCK") throw new LLMError("LLM_NOT_CONFIGURED", "请配置真实模型 API 后进行拆解。", false);
    release = await reserveExperienceUsage({ workspaceId: payload.workspaceId, userId: payload.requestedById, operation: "AI" });
    // A stalled delivery can leave an interrupted AIRun. Preserve it as a failed attempt.
    if (run.aiRunId) await db.aIRun.updateMany({ where: { id: run.aiRunId, workspaceId: payload.workspaceId, userId: payload.requestedById, status: "RUNNING" }, data: { status: "FAILED", errorCode: "INTERRUPTED", finishedAt: new Date() } });
    const ai = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT id FROM "ResearchRun" WHERE id = ${payload.runId} FOR UPDATE`;
      if (!await tx.researchRun.findFirst({ where: { ...scope(payload), status: { in: [...activeStatuses] } } })) throw new UnrecoverableError("TEARDOWN_STOPPED");
      const created = await tx.aIRun.create({ data: { workspaceId: payload.workspaceId, userId: payload.requestedById, action: "ANALYZE_SOURCES", provider: runtime.providerName, model: runtime.model, promptVersion: 6, status: "RUNNING", inputSummary: { module: "teardown", runId: run.id, version: run.version, sourceItemId: material.id, transcriptId: transcript.id, segmentCount: transcript.segments.length }, metadata: { schema: TEARDOWN_SCHEMA, version: run.version, requestedModel: runtime.requestedModel ?? runtime.model } } });
      await tx.researchRun.update({ where: { id: run.id }, data: { aiRunId: created.id } });
      return created;
    });
    aiRunId = ai.id;
    const ratios = teardownInteractionRatios(state.work.metrics);
    const interactionRatios = { favoritesPerLike: teardownPercentage(ratios.favorites), sharesPerLike: teardownPercentage(ratios.shares), commentsPerLike: teardownPercentage(ratios.comments) };
    const prompt = JSON.stringify({ work: state.work, trendContext: state.trendContext, comparison: { sampleCount: state.baseline.samples.length, median: state.baseline.median, multiple: state.baseline.multiple, gaps: state.baseline.gaps, interactionRatios }, transcript: transcript.segments });
    const metricEvidence = { metrics: state.work.metrics, publishedAt: state.work.publishedAt, capturedAt: state.work.capturedAt, median: state.baseline.median, multiple: state.baseline.multiple, sampleCount: state.baseline.samples.length, interactionRatios };
    let generated: ProviderResult<LLMStructuredResult<TeardownAnalysis>> | undefined;
    let analysis: TeardownAnalysis | undefined;
    let correction = "";
    const responseErrors: Array<{ attempt: number; code: string; details?: LLMError["details"] }> = [];
    // The provider's JSON/schema validation and our evidence validation share one bounded repair path.
    for (let attempt = 0; attempt < 2; attempt++) {
      await checkpoint(payload, state, "ANALYSIS");
      const correctionRelease = attempt ? await reserveExperienceUsage({ workspaceId: payload.workspaceId, userId: payload.requestedById, operation: "AI", quotaOnly: true }) : undefined;
      const operation = attempt ? "TEARDOWN_ANALYSIS_CORRECTION" : "TEARDOWN_ANALYSIS";
      try {
        try {
          generated = await runtime.provider.generateStructured({ systemPrompt: teardownSystemPrompt, prompt: `${prompt}${correction}`, maxCompletionTokens: 16384, structuredOutput: { preferJsonSchema: true, schemaName: "douyin_teardown" } }, teardownAnalysisSchema);
        } catch (error) {
          if (error instanceof LLMError) await db.apiUsage.create({ data: { workspaceId: payload.workspaceId, userId: payload.requestedById, provider: runtime.providerName, operation, requestId: ai.id, providerRequestId: error.details.providerRequestId, success: false, units: 1, metadata: json({ runId: run.id, version: run.version, errorCode: error.code, ...error.details }) } });
          throw error;
        }
        await db.apiUsage.create({ data: { workspaceId: payload.workspaceId, userId: payload.requestedById, provider: runtime.providerName, operation, requestId: ai.id, providerRequestId: generated.data.providerRequestId, success: true, units: 1, inputTokens: generated.data.usage?.inputTokens, outputTokens: generated.data.usage?.outputTokens, metadata: { runId: run.id, version: run.version, model: generated.data.model } } });
        analysis = validateTeardownAnalysis(generated.data.value, transcript.segments, metricEvidence, state.trendContext);
        break;
      } catch (error) {
        const correctable = error instanceof LLMError ? error.code === "LLM_INVALID_RESPONSE" : error instanceof Error && ["TEARDOWN_INCOMPLETE_SEGMENTS", "TEARDOWN_UNKNOWN_QUOTE", "TEARDOWN_UNSUPPORTED_NUMBER", "TEARDOWN_UNSUPPORTED_TREND", "TEARDOWN_DUPLICATE_INSIGHT"].includes(error.message);
        if (!correctable) throw error;
        const diagnostic = { attempt: attempt + 1, code: error instanceof LLMError ? error.code : (error as Error).message, ...(error instanceof LLMError ? { details: error.details } : error instanceof Error && error.cause ? { evidenceErrors: error.cause } : {}) };
        responseErrors.push(diagnostic);
        await db.aIRun.update({ where: { id: ai.id }, data: { metadata: json({ schema: TEARDOWN_SCHEMA, version: run.version, requestedModel: runtime.requestedModel ?? runtime.model, responseErrors }) } });
        if (attempt) throw error;
        correction = `\n上次输出未通过校验：${JSON.stringify(diagnostic)}。严格按照 system 中的 JSON Schema 和字段格式重新输出一个完整对象。完整覆盖编号0至${transcript.segments.length - 1}，原文引用只能使用这些编号；不能增加无依据数字，点赞必须保持整数原值，百分比按输入字符串引用，不能改写成万、千、约数或自行换算。不能复制 strengths；热点 sourceIds 只放在 trendAssessment，不要输出包装字段或 Markdown。`;
      } finally { await correctionRelease?.(); }
    }
    if (!analysis || !generated) throw new Error("TEARDOWN_INCOMPLETE_SEGMENTS");
    const report: TeardownReport = { schema: TEARDOWN_SCHEMA, sourceItemId: material.id, transcriptId: transcript.id, work: state.work, baseline: state.baseline, transcript: transcript.segments, analysis, trendContext: state.trendContext, generatedAt: new Date().toISOString(), model: generated.data.model ?? runtime.model };
    const blocks = teardownResearchBlocks(report);
    state.report = report;
    state.lastStage = "COMPLETED";
    if (!await teardownWorkerAuthorized(payload)) throw new Error("TEARDOWN_FORBIDDEN");
    const published = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT id FROM "ResearchRun" WHERE id = ${payload.runId} FOR UPDATE`;
      const authorized = await tx.workspaceMember.findFirst({ where: { workspaceId: payload.workspaceId, userId: payload.requestedById, role: { not: "VIEWER" }, disabledAt: null, user: { disabledAt: null }, workspace: { disabledAt: null } } });
      const updated = authorized ? await tx.researchRun.updateMany({ where: { ...scope(payload), status: { in: [...activeStatuses] } }, data: { status: "COMPLETED", stage: "COMPLETED", coverage: json(state), blocks: json(blocks), sourceRefs: json(blocks.flatMap(block => block.type === "sources" ? block.refs : [])), resultTitle: `${report.work.title.slice(0, 170)} · 作品拆解`, savedAt: new Date(), finishedAt: new Date(), errorCode: null, errorMessage: null } }) : { count: 0 };
      await tx.aIRun.update({ where: { id: ai.id }, data: { status: updated.count ? "SUCCEEDED" : "FAILED", outputJson: updated.count ? json(analysis) : undefined, errorCode: updated.count ? null : "TEARDOWN_STOPPED", providerRequestId: generated.data.providerRequestId, inputTokens: generated.data.usage?.inputTokens, outputTokens: generated.data.usage?.outputTokens, finishedAt: new Date() } });
      if (updated.count) {
        await tx.researchSession.update({ where: { id: run.sessionId }, data: { title: `${report.work.title.slice(0, 170)} · 作品拆解` } });
        await tx.auditLog.create({ data: { workspaceId: payload.workspaceId, userId: payload.requestedById, action: "teardown.completed", resourceType: "research_run", resourceId: run.id, metadata: { sourceItemId: material.id, aiRunId: ai.id, limitation: TEARDOWN_LIMITATION } } });
      }
      return Boolean(updated.count);
    });
    return { status: published ? "completed" : "stopped", runId: run.id };
  } catch (error) {
    if (error instanceof DelayedError) throw error;
    if (aiRunId) {
      await db.aIRun.updateMany({ where: { id: aiRunId, workspaceId: payload.workspaceId, status: "RUNNING" }, data: { status: "FAILED", errorCode: error instanceof LLMError ? error.code : error instanceof Error ? error.message : "TEARDOWN_FAILED", errorMessage: error instanceof LLMError ? error.message : null, finishedAt: new Date() } });
    }
    if ((error instanceof LLMError || error instanceof RedFoxError) && error.retryable && job.attemptsMade + 1 < 3) throw error;
    await failTeardown(payload, error);
    throw new UnrecoverableError("TEARDOWN_FAILED");
  } finally { await release?.(); }
}

export function createTeardownWorker(dependencies: TeardownDependencies = {}) {
  const worker = new Worker<TeardownPayload>(TEARDOWN_QUEUE, (job, token) => runFreeTask(() => processTeardownJob(job, token, dependencies)), { connection: createRedisConnection(), prefix: queuePrefix(), concurrency: 1 });
  worker.on("error", () => console.warn("TEARDOWN_WORKER_ERROR"));
  worker.on("failed", (job, error) => { if (job && (error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 3))) void failTeardown(job.data, error).catch(() => console.warn("TEARDOWN_FAILURE_STATE_UPDATE_FAILED")); });
  return worker;
}

/** Reconcile DB reservations after queue dispatch failure or restart, without a browser heartbeat. */
export function startTeardownReconciler() {
  let stopped = false, running = false, cursor: string | undefined;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    const queue = createTeardownQueue();
    try {
      const runs = await db.researchRun.findMany({ where: { status: { in: [...activeStatuses] }, session: { entryTemplate: "TEARDOWN" }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: 50 });
      cursor = runs.length === 50 ? runs.at(-1)?.id : undefined;
      for (const run of runs) {
        const payload = { runId: run.id, workspaceId: run.workspaceId, requestedById: run.requestedById, version: run.version };
        if (teardownExecutionExpired(run)) { await failTeardown(payload, new Error("TEARDOWN_TIMEOUT")); continue; }
        const jobId = teardownJobId(payload);
        const existing = await queue.getJob(jobId);
        if (!existing) await queue.add("TEARDOWN", payload, { jobId, attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 } });
        else if (["failed", "completed"].includes(await existing.getState())) await failTeardown(payload, new Error("TEARDOWN_FAILED"));
      }
    } catch { console.warn("TEARDOWN_RECONCILIATION_FAILED"); }
    finally { await queue.close().catch(() => undefined); running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 30000); timer.unref(); void tick();
  return () => { stopped = true; clearInterval(timer); };
}
