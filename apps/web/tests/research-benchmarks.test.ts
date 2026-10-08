import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { researchBenchmarkDetail, researchBenchmarkList } from "../server/research/benchmarks";
import { createResearchSession, executeResearchRun, getResearchSession, reserveResearchRun, saveResearchResult } from "../server/research/service";
import { researchResultLibrary } from "../server/research/read-model";
import { resolveResearchInputs } from "../server/research/inputs";

describe("Research benchmark read boundary", () => {
  const suffix = randomUUID(); const userId = `bench-user-${suffix}`; const outsiderId = `bench-outsider-${suffix}`;
  let workspaceId = ""; let accountId = ""; let runId = "";
  beforeAll(async () => {
    await db.user.createMany({ data: [userId, outsiderId].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Research benchmark", slug: `research-bench-${suffix}`, members: { create: { userId, role: "EDITOR" } } } })).id;
    accountId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, platform: "DOUYIN", externalAccountId: `owner-${suffix}`, name: "测试账号", researchCategory: "知识" } })).id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "DOUYIN", externalId: `work-${suffix}`, title: "作品正文", rawText: "真实正文保留在 Material", status: "READY" } });
    const work = await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId: `work-${suffix}`, title: "真实作品", url: "https://example.test/work", publishedAt: new Date("2026-09-01"), metadata: {}, observations: { create: { metrics: { likes: 12, comments: null } } } } });
    expect(source.externalId).toBe(work.externalId);
    runId = (await db.benchmarkCollectionRun.create({ data: { workspaceId, benchmarkAccountId: accountId, requestedById: userId, status: "COMPLETED", rangeStart: new Date("2026-08-01"), rangeEnd: new Date("2026-09-20"), inRangeCount: 1, seenCount: 1, items: { create: { snapshotId: work.id, titleSnapshot: work.title, urlSnapshot: work.url, metadataSnapshot: {}, publishedAt: work.publishedAt, inRange: true } } } })).id;
    await db.benchmarkMetricObservation.updateMany({ where: { snapshotId: work.id }, data: { collectionRunId: runId } });
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } }); await db.$disconnect(); });
  const actor = () => ({ workspaceId, userId });
  it("lists only scoped accounts and exact linked Material counts", async () => {
    const list = await researchBenchmarkList(actor(), { q: "测试", platform: "DOUYIN", category: "知识" });
    expect(list.items).toHaveLength(1); expect(list.items[0]).toMatchObject({ id: accountId, materialCount: 1, _count: { contentSnapshots: 1 } });
    expect((await researchBenchmarkList(actor(), { q: "不存在" })).items).toEqual([]);
    await expect(researchBenchmarkList({ workspaceId, userId: outsiderId }, {})).rejects.toMatchObject({ status: 403 });
  });
  it("shows actual batch, readable coverage, missing counters and refuses foreign access", async () => {
    const detail = await researchBenchmarkDetail(actor(), accountId, { runId });
    expect(detail).toMatchObject({ workCount: 1, selected: { id: runId }, coverage: { pageItems: 1, pageMaterials: 1, pageReadable: 1, pageVisual: 0 } });
    expect(detail.works[0]).toMatchObject({ counts: { likes: 12, comments: null }, sourceItemId: expect.any(String) });
    expect(detail.performance.find(item => item.metric === "comments")).toMatchObject({ value: null, covered: 0 });
    await expect(researchBenchmarkDetail({ workspaceId, userId: outsiderId }, accountId, {})).rejects.toMatchObject({ status: 403 });
    await expect(researchBenchmarkDetail(actor(), "missing", {})).rejects.toMatchObject({ status: 404 });
  });
  it("runs a private account study through saved batch observations and Material readable content", async () => {
    const session = await createResearchSession(actor(), { title: "账号研究", entryTemplate: "BENCHMARK", requestKey: randomUUID() });
    const scope = { materialIds: [], benchmarkAccountIds: [accountId], notes: "", useCreatorProfile: false };
    const run = await reserveResearchRun(actor(), session.id, { question: "这个账号最近作品的内容有哪些可核验规律？", scope, requestKey: randomUUID() });
    let calls = 0;
    await executeResearchRun(actor(), session.id, run.run.id, { runtime: { provider: new MockLLMProvider(() => { calls++; return { sections: [{ title: "样本观察", text: "选定作品有可读正文，但单条作品不能证明账号整体策略。", sourceRefs: ["B2"], limitation: "仅覆盖本次采集窗口内实际读取作品。" }], accountFindings: [{ accountId, sampleScope: "WINDOW", audienceTask: "理解作品回答的问题", themes: "当前样本是知识说明", openings: "可读正文未标记开头边界", structure: "仅能确认单条正文", directionChange: "缺少可比较的连续正文", transferable: "核对问题与证据", doNotCopy: "不复制独特文案", sourceRefs: ["B1", "B2"], limitation: "窗口内样本不足以概括账号" }] }; }), providerName: "FIXTURE", model: "fixture", mode: "FIXTURE" } });
    const stored = (await getResearchSession(actor(), session.id)).runs[0]!;
    expect(calls).toBe(1); expect(stored.status).toBe("COMPLETED");
    expect(stored.coverage).toMatchObject({ requested: 1, observed: 1, readable: 1, visual: 0, sampling: "WINDOW", aiSampleCount: 1 });
    expect((stored.sourceRefs as Array<{ kind: string; excerpt: string }>).some(source => source.kind === "BENCHMARK_WORK" && source.excerpt.includes("真实正文保留在 Material"))).toBe(true);
    await saveResearchResult(actor(), session.id, run.run.id);
    expect((await researchBenchmarkDetail(actor(), accountId, { tab: "results" })).savedRuns).toMatchObject([{ id: run.run.id }]);
    expect((await researchResultLibrary(actor(), { accountId })).items).toMatchObject([{ id: run.run.id }]);
    const invalid = await reserveResearchRun(actor(), session.id, { question: "无权限账号", scope: { ...scope, benchmarkAccountIds: ["foreign"] }, requestKey: randomUUID() });
    await executeResearchRun(actor(), session.id, invalid.run.id, { runtime: { provider: new MockLLMProvider(() => { calls++; throw new Error("Must not run provider"); }), providerName: "FIXTURE", model: "fixture", mode: "FIXTURE" } });
    expect(calls).toBe(1);
    expect((await getResearchSession(actor(), session.id)).runs.at(-1)).toMatchObject({ status: "FAILED", errorCode: "BENCHMARK_NOT_FOUND" });
  });
  it("compares two accounts without treating different platforms and sample ranges as equivalent", async () => {
    const second = await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, platform: "XIAOHONGSHU", externalAccountId: `other-${suffix}`, name: "另一平台账号" } });
    await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: second.id, platform: "XIAOHONGSHU", externalId: `other-work-${suffix}`, title: "另一平台作品", url: "https://example.test/other", metadata: {}, publishedAt: new Date("2026-08-01") } });
    const scope = { materialIds: [], benchmarkAccountIds: [accountId, second.id], trendKeys: [], notes: "", useCreatorProfile: false, useOwnArtifacts: false };
    const inputs = await resolveResearchInputs(actor(), "比较两个账号", scope, "BENCHMARK");
    const accountRefs = [accountId, second.id].map(id => inputs.sourceRefs.find(source => source.kind === "BENCHMARK_ACCOUNT" && source.objectId === id)!.ref);
    const workRefs = [accountId, second.id].map(id => inputs.sourceRefs[inputs.sourceRefs.findIndex(source => source.kind === "BENCHMARK_ACCOUNT" && source.objectId === id) + 1]!.ref);
    expect(inputs.coverage).toMatchObject({ observed: 2, aiSampleCount: 2, readable: 1 });
    expect(inputs.coverage.gaps.join(" ")).toMatch(/跨平台|时间范围不同/);
    const session = await createResearchSession(actor(), { title: "跨平台比较", entryTemplate: "BENCHMARK", requestKey: randomUUID() });
    const run = await reserveResearchRun(actor(), session.id, { question: "比较两个账号", scope, requestKey: randomUUID() });
    const findings = [accountId, second.id].map((id, index) => ({ accountId: id, sampleScope: index === 0 ? "WINDOW" : "HISTORY", audienceTask: "观察可核对问题", themes: "样本不足以概括账号", openings: "没有足够正文", structure: "不能推断完整结构", directionChange: "没有可比连续样本", transferable: "核对真实证据", doNotCopy: "不复制具体文案", sourceRefs: [accountRefs[index]!, workRefs[index]!], limitation: "平台与采集范围不同" }));
    await executeResearchRun(actor(), session.id, run.run.id, { runtime: { provider: new MockLLMProvider(() => ({ sections: [{ title: "不可直接比较", text: "两个账号的来源与样本范围不同。", sourceRefs: accountRefs, limitation: "不能以当前样本推断账号整体表现。" }], accountFindings: findings })), providerName: "FIXTURE", model: "fixture", mode: "FIXTURE" } });
    expect((await getResearchSession(actor(), session.id)).runs[0]).toMatchObject({ status: "COMPLETED", coverage: { observed: 2, aiSampleCount: 2 } });
  });
});
