import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { enqueueContentIngestMock } = vi.hoisted(() => ({enqueueContentIngestMock: vi.fn().mockResolvedValue(undefined)}));
vi.mock("@content-center/worker/queue", () => ({ enqueueContentIngest: enqueueContentIngestMock }));
vi.mock("@content-center/worker/queue-producer", () => ({ enqueueContentIngest: enqueueContentIngestMock }));

import { db } from "@content-center/db";
import { MockLLMProvider, type ProviderTrendItem, type TrendProvider } from "@content-center/providers";
import { startIdeaProject } from "../server/discovery/service";
import type { ExternalContentInput } from "../server/discovery/schemas";
import { listTrendOpportunities } from "../server/discovery/trends/read-model";
import { candidateTopicsOutputSchema } from "../server/discovery/trends/schemas";
import { clearTrendCacheForTests, refreshTrends } from "../server/discovery/trends/service";
import { generateTopicCandidates, saveCandidateTrendIdea } from "../server/discovery/trends/topic-service";

function trend(platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL", type: "HOT" | "SURGING" | "DARK_HORSE", id: string, title: string, rank: number): ProviderTrendItem {
  return { externalKey: `${platform}:${type}:${id}`, platform, type, title, keyword: title, rank, trendScore: null, metrics: { contentCount: null, engagement: null, growth: null, likes: null, comments: null }, sourceProvider: "REDFOX" };
}

