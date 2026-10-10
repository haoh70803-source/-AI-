import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { compareAuthorLikes, type TeardownAnalysis, type TeardownWork } from "@content-center/core";
import { RedFoxClient, RedFoxError, LLMError, OpenAICompatibleLLMProvider, type LLMProvider } from "@content-center/providers";
import { IntegrationService } from "@content-center/integrations";
import { collectTeardownPublicData } from "../../worker/src/teardown/capabilities";
import { DelayedError, type Job } from "bullmq";
import { startTeardown, retryTeardown, getTeardown, cancelTeardown, exportTeardown, listTeardowns, deleteTeardownHistory } from "../server/research/teardown/service";
import { createTeardownWorker, failTeardown, processTeardownJob, teardownWorkerAuthorized } from "../../worker/src/teardown/worker";
import { createTeardownQueue, enqueueTeardown, teardownJobId, teardownWorkerReady, type TeardownPayload } from "../../worker/src/teardown/queue";
import { shareResearchRunToProject } from "../server/research/sharing";
import { validateResearchBlocks } from "../server/research/contracts";
import { reserveResearchRun, executeResearchRun, getResearchSession, RESEARCH_LEASE_MS } from "../server/research/service";
import { getResearchResult } from "../server/research/read-model";

describe("independent Douyin teardown chain", () => {
  const suffix = randomUUID(), owner = `td-owner-${suffix}`, editor = `td-editor-${suffix}`, viewer = `td-viewer-${suffix}`;
  let workspaceId = "", sourceItemId = "", projectId = "";
  const actor = () => ({ workspaceId, userId: owner });
  const analysis: TeardownAnalysis = { thesis: "案例服务于清晰的主线", thesisSegmentId: 0, sections: [{ startId: 0, endId: 1, label: "论点", servesThesis: true, summary: "先说明主线，再用案例支持", reason: "两段围绕同一个问题展开" }], strengths: [{ explanation: "开头明确说明主题", segmentId: 0 }], distractions: [], trendAssessment: { status: "UNVERIFIED", explanation: "尚未核实当下热点。", sourceIds: [] }, virality: [{ angle: "注意钩子", explanation: "明确主题为观众建立继续听的预期，这只是内容传播假设。", segmentId: 0 }] };
  const work: TeardownWork = { externalId: "71234567890", authorId: "teacher", authorName: "老师", title: "怎样讲清楚主线", url: "https://www.douyin.com/video/71234567890", capturedAt: new Date().toISOString(), publishedAt: null, metrics: { likes: 500, comments: 10, shares: null, favorites: 20, views: null } };
  const data = { work, baseline: compareAuthorLikes(work, [], work.capturedAt) };
  const prepare = vi.fn(async () => ({ sourceItemId, ingestJobId: null }));
  const enqueue = vi.fn(async () => ({})) as unknown as NonNullable<Parameters<typeof startTeardown>[2]>["enqueue"];
  const start = (key = randomUUID()) => startTeardown(actor(), { shareText: work.url, requestKey: key }, { prepare, enqueue, preflight: async () => {} });
  function job(runId: string, version = 1): Job<TeardownPayload> { return { data: { runId, version, workspaceId, requestedById: owner }, attemptsMade: 0, moveToDelayed: vi.fn(async () => {}), opts: { attempts: 3 } } as unknown as Job<TeardownPayload>; }
  const generate = vi.fn(async () => ({ data: { value: analysis, model: "configured-deepseek", providerRequestId: "td-fixture", usage: { inputTokens: 10, outputTokens: 10 } } }));
  const dependencies = { collectData: vi.fn(async () => data), loadRuntime: vi.fn(async () => ({ provider: { generateStructured: generate } as unknown as LLMProvider, providerName: "DEEPSEEK", model: "configured-deepseek", mode: "FIXTURE" })) };
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, editor, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Teardown disposable acceptance", slug: `td-${suffix}`, members: { create: [{ userId: owner, role: "OWNER" }, { userId: editor, role: "EDITOR" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    sourceItemId = (await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourceType: "VIDEO", sourcePlatform: "DOUYIN", sourceProvider: "REDFOX", sourceUrl: work.url, externalId: work.externalId, status: "PENDING" } })).id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "拆解应用项目" } })).id;
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [owner, editor, viewer] } } }); await db.$disconnect(); });
  it("reserves one scoped run for concurrent requests, isolates reports and rejects generic execution", async () => {
    const key = randomUUID();
    const [first, replay] = await Promise.all([start(key), start(key)]);
    expect(first.id).toBe(replay.id);
    expect(await db.researchRun.count({ where: { workspaceId, requestKey: key } })).toBe(1);
    await expect(startTeardown(actor(), { shareText: "https://www.douyin.com/video/999", requestKey: key }, { prepare, enqueue, preflight: async () => {} })).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
    await expect(getTeardown({ workspaceId, userId: editor }, first.id)).rejects.toMatchObject({ status: 404 });
    await expect(startTeardown({ workspaceId, userId: viewer }, { shareText: work.url, requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(reserveResearchRun(actor(), first.sessionId, { question: "绕过模块", requestKey: randomUUID() })).rejects.toMatchObject({ code: "DEDICATED_MODULE_REQUIRED" });
    await expect(executeResearchRun(actor(), first.sessionId, first.id)).rejects.toMatchObject({ code: "DEDICATED_MODULE_REQUIRED" });
    await db.researchRun.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - RESEARCH_LEASE_MS - 1000) } });
    expect((await getResearchSession(actor(), first.sessionId)).runs[0]?.status).toBe("QUEUED");
    await cancelTeardown(actor(), first.id);
  });
  it("waits for download and transcription, then generates a grounded saved report and hands it to Artifact", async () => {
    const run = await start();
    const queued = job(run.id);
    await expect(processTeardownJob(queued, "token", dependencies)).rejects.toBeInstanceOf(DelayedError);
    expect(queued.moveToDelayed).toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    await db.sourceItem.update({ where: { id: sourceItemId }, data: { status: "READY" } });
    const transcribe = vi.fn(async () => "fake-transcription-job");
    await expect(processTeardownJob(queued, "token", { ...dependencies, transcribe })).rejects.toBeInstanceOf(DelayedError);
    expect(transcribe).toHaveBeenCalledOnce();
    expect((await getTeardown(actor(), run.id)).stage).toBe("TRANSCRIPTION");
    await db.transcript.create({ data: { workspaceId, sourceItemId, provider: "TEST", providerMode: "REAL", fullText: "先说明主线，再用案例解释。", segments: [{ startMs: 0, endMs: 3200, text: "先说明主线。" }, { startMs: 3200, endMs: 6500, text: "再用案例解释。" }] } });
    expect(await processTeardownJob(queued, "token", dependencies)).toMatchObject({ status: "completed" });
    const result = await getTeardown(actor(), run.id);
    expect(result).toMatchObject({ status: "COMPLETED", report: { model: "configured-deepseek", baseline: { multiple: null } } });
    expect(generate).toHaveBeenCalledOnce();
    const prompt = generate.mock.calls[0] as unknown as [{ prompt: string }];
    expect(prompt[0].prompt).toContain('"startMs":3200');
    expect(await exportTeardown(actor(), run.id)).toContain("再用案例解释。（00:03）");
    const shared = await getResearchResult(actor(), run.id);
    expect(validateResearchBlocks(shared.blocks, shared.blocks.flatMap(block => block.type === "sources" ? block.refs : []))).toEqual(shared.blocks);
    const artifact = await shareResearchRunToProject(actor(), run.id, projectId);
    expect(artifact.artifactId).toBeTruthy();
    expect((await shareResearchRunToProject(actor(), run.id, projectId)).artifactId).toBe(artifact.artifactId);
    expect((await listTeardowns(actor())).items.find(row => row.id === run.id)?.report).toBeNull();
    expect(await processTeardownJob(queued, "token", dependencies)).toMatchObject({ status: "stopped" });
    expect(generate).toHaveBeenCalledOnce();
  });
  it("continues through the actual public-data capability when RedFox has not indexed the work", async () => {
    const missingSource = await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourceType: "VIDEO", sourcePlatform: "DOUYIN", sourceUrl: "https://v.douyin.com/missing-fixture/", status: "READY", transcript: { create: { workspaceId, provider: "TEST", providerMode: "REAL", fullText: "先说明主线，再用案例解释。", segments: [{ startMs: 0, endMs: 3200, text: "先说明主线。" }, { startMs: 3200, endMs: 6500, text: "再用案例解释。" }] } } } });
    const status = vi.spyOn(IntegrationService.prototype, "getIntegrationStatus").mockResolvedValue({ provider: "REDFOX", status: "CONFIGURED", configured: true, publicConfig: {}, lastFour: null, updatedAt: null });
    const config = vi.spyOn(IntegrationService.prototype, "getDecryptedIntegrationConfig").mockResolvedValue({ apiKey: "isolated-fixture" });
    const detail = vi.spyOn(RedFoxClient.prototype, "getWorkDetail").mockRejectedValue(new RedFoxError("REDFOX_API_ERROR", "接口执行异常，积分未扣除: 未查询到相关数据：优质库暂未收录该内容。", false, 200, "fixture-no-data", "missing-work-fixture"));
    const authors = vi.spyOn(RedFoxClient.prototype, "getAccountWorks");
    try {
      const run = await startTeardown(actor(), { shareText: missingSource.sourceUrl!, requestKey: randomUUID() }, { prepare: async () => ({ sourceItemId: missingSource.id, ingestJobId: null }), enqueue, preflight: async () => {} });
      const before = generate.mock.calls.length;
      expect(await processTeardownJob(job(run.id), "token", { loadRuntime: dependencies.loadRuntime })).toMatchObject({ status: "completed" });
      const result = await getTeardown(actor(), run.id);
      expect(result).toMatchObject({ status: "COMPLETED", lastStage: "COMPLETED", comparisonUnavailable: true, report: { work: { externalId: null, publicDataStatus: "UNAVAILABLE", metrics: { likes: null, comments: null, shares: null, favorites: null, views: null } }, baseline: { samples: [], median: null, multiple: null } } });
      expect(generate.mock.calls.length - before).toBe(1);
      expect(authors).not.toHaveBeenCalled();
      expect((generate.mock.calls[before] as unknown as [{ prompt: string }])[0].prompt).toContain('"publicDataStatus":"UNAVAILABLE"');
      const markdown = await exportTeardown(actor(), run.id);
      expect(markdown).toContain("数据不足，无法比较作者近期表现");
      expect(markdown).toContain("再用案例解释。（00:03）");
      expect(markdown).not.toContain("数据来源：红狐 · 作品采集");
      const usage = await db.apiUsage.findFirst({ where: { workspaceId, requestId: run.id, operation: "TEARDOWN_WORK_DETAIL" } });
      expect(usage).toMatchObject({ success: false, providerRequestId: "missing-work-fixture", metadata: { errorCode: "REDFOX_API_ERROR", providerCode: "fixture-no-data" } });
      const shared = await getResearchResult(actor(), run.id);
      expect(validateResearchBlocks(shared.blocks, shared.blocks.flatMap(block => block.type === "sources" ? block.refs : []))).toEqual(shared.blocks);
      expect((await shareResearchRunToProject(actor(), run.id, projectId)).artifactId).toBeTruthy();
      detail.mockRejectedValueOnce(new RedFoxError("REDFOX_EMPTY_DATA", "未返回作品数据", false));
      expect(await collectTeardownPublicData(job(run.id).data, missingSource)).toMatchObject({ work: { publicDataStatus: "UNAVAILABLE" } });
    } finally { status.mockRestore(); config.mockRestore(); detail.mockRestore(); authors.mockRestore(); }
  });
  it.each([
    new RedFoxError("REDFOX_AUTH_FAILED", "Key 无效", false),
    new RedFoxError("REDFOX_QUOTA_EXCEEDED", "余额不足", false),
    new RedFoxError("REDFOX_TIMEOUT", "请求超时", true),
    new RedFoxError("REDFOX_INVALID_RESPONSE", "响应无效", false),
    new RedFoxError("REDFOX_API_ERROR", "未知上游错误", false),
  ])("does not treat $code as unavailable public data", async error => {
    const status = vi.spyOn(IntegrationService.prototype, "getIntegrationStatus").mockResolvedValue({ provider: "REDFOX", status: "CONFIGURED", configured: true, publicConfig: {}, lastFour: null, updatedAt: null });
    const config = vi.spyOn(IntegrationService.prototype, "getDecryptedIntegrationConfig").mockResolvedValue({ apiKey: "isolated-fixture" });
    const detail = vi.spyOn(RedFoxClient.prototype, "getWorkDetail").mockRejectedValue(error);
    try {
      await expect(collectTeardownPublicData(job((await start()).id).data, { externalId: null, sourceUrl: work.url })).rejects.toBe(error);
    } finally { status.mockRestore(); config.mockRestore(); detail.mockRestore(); }
  });
  it("preserves identity checks and recovers completed steps for historical failures", async () => {
    const run = await start();
    const status = vi.spyOn(IntegrationService.prototype, "getIntegrationStatus").mockResolvedValue({ provider: "REDFOX", status: "CONFIGURED", configured: true, publicConfig: {}, lastFour: null, updatedAt: null });
    const config = vi.spyOn(IntegrationService.prototype, "getDecryptedIntegrationConfig").mockResolvedValue({ apiKey: "isolated-fixture" });
    const detail = vi.spyOn(RedFoxClient.prototype, "getWorkDetail").mockResolvedValue({ data: { awemeId: "different-work", desc: "别的作品" }, providerCode: "200" });
    try {
      await expect(collectTeardownPublicData(job(run.id).data, { externalId: work.externalId, sourceUrl: work.url })).rejects.toThrow("TEARDOWN_IDENTITY_MISMATCH");
    } finally { status.mockRestore(); config.mockRestore(); detail.mockRestore(); }
    await db.researchRun.update({ where: { id: run.id }, data: { status: "FAILED", stage: "FAILED", errorCode: "REDFOX_API_ERROR", coverage: { schema: "douyin-teardown-v1", sourceItemId, ingestJobId: null, inputUrl: work.url } } });
    expect(await getTeardown(actor(), run.id)).toMatchObject({ status: "FAILED", lastStage: "BASELINE", report: null });
  });
  it("refreshes a completed report in place without downloading or transcribing again", async () => {
    const run = await start();
    await processTeardownJob(job(run.id), "token", dependencies);
    const old = await getTeardown(actor(), run.id), count = await db.researchRun.count({ where: { workspaceId } });
    const beforePrepare = prepare.mock.calls.length;
    await expect(retryTeardown({ workspaceId, userId: editor }, run.id, { version: old.version, mode: "refresh" }, { prepare, enqueue, preflight: async () => {} })).rejects.toMatchObject({ status: 404 });
    const [first, duplicate] = await Promise.all([retryTeardown(actor(), run.id, { version: old.version, mode: "refresh" }, { prepare, enqueue, preflight: async () => {} }), retryTeardown(actor(), run.id, { version: old.version, mode: "refresh" }, { prepare, enqueue, preflight: async () => {} })]);
    expect(first.id).toBe(run.id);
    expect(duplicate.version).toBe(first.version);
    expect(first.version).toBe(old.version + 1);
    expect(first.report?.transcriptId).toBe(old.report?.transcriptId);
    expect(prepare.mock.calls.length).toBe(beforePrepare);
    expect(await db.researchRun.count({ where: { workspaceId } })).toBe(count);
    expect(await processTeardownJob(job(run.id, old.version), "token", dependencies)).toMatchObject({ status: "stopped" });
    expect(await processTeardownJob(job(run.id, first.version), "token", dependencies)).toMatchObject({ status: "completed" });
  });
  it("rejects invented quote IDs and retains the failed attempt without a report", async () => {
    const run = await start();
    generate.mockResolvedValueOnce({ data: { value: { ...analysis, thesisSegmentId: 99 }, model: "configured-deepseek", providerRequestId: "bad-quote", usage: { inputTokens: 10, outputTokens: 10 } } }).mockResolvedValueOnce({ data: { value: { ...analysis, thesisSegmentId: 99 }, model: "configured-deepseek", providerRequestId: "bad-quote", usage: { inputTokens: 10, outputTokens: 10 } } });
    await expect(processTeardownJob(job(run.id), "token", dependencies)).rejects.toThrow();
    expect(await getTeardown(actor(), run.id)).toMatchObject({ status: "FAILED", lastStage: "ANALYSIS", errorCode: "TEARDOWN_UNKNOWN_QUOTE", report: null });
  });
  it.each(["invalid JSON", "invalid fields"])("repairs %s from the actual DeepSeek-compatible adapter with a complete contract", async kind => {
    const bodies: Array<{ messages: Array<{ content: string }>; response_format: { type: string } }> = [];
    const provider = new OpenAICompatibleLLMProvider({ provider: "deepseek", apiKey: "fixture", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" }, { maxRetries: 0, fetch: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      const content = bodies.length === 1 ? kind === "invalid JSON" ? "{broken-json" : JSON.stringify({ mainIdea: "未声明字段" }) : JSON.stringify(analysis);
      return new Response(JSON.stringify({ id: "contract-fixture", model: "deepseek-chat", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 20 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    } });
    const run = await start();
    expect(await processTeardownJob(job(run.id), "token", { collectData: dependencies.collectData, loadRuntime: async () => ({ provider, providerName: "DEEPSEEK", model: "deepseek-chat", mode: "FIXTURE" }) })).toMatchObject({ status: "completed" });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.response_format.type).toBe("json_object");
    expect(bodies[0]!.messages[0]!.content).toContain('"required"');
    for (const key of ["thesis", "thesisSegmentId", "sections", "strengths", "distractions", "virality", "angle", "servesThesis", "segmentId"]) expect(bodies[0]!.messages[0]!.content).toContain(`"${key}"`);
    expect(bodies[0]!.messages[0]!.content).toContain("通读整条作品后做总结分析");
    expect(bodies[0]!.messages[0]!.content).toContain("口语化");
    expect(bodies[0]!.messages[0]!.content).toContain("不要在 virality 输出 segmentId");
    expect(bodies[1]!.messages.at(-1)!.content).toContain("LLM_INVALID_RESPONSE");
    const stored = await db.researchRun.findUniqueOrThrow({ where: { id: run.id }, include: { aiRun: true } });
    expect(stored.aiRun).toMatchObject({ status: "SUCCEEDED", metadata: { responseErrors: [{ code: "LLM_INVALID_RESPONSE" }] } });
    const usage = await db.apiUsage.findMany({ where: { requestId: stored.aiRunId! }, orderBy: { createdAt: "asc" } });
    expect(usage).toMatchObject([{ operation: "TEARDOWN_ANALYSIS", success: false }, { operation: "TEARDOWN_ANALYSIS_CORRECTION", success: true }]);
    expect(await exportTeardown(actor(), run.id)).toContain("再用案例解释。（00:03）");
  });
  it("passes computed interaction evidence into viral analysis and publishes it to the report and project blocks", async () => {
    const promptBodies: Array<{ messages: Array<{ content: string }> }> = [];
    const viral: TeardownAnalysis = { ...analysis, virality: [{ angle: "收藏价值", explanation: "收藏/赞4.0%描述公开互动关系，具体例子可供之后参考；尚不能证明收藏的实际原因。", segmentId: 1 }] };
    const provider = new OpenAICompatibleLLMProvider({ provider: "deepseek", apiKey: "fixture", model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" }, { maxRetries: 0, fetch: async (_input, init) => {
      promptBodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "viral-fixture", model: "deepseek-chat", choices: [{ message: { content: JSON.stringify({ ...viral, virality: viral.virality!.map(row => ({ ...row, sourceIds: [], advisory: "字段混入，不属于已验证报告" })) }) }, finish_reason: "stop" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    } });
    const run = await start();
    expect(await processTeardownJob(job(run.id), "token", { collectData: dependencies.collectData, loadRuntime: async () => ({ provider, providerName: "DEEPSEEK", model: "deepseek-chat", mode: "FIXTURE" }) })).toMatchObject({ status: "completed" });
    expect(promptBodies).toHaveLength(1);
    expect(promptBodies[0]!.messages.at(-1)!.content).toContain('"favoritesPerLike":"4.0%"');
    expect((await getTeardown(actor(), run.id)).report?.analysis.virality).toEqual(viral.virality);
    const stored = await db.researchRun.findUniqueOrThrow({ where: { id: run.id }, include: { aiRun: true } });
    expect(stored.aiRun?.promptVersion).toBe(6);
    expect(stored.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "teardown-virality-0", title: "为什么爆 · 收藏价值", provenance: "AI_INTERPRETATION" })]));
    expect(await exportTeardown(actor(), run.id)).toContain("## 为什么爆");
  });
  it("bounds schema repair and preserves diagnostics when both responses are invalid", async () => {
    const run = await start();
    const before = generate.mock.calls.length;
    const invalid = new LLMError("LLM_INVALID_RESPONSE", "结构不符合要求", false, { providerRequestId: "bad-schema", validationIssues: [{ path: "sections", code: "invalid_type", expected: "array", receivedType: "undefined" }] });
    generate.mockRejectedValueOnce(invalid).mockRejectedValueOnce(invalid);
    await expect(processTeardownJob(job(run.id), "token", dependencies)).rejects.toThrow();
    expect(generate.mock.calls.length - before).toBe(2);
    const stored = await db.researchRun.findUniqueOrThrow({ where: { id: run.id }, include: { aiRun: true } });
    expect(stored).toMatchObject({ status: "FAILED", errorCode: "LLM_INVALID_RESPONSE", aiRun: { errorCode: "LLM_INVALID_RESPONSE", metadata: { responseErrors: [{ code: "LLM_INVALID_RESPONSE" }, { code: "LLM_INVALID_RESPONSE" }] } } });
  });
  it("does not repair model credential errors", async () => {
    const run = await start();
    const before = generate.mock.calls.length;
    generate.mockRejectedValueOnce(new LLMError("LLM_AUTH_FAILED", "凭证无效", false));
    await expect(processTeardownJob(job(run.id), "token", dependencies)).rejects.toThrow();
    expect(generate.mock.calls.length - before).toBe(1);
    expect(await getTeardown(actor(), run.id)).toMatchObject({ status: "FAILED", errorCode: "LLM_AUTH_FAILED" });
  });
  it("retries the same task once for concurrent clicks and rejects stale deliveries and unauthorized retries", async () => {
    const run = await start();
    generate.mockRejectedValueOnce(new LLMError("LLM_AUTH_FAILED", "失败测试", false));
    await expect(processTeardownJob(job(run.id), "token", dependencies)).rejects.toThrow();
    const previousAi = (await db.researchRun.findUniqueOrThrow({ where: { id: run.id } })).aiRunId!;
    await db.researchRun.update({ where: { id: run.id }, data: { createdAt: new Date(Date.now() - 60 * 60 * 1000), startedAt: new Date(Date.now() - 60 * 60 * 1000) } });
    const count = await db.researchRun.count({ where: { workspaceId } });
    const retryDependencies = { prepare, enqueue, preflight: async () => {} };
    await expect(retryTeardown({ workspaceId, userId: editor }, run.id, { version: 1 }, retryDependencies)).rejects.toMatchObject({ status: 404 });
    await expect(retryTeardown({ workspaceId, userId: viewer }, run.id, { version: 1 }, retryDependencies)).rejects.toMatchObject({ status: 403 });
    const [first, replay] = await Promise.all([retryTeardown(actor(), run.id, { version: 1 }, retryDependencies), retryTeardown(actor(), run.id, { version: 1 }, retryDependencies)]);
    expect(first).toMatchObject({ id: run.id, sessionId: run.sessionId, version: 2, status: "QUEUED" });
    expect(replay.id).toBe(run.id);
    expect(await db.researchRun.count({ where: { workspaceId } })).toBe(count);
    expect((await retryTeardown(actor(), run.id, { version: 1 }, retryDependencies)).version).toBe(2);
    await failTeardown(job(run.id).data, new LLMError("LLM_AUTH_FAILED", "旧请求失败", false));
    expect((await getTeardown(actor(), run.id)).status).toBe("QUEUED");
    expect(await processTeardownJob(job(run.id), "token", dependencies)).toMatchObject({ status: "stopped" });
    const collectBefore = dependencies.collectData.mock.calls.length;
    const queue = createTeardownQueue();
    let worker: ReturnType<typeof createTeardownWorker> | undefined;
    try {
      await enqueueTeardown(job(run.id, 2).data);
      expect(await queue.getJob(teardownJobId(job(run.id, 2).data))).toBeTruthy();
      worker = createTeardownWorker(dependencies);
      await worker.waitUntilReady();
      await vi.waitFor(async () => { expect((await getTeardown(actor(), run.id)).status).toBe("COMPLETED"); }, { timeout: 10000 });
    } finally { await worker?.close(); await (await queue.getJob(teardownJobId(job(run.id, 2).data)))?.remove(); await queue.close(); }
    expect(dependencies.collectData.mock.calls.length).toBe(collectBefore);
    expect((await db.aIRun.findUniqueOrThrow({ where: { id: previousAi } })).status).toBe("FAILED");
    await expect(retryTeardown(actor(), run.id, { version: 2 }, retryDependencies)).rejects.toMatchObject({ code: "RETRY_NOT_ALLOWED" });
  });
  it("an in-flight cancelled model response cannot replace the retried task", async () => {
    const run = await start();
    generate.mockImplementationOnce(async () => {
      await cancelTeardown(actor(), run.id);
      await retryTeardown(actor(), run.id, { version: 1 }, { prepare, enqueue, preflight: async () => {} });
      return { data: { value: analysis, model: "configured-deepseek", providerRequestId: "old-attempt", usage: { inputTokens: 10, outputTokens: 10 } } };
    });
    expect(await processTeardownJob(job(run.id), "token", dependencies)).toMatchObject({ status: "stopped" });
    expect(await getTeardown(actor(), run.id)).toMatchObject({ version: 2, status: "QUEUED", report: null });
    expect(await processTeardownJob(job(run.id, 2), "token", dependencies)).toMatchObject({ status: "completed" });
  });
  it("cancellation while the model runs prevents report publication and revoked membership stops worker writes", async () => {
    const run = await start();
    generate.mockImplementationOnce(async () => { await cancelTeardown(actor(), run.id); return { data: { value: analysis, model: "configured-deepseek", providerRequestId: "cancel", usage: { inputTokens: 10, outputTokens: 10 } } }; });
    expect(await processTeardownJob(job(run.id), "token", dependencies)).toMatchObject({ status: "stopped" });
    expect(await getTeardown(actor(), run.id)).toMatchObject({ status: "FAILED", errorCode: "CANCELLED", report: null });
    const revoked = await start();
    await db.workspaceMember.updateMany({ where: { workspaceId, userId: owner }, data: { role: "VIEWER" } });
    expect(await teardownWorkerAuthorized(job(revoked.id).data)).toBe(false);
    await expect(processTeardownJob(job(revoked.id), "token", dependencies)).rejects.toThrow();
    expect((await getTeardown(actor(), revoked.id)).errorCode).toBe("TEARDOWN_FORBIDDEN");
    await db.workspaceMember.updateMany({ where: { workspaceId, userId: owner }, data: { role: "OWNER" } });
  });
  it("resumes a real delayed Redis job after worker restart without duplicating model calls", async () => {
    const fresh = await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourceType: "VIDEO", sourcePlatform: "DOUYIN", status: "PENDING" } });
    const run = await startTeardown(actor(), { shareText: work.url, requestKey: randomUUID() }, { prepare: async () => ({ sourceItemId: fresh.id, ingestJobId: null }), enqueue: enqueueTeardown, preflight: async () => {} });
    const queue = createTeardownQueue();
    let worker = createTeardownWorker(dependencies);
    const countBefore = generate.mock.calls.length;
    try {
      await worker.waitUntilReady();
      expect(await teardownWorkerReady()).toBe(true);
      await vi.waitFor(async () => { expect(await (await queue.getJob(run.id))?.getState()).toBe("delayed"); }, { timeout: 10000 });
      await worker.close();
      await vi.waitFor(async () => { expect(await teardownWorkerReady()).toBe(false); });
      await db.sourceItem.update({ where: { id: fresh.id }, data: { status: "READY" } });
      const transcribe = vi.fn(async () => {
        await db.transcript.create({ data: { workspaceId, sourceItemId: fresh.id, provider: "TEST", providerMode: "REAL", fullText: "先说明主线，再用案例解释。", segments: [{ startMs: 0, endMs: 3200, text: "先说明主线。" }, { startMs: 3200, endMs: 6500, text: "再用案例解释。" }] } });
        return "fixture-transcription";
      });
      worker = createTeardownWorker({ ...dependencies, transcribe });
      await worker.waitUntilReady();
      await enqueueTeardown({ runId: run.id, workspaceId, requestedById: owner });
      await vi.waitFor(async () => { expect((await getTeardown(actor(), run.id)).status).toBe("COMPLETED"); }, { timeout: 15000 });
      expect(transcribe).toHaveBeenCalledOnce();
      expect(generate.mock.calls.length - countBefore).toBe(1);
    } finally { await worker.close(); await (await queue.getJob(run.id))?.remove(); await queue.close(); }
  }, 25000);
  it("paginates all private history in pages of eight and clamps an emptied last page", async () => {
    const historyActor = { workspaceId, userId: editor };
    const ids: string[] = [];
    const base = Date.now();
    for (let index = 0; index < 33; index++) {
      const run = await startTeardown(historyActor, { shareText: work.url, requestKey: randomUUID() }, { prepare, enqueue, preflight: async () => {} });
      await db.researchRun.update({ where: { id: run.id }, data: { createdAt: new Date(base + index) } });
      ids.push(run.id);
    }
    const first = await listTeardowns(historyActor);
    expect(first).toMatchObject({ page: 1, pages: 5, total: 33, pageSize: 8 });
    expect(first.items.map(row => row.id)).toEqual(ids.slice(-8).reverse());
    expect(first.items.every(row => row.report === null)).toBe(true);
    const last = await listTeardowns(historyActor, 5);
    expect(last.items.map(row => row.id)).toEqual([ids[0]]);
    expect((await listTeardowns(historyActor, 999)).page).toBe(5);
    await expect(listTeardowns(historyActor, 0)).rejects.toThrow();
    await expect(deleteTeardownHistory(actor(), ids[0]!)).rejects.toMatchObject({ status: 404 });
    await expect(deleteTeardownHistory({ workspaceId, userId: viewer }, ids[0]!)).rejects.toMatchObject({ status: 403 });
    await deleteTeardownHistory(historyActor, ids[0]!);
    const clamped = await listTeardowns(historyActor, 5);
    expect(clamped).toMatchObject({ page: 4, pages: 4, total: 32 });
    expect(clamped.items).toHaveLength(8);
    expect(await db.researchSession.count({ where: { workspaceId, createdById: editor } })).toBe(32);
  });
  it("deletes only the owned teardown while preserving Material, AI audit and shared Artifact", async () => {
    const run = await start();
    await processTeardownJob(job(run.id), "token", dependencies);
    const stored = await db.researchRun.findUniqueOrThrow({ where: { id: run.id } });
    const shared = await shareResearchRunToProject(actor(), run.id, projectId);
    await deleteTeardownHistory(actor(), run.id);
    await expect(getTeardown(actor(), run.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.researchSession.findUnique({ where: { id: run.sessionId } })).toBeNull();
    expect(await db.sourceItem.findUnique({ where: { id: sourceItemId } })).toBeTruthy();
    expect(await db.transcript.findUnique({ where: { sourceItemId } })).toBeTruthy();
    expect(await db.aIRun.findUnique({ where: { id: stored.aiRunId! } })).toMatchObject({ status: "SUCCEEDED" });
    expect(await db.artifact.findUnique({ where: { id: shared.artifactId } })).toMatchObject({ projectId, sourceResearchRunId: null });
    expect(await db.auditLog.count({ where: { workspaceId, userId: owner, action: "teardown.deleted", resourceId: run.id } })).toBe(1);
    const session = await db.researchSession.create({ data: { workspaceId, createdById: owner, title: "其他研究", entryTemplate: "DIRECT", requestKey: randomUUID() } });
    const other = await db.researchRun.create({ data: { workspaceId, sessionId: session.id, requestedById: owner, requestKey: randomUUID(), requestHash: "other-module", question: "其他研究", version: 1, inputScope: {} } });
    await expect(deleteTeardownHistory(actor(), other.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.researchRun.findUnique({ where: { id: other.id } })).toBeTruthy();
  });
  it("deleting a running history item prevents its in-flight model response from publishing", async () => {
    const run = await start();
    generate.mockImplementationOnce(async () => {
      await deleteTeardownHistory(actor(), run.id);
      return { data: { value: analysis, model: "configured-deepseek", providerRequestId: "deleted-attempt", usage: { inputTokens: 10, outputTokens: 10 } } };
    });
    expect(await processTeardownJob(job(run.id), "token", dependencies)).toMatchObject({ status: "stopped" });
    expect(await db.researchRun.findUnique({ where: { id: run.id } })).toBeNull();
    expect(await processTeardownJob(job(run.id), "token", dependencies)).toMatchObject({ status: "stopped" });
    expect(await db.sourceItem.findUnique({ where: { id: sourceItemId } })).toBeTruthy();
    expect(await db.aIRun.findFirst({ where: { workspaceId, inputSummary: { path: ["runId"], equals: run.id } } })).toMatchObject({ status: "FAILED" });
  });
});
