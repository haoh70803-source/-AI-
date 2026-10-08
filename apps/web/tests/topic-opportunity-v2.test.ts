import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../server/discovery/service", () => ({ searchDiscoveryContent: vi.fn(async () => ({ cached: true, items: [
  { externalId: "related-a", platform: "DOUYIN", title: "AI 做内容的常见方法", description: null, authorName: "作者甲", publishedAt: "2026-09-25T00:00:00Z", originalUrl: "https://example.test/a", sourceItemId: null },
  { externalId: "related-b", platform: "DOUYIN", title: "AI 帮我整理选题", description: null, authorName: "作者乙", publishedAt: "2026-09-26T00:00:00Z", originalUrl: "https://example.test/b", sourceItemId: null },
] })) }));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { trendStableKey } from "../server/research/trends";
import { startTopicOpportunityV2 } from "../server/research/topic-opportunity-v2-service";
import { executeResearchRun, saveResearchResult } from "../server/research/service";
import { getResearchReadableContent } from "../server/research/read-model";
import { validateTopicOpportunityV2Answer } from "../server/research/topic-opportunity-v2-analysis";
import { parseTopicOpportunityV2State, type TopicOpportunityV2State } from "../server/research/topic-opportunity-v2-contract";

function answer() {
  return { trendMeaning: "当前榜单记录了 AI 话题。", whyNow: "最近一次快照仍能看到它。", whyNowLimit: "榜单观察时间不等于话题发生时间。",
    speakers: [{ author: "作者甲", contentRefs: ["R1"], observation: "从常见方法切入。" }, { author: "作者乙", contentRefs: ["R2"], observation: "从整理选题切入。" }],
    angleClusters: [{ angle: "方法介绍", howItIsTold: "标题强调 AI 做内容。", contentRefs: ["R1"] },
      { angle: "选题整理", howItIsTold: "标题强调整理选题。", contentRefs: ["R2"] }],
    crowded: [{ direction: "两个标题都说 AI 辅助内容工作。", contentRefs: ["R1", "R2"], limitation: "只是本次搜索的两个标题。" }],
    underused: [{ possibleAngle: "结合真实业务资料展示判断过程。", comparedWith: ["R1", "R2"], whyUnderused: "当前候选标题没有提到资料证据。", limitation: "未读取完整作品，不能断言全平台空白。" }],
    businessFit: { audience: "正在做内容的团队", canSpeak: "PARTIAL", reason: "项目和资料提供一个真实问题，但缺少使用结果。", ownEvidenceRefs: ["M1"], missingEvidence: ["自己的使用前后记录"] },
    opportunities: [{ topic: "用自有资料做选题", angle: "展示从资料到选题的判断过程", audience: "内容团队", whyNow: "AI 话题正在榜单中被观察到。",
      difference: "从业务资料出发而不是泛讲工具。", mechanism: "过程演示", ownProof: "展示自己的资料与真实操作过程", flow: ["问题", "资料", "判断", "结果"],
      testVariable: "开头先讲问题还是先展示结果", trendContentRefs: ["R1", "R2"], ownEvidenceRefs: ["M1"], limitation: "还没有自己的效果记录，不宣称效率提升。" }],
    researchLimits: ["相关候选只有标题，没有完整正文。"] };
}