describe("Content Discovery D3", () => {
  const suffix = randomUUID();
  const ownerId = `trend-owner-${suffix}`;
  const otherOwnerId = `trend-other-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let rank = 18;
  const calls = { hot: 0, surging: 0, darkHorse: 0 };
  const provider: TrendProvider = {
    async getHot(input) {
      calls.hot += 1;
      const item = input.platform === "DOUYIN" ? trend("DOUYIN", "HOT", "ai-dy", "#AI 办公", rank)
        : input.platform === "XIAOHONGSHU" ? trend("XIAOHONGSHU", "HOT", "ai-xhs", "AI，办公", 5)
          : trend("GLOBAL", "HOT", "economy", "低空经济", 2);
      return { items: [item], providerRequestId: `hot-${calls.hot}` };
    },
    async getSurging() { calls.surging += 1; return { items: [trend("DOUYIN", "SURGING", "surge", "AI 工作流", 3)] }; },
    async getDarkHorse() { calls.darkHorse += 1; return { items: [trend("XIAOHONGSHU", "DARK_HORSE", "horse", "AI 工具", 1)] }; },
  };
  const now = new Date();
  const supportingContent: ExternalContentInput = {
    externalId: "support-1", platform: "DOUYIN", contentType: "VIDEO", title: "AI 办公参考", description: "外部内容声明需要核实", authorId: "author", authorName: "创作者", authorAvatarUrl: null, coverUrl: null,
    originalUrl: "https://www.douyin.com/video/support-1", publishedAt: "2026-09-01T00:00:00.000Z", metrics: { views: null, likes: 10, comments: null, shares: null, favorites: null }, durationMs: null, sourceProvider: "REDFOX",
  };

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Trend Owner", email: `${ownerId}@example.test` }, { id: otherOwnerId, name: "Other Trend Owner", email: `${otherOwnerId}@example.test` }] });
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: "Trend Workspace", slug: `trend-${suffix}`, members: { create: { userId: ownerId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Other Trend Workspace", slug: `trend-other-${suffix}`, members: { create: { userId: otherOwnerId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id; otherWorkspaceId = other.id;
  });

  beforeEach(async () => {
    clearTrendCacheForTests(); calls.hot = 0; calls.surging = 0; calls.darkHorse = 0; rank = 18;
    await db.contentIdea.deleteMany({ where: { workspaceId } });
    await db.aIRun.deleteMany({ where: { workspaceId } });
    await db.contentProject.deleteMany({ where: { workspaceId } });
    await db.sourceItem.deleteMany({ where: { workspaceId } });
    await db.trendSnapshot.deleteMany({ where: { workspaceId } });
    await db.apiUsage.deleteMany({ where: { workspaceId } });
    await db.auditLog.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherOwnerId] } } });
    await db.$disconnect();
  });

  it("stores snapshots, merges exact cross-platform keywords and reuses the 20 minute cache", async () => {
    const first = await refreshTrends({ workspaceId, userId: ownerId, window: "TODAY", platform: "ALL", type: "HOT", force: false, now }, { provider });
    expect(first.items).toEqual(expect.arrayContaining([expect.objectContaining({ platform: "CROSS_PLATFORM", title: "#AI 办公", state: "FIRST_SEEN", rankDelta: null })]));
    expect(calls.hot).toBe(3);
    const snapshotCount = await db.trendSnapshot.count({ where: { workspaceId } });
    const second = await refreshTrends({ workspaceId, userId: ownerId, window: "TODAY", platform: "ALL", type: "HOT", force: false, now }, { provider });
    expect(second.cached).toBe(true);
    expect(calls.hot).toBe(3);
    expect(await db.trendSnapshot.count({ where: { workspaceId } })).toBe(snapshotCount);
    expect(await listTrendOpportunities({ workspaceId: otherWorkspaceId, window: "TODAY", platform: "ALL", type: "HOT", now })).toEqual([]);
  });

  it("computes rank delta as previous minus current and keeps first-seen explicit", async () => {
    await refreshTrends({ workspaceId, userId: ownerId, window: "TODAY", platform: "DOUYIN", type: "HOT", force: true, now }, { provider });
    rank = 6;
    const later = new Date(now.getTime() + 60_000);
    const second = await refreshTrends({ workspaceId, userId: ownerId, window: "TODAY", platform: "DOUYIN", type: "HOT", force: true, now: later }, { provider });
    expect(second.items[0]).toMatchObject({ previousRank: 18, rank: 6, rankDelta: 12, state: "RISING" });
  });

  it("validates structured candidate output and saves only after an explicit user choice", async () => {
    const refreshed = await refreshTrends({ workspaceId, userId: ownerId, window: "TODAY", platform: "DOUYIN", type: "HOT", force: true, now }, { provider });
    const opportunity = refreshed.items[0]!;
    const sourceItem = await db.sourceItem.create({
      data: {
        workspaceId,
        createdById: ownerId,
        sourceType: "VIDEO",
        sourcePlatform: "DOUYIN",
        sourceUrl: supportingContent.originalUrl,
        canonicalUrl: supportingContent.originalUrl,
        externalId: supportingContent.externalId,
        sourceProvider: "REDFOX",
        title: supportingContent.title,
        status: "READY",
      },
    });
    const fixture = () => ({ candidates: [0, 1, 2].map((index) => ({ title: `候选选题 ${index + 1}`, angle: "从流程而非工具切入", targetAudience: "内容团队", coreConflict: "工具增加与效率下降", whyNow: "当前榜单出现相关讨论", differenceFromSources: "不复述来源标题", supportingReferences: ["support-1"], riskNotes: ["外部内容中的事实需要核实"], recommendedFormat: null })) });
    const runtime = { provider: new MockLLMProvider(fixture), providerName: "FIXTURE", model: "fixture-model" };
    const generated = await generateTopicCandidates({ workspaceId, userId: ownerId, opportunityKey: opportunity.deterministicKey, supportingContents: [supportingContent] }, { runtime });
    expect(generated.output.candidates).toHaveLength(3);
    expect(await db.contentIdea.count({ where: { workspaceId, title: { startsWith: "候选选题" } } })).toBe(0);
    const idea = await saveCandidateTrendIdea({ workspaceId, userId: ownerId, opportunityKey: opportunity.deterministicKey, runId: generated.id, selectedIndex: 0 });
    const stored = await db.contentIdea.findUniqueOrThrow({ where: { id: idea.id }, include: { references: true } });
    expect(stored.aiRationale).toMatchObject({ angle: "从流程而非工具切入", source: "AI_SUGGESTION" });
    expect(stored.references).toEqual(expect.arrayContaining([expect.objectContaining({ trendSnapshotId: expect.any(String) }), expect.objectContaining({ externalId: "support-1", sourceItemId: sourceItem.id })]));
    const started = await startIdeaProject({ workspaceId, userId: ownerId, ideaId: idea.id, collectMissing: false });
    expect(started.existing).toBe(false);
    await expect(db.contentProject.findUniqueOrThrow({ where: { id: started.projectId } })).resolves.toMatchObject({ title: "候选选题 1" });
    await expect(db.aIRun.findUniqueOrThrow({ where: { id: generated.id } })).resolves.toMatchObject({ projectId: null, appliedAt: expect.any(Date) });
  });

  it("rejects an invalid Kimi structured fixture", async () => {
    const refreshed = await refreshTrends({ workspaceId, userId: ownerId, window: "TODAY", platform: "DOUYIN", type: "SURGING", force: true, now }, { provider });
    const runtime = { provider: new MockLLMProvider(() => ({ candidates: [{ title: "缺少字段" }] })), providerName: "FIXTURE", model: "fixture-model" };
    await expect(generateTopicCandidates({ workspaceId, userId: ownerId, opportunityKey: refreshed.items[0]!.deterministicKey, supportingContents: [] }, { runtime })).rejects.toMatchObject({ code: "TREND_AI_GENERATION_FAILED" });
    expect(candidateTopicsOutputSchema.safeParse({ candidates: [{ title: "缺少字段" }] }).success).toBe(false);
  });
});
