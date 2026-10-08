import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { LLMError, MockLLMProvider } from "@content-center/providers";
import { getWorkResearchForExport, prepareWorkCreation, startWorkDeepResearch, workResearchOverview } from "../server/research/work-research-service";
import { executeResearchRun, saveResearchResult } from "../server/research/service";
import { getResearchReadableContent } from "../server/research/read-model";
import { parseWorkResearchState } from "../server/research/work-research-contract";
import { shareResearchRunToProject } from "../server/research/sharing";
import { sampleAnswer, sampleBody, sampleDecisionPass } from "./work-research-fixture";

describe("versioned work research with actual Material text", () => {
  const suffix = randomUUID(); const owner = `work-owner-${suffix}`; const viewer = `work-viewer-${suffix}`;
  let workspaceId = ""; let accountId = ""; let workId = ""; let sourceId = ""; let sessionId = ""; let firstRunId = ""; let firstCoverage: unknown; let calls = 0;
  const actor = () => ({ workspaceId, userId: owner });
  const runtime = { provider: new MockLLMProvider(input => { calls++; return JSON.parse(input.prompt).task.includes("决策层") ? sampleDecisionPass() : sampleAnswer(); }), providerName: "FIXTURE", model: "work-deep-fixture", mode: "FIXTURE" as const };
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Work research", slug: suffix, members: { create: [{ userId: owner, role: "OWNER" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    accountId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: owner, platform: "DOUYIN", externalAccountId: suffix, name: "真实作品研究对象" } })).id;
    workId = (await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId: suffix, title: "怎样解决真实问题", url: "https://example.test/work", publishedAt: new Date("2026-09-20"), metadata: { durationMs: 18000 }, observations: { create: { metrics: { likes: 12 } } } } })).id;
    sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourcePlatform: "DOUYIN", externalId: suffix, sourceType: "VIDEO", status: "READY",
      transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: sampleBody, segments: [
        { startMs: 0, endMs: 6000, text: "先展示用户的真实问题。" }, { startMs: 6000, endMs: 12000, text: "接着演示操作。" }, { startMs: 12000, endMs: 18000, text: "最后解释结果如何用于自己。" },
      ] } } } })).id;
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [owner, viewer] } } }); await db.$disconnect(); });
  it("creates one paid execution for concurrent requests and saves dynamic blocks", async () => {
    const requestKey = randomUUID(); const requests = await Promise.all([startWorkDeepResearch(actor(), accountId, workId, { requestKey }), startWorkDeepResearch(actor(), accountId, workId, { requestKey: randomUUID() })]);
    expect(new Set(requests.map(item => item.runId)).size).toBe(1); expect(requests.filter(item => item.created)).toHaveLength(1);
    sessionId = requests[0]!.sessionId; firstRunId = requests[0]!.runId;
    await Promise.all([executeResearchRun(actor(), sessionId, firstRunId, { runtime }), executeResearchRun(actor(), sessionId, firstRunId, { runtime })]);
    expect(calls).toBe(2);
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: firstRunId } }); expect(run.status, run.errorMessage || undefined).toBe("COMPLETED");
    const state = parseWorkResearchState(run.coverage)!; expect(state.evidence).toMatchObject({ sourceItemId: sourceId, contentOrigin: "TRANSCRIPT", contentText: sampleBody });
    expect(state.answer?.structureBlocks).toHaveLength(3); expect(run.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ id: "transfer" })]));
    const order = (run.blocks as Array<{ id: string }>).map(block => block.id);
    expect(order.indexOf("transfer")).toBeLessThan(order.indexOf("structure-0"));
    firstCoverage = run.coverage; await saveResearchResult(actor(), sessionId, firstRunId);
  });
  it("reuses unchanged evidence and rejects unauthorized or unreadable work", async () => {
    const same = await startWorkDeepResearch(actor(), accountId, workId, { requestKey: randomUUID() });
    expect(same).toMatchObject({ runId: firstRunId, created: false, unchanged: true }); expect(calls).toBe(2);
    await expect(startWorkDeepResearch({ workspaceId, userId: viewer }, accountId, workId, { requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(workResearchOverview(actor(), "other-account", workId)).rejects.toMatchObject({ status: 404 });
    const emptyId = (await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId: `${suffix}-empty`, title: "只有标题", url: "https://example.test/empty", metadata: {} } })).id;
    await expect(startWorkDeepResearch(actor(), accountId, emptyId, { requestKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
  });
  it("creates a new version only when evidence changes and keeps the saved old snapshot", async () => {
    await db.transcript.update({ where: { sourceItemId: sourceId }, data: { fullText: `${sampleBody} 补充了一个可核验的问题。` } });
    const next = await startWorkDeepResearch(actor(), accountId, workId, { requestKey: randomUUID() }); expect(next.created).toBe(true);
    await executeResearchRun(actor(), sessionId, next.runId, { runtime });
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: next.runId } })).status).toBe("COMPLETED"); expect(calls).toBe(4);
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: firstRunId } })).coverage).toEqual(firstCoverage);
    const historicalExport = await getWorkResearchForExport(actor(), accountId, workId, firstRunId);
    expect(historicalExport.evidence.contentText).toBe(sampleBody);
    await expect(getWorkResearchForExport({ workspaceId, userId: viewer }, accountId, workId, firstRunId)).rejects.toMatchObject({ status: 404 });
    await expect(getWorkResearchForExport(actor(), "foreign-account", workId, firstRunId)).rejects.toMatchObject({ status: 404 });
    await saveResearchResult(actor(), sessionId, next.runId);
    const readable = await getResearchReadableContent(actor(), next.runId);
    expect(readable.text).toContain("需要自己的证据"); expect(readable.text).toContain("问题先行");
    expect(readable.structured).toMatchObject({ kind: "WORK_DEEP", workId, depth: "DEEP", structureBlocks: expect.any(Array) });
    const project = await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "作品机制交接" } });
    const artifact = await shareResearchRunToProject(actor(), next.runId, project.id); expect(artifact.content).toContain("写清自己的用户问题");
  });
  it("prepares creation only with a scoped project, saved research and readable own material", async () => {
    const project = await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "自己的真实项目" } });
    await expect(prepareWorkCreation(actor(), accountId, workId, firstRunId, { projectId: project.id, materialIds: [] })).resolves.toMatchObject({ materialIds: [], researchRunId: firstRunId });
    await expect(prepareWorkCreation(actor(), accountId, workId, firstRunId, { projectId: project.id, materialIds: [sourceId] }))
      .resolves.toMatchObject({ projectId: project.id, materialIds: [sourceId], researchRunId: firstRunId });
    await expect(prepareWorkCreation({ workspaceId, userId: viewer }, accountId, workId, firstRunId, { projectId: project.id, materialIds: [sourceId] }))
      .rejects.toMatchObject({ status: 403 });
    await expect(prepareWorkCreation(actor(), accountId, workId, firstRunId, { projectId: "foreign-project", materialIds: [sourceId] }))
      .rejects.toMatchObject({ status: 404 });
    await expect(prepareWorkCreation(actor(), accountId, workId, firstRunId, { projectId: project.id, materialIds: ["foreign-material"] }))
      .rejects.toMatchObject({ status: 404 });
    const unreadable = await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourcePlatform: "DOUYIN", externalId: `${suffix}-unreadable`, sourceType: "TEXT", status: "READY", title: "只有标题的资料" } });
    await expect(prepareWorkCreation(actor(), accountId, workId, firstRunId, { projectId: project.id, materialIds: [unreadable.id] }))
      .rejects.toMatchObject({ code: "MATERIAL_UNREADABLE", status: 409 });
  });
  it("allows one bounded correction on an explicit reanalysis", async () => {
    const next = await startWorkDeepResearch(actor(), accountId, workId, { requestKey: randomUUID(), force: true });
    expect(next.created).toBe(true);
    let attempts = 0;
    const correcting = { ...runtime, provider: new MockLLMProvider(() => {
      attempts++;
      if (attempts === 1) throw new LLMError("LLM_INVALID_RESPONSE", "WORK_UNSUPPORTED_NUMBER: 99", false);
      return sampleDecisionPass();
    }) };
    await executeResearchRun(actor(), sessionId, next.runId, { runtime: correcting });
    expect(attempts).toBe(2);
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: next.runId } })).status).toBe("COMPLETED");
  });
  it("keeps the previous version when a forced provider execution fails", async () => {
    const latest = await workResearchOverview(actor(), accountId, workId);
    const failed = await startWorkDeepResearch(actor(), accountId, workId, { requestKey: randomUUID(), force: true });
    const unavailable = { ...runtime, provider: new MockLLMProvider(() => { throw new LLMError("LLM_GENERATION_FAILED", "provider unavailable", false); }) };
    await executeResearchRun(actor(), sessionId, failed.runId, { runtime: unavailable });
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: failed.runId } })).status).toBe("FAILED");
    expect((await workResearchOverview(actor(), accountId, workId)).latest?.id).toBe(latest.latest?.id);
  });
});