describe("trend to project topic opportunity V2", () => {
  const suffix = randomUUID(); const owner = `trend-v2-owner-${suffix}`; const viewer = `trend-v2-viewer-${suffix}`;
  let workspaceId = ""; let projectId = ""; let sourceId = ""; let stableKey = "";
  const actor = () => ({ workspaceId, userId: owner });
  let calls = 0;
  const runtime = { provider: new MockLLMProvider(() => { calls++; return answer(); }), providerName: "FIXTURE", model: "topic-v2-fixture", mode: "FIXTURE" as const };
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Trend V2", slug: suffix,
      members: { create: [{ userId: owner, role: "OWNER" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "真实内容项目", audience: "内容团队" } })).id;
    sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourcePlatform: "DOUYIN", externalId: `${suffix}-source`,
      sourceType: "TEXT", rawText: "团队正在用自己的业务资料整理选题，并记录每次判断。", title: "自己的业务资料", status: "READY" } })).id;
    const identity = { provider: "FIXTURE", platform: "DOUYIN" as const, trendType: "HOT" as const, externalKey: suffix };
    stableKey = trendStableKey(identity);
    await db.trendSnapshot.create({ data: { workspaceId, ...identity, title: "AI 内容研究", keyword: "AI", rank: 3,
      metrics: {}, windowStart: new Date("2026-09-28"), windowEnd: new Date("2026-09-29") } });
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [owner, viewer] } } }); await db.$disconnect(); });
  it("creates a scoped, cached trend research result from project material and related titles", async () => {
    await expect(startTopicOpportunityV2({ workspaceId, userId: viewer }, stableKey,
      { requestKey: randomUUID(), projectId, materialIds: [sourceId] })).rejects.toMatchObject({ status: 403 });
    await expect(startTopicOpportunityV2(actor(), stableKey,
      { requestKey: randomUUID(), projectId: "foreign", materialIds: [sourceId] })).rejects.toMatchObject({ status: 404 });
    const reserved = await startTopicOpportunityV2(actor(), stableKey, { requestKey: randomUUID(), projectId, materialIds: [sourceId] });
    await executeResearchRun(actor(), reserved.sessionId, reserved.runId, { runtime });
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: reserved.runId } });
    expect(run.status, run.errorMessage || undefined).toBe("COMPLETED");
    const state = parseTopicOpportunityV2State(run.coverage)!;
    expect(state.related).toHaveLength(2); expect(state.ownMaterials[0]?.id).toBe(sourceId);
    expect(state.answer?.opportunities[0]?.ownEvidenceRefs).toEqual(["M1"]);
    await saveResearchResult(actor(), reserved.sessionId, reserved.runId);
    const readable = await getResearchReadableContent(actor(), reserved.runId);
    expect(readable.structured).toMatchObject({ kind: "TOPIC_OPPORTUNITY_V2", opportunities: expect.any(Array) });
    await expect(getResearchReadableContent({ workspaceId, userId: viewer }, reserved.runId)).rejects.toMatchObject({ status: 404 });
    const unchanged = await startTopicOpportunityV2(actor(), stableKey, { requestKey: randomUUID(), projectId, materialIds: [sourceId] });
    expect(unchanged).toMatchObject({ runId: reserved.runId, unchanged: true }); expect(calls).toBe(1);
  });
  it("rejects invented related work references and unearned own evidence", () => {
    const state = { schemaVersion: "topic-opportunity-v2", fingerprint: "a".repeat(64), capturedAt: "2026-09-29", answer: null,
      trend: { stableKey, snapshotId: "trend", title: "AI", platform: "DOUYIN", observedAt: "2026-09-29", rank: 3, keyword: "AI", observedCount: 1 },
      project: { id: projectId, title: "项目", goal: null, audience: null },
      related: [{ ref: "R1", externalId: "related-a", platform: "DOUYIN", title: "A", authorName: "作者甲", publishedAt: null, url: null, bodyExcerpt: null, bodyOrigin: null },
        { ref: "R2", externalId: "related-b", platform: "DOUYIN", title: "B", authorName: "作者乙", publishedAt: null, url: null, bodyExcerpt: null, bodyOrigin: null }],
      ownMaterials: [{ ref: "M1", id: sourceId, title: "资料", version: null, excerpt: "自有资料" }], workMethods: [] } satisfies TopicOpportunityV2State;
    const bad = answer(); bad.opportunities[0]!.trendContentRefs = ["foreign"];
    expect(() => validateTopicOpportunityV2Answer(bad, state)).toThrow("TOPIC_V2_UNKNOWN_CONTENT_REF");
    const wrongAuthor = answer(); wrongAuthor.speakers[0]!.author = "编造作者";
    expect(() => validateTopicOpportunityV2Answer(wrongAuthor, state)).toThrow("TOPIC_V2_AUTHOR_NOT_IN_SEARCH");
    const falseDuration = answer(); falseDuration.whyNow = "该趋势长期占位。";
    expect(() => validateTopicOpportunityV2Answer(falseDuration, state)).toThrow("TOPIC_V2_TREND_PERSISTENCE_UNOBSERVED");
    const falseBreadth = answer(); falseBreadth.trendMeaning = "这是跨平台、跨语境的热词。";
    expect(() => validateTopicOpportunityV2Answer(falseBreadth, state)).toThrow("TOPIC_V2_CROSS_PLATFORM_UNOBSERVED");
  });
});
