import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { createResearchSession, executeResearchRun, getResearchSession, reserveResearchRun, saveResearchResult } from "../server/research/service";
import { researchResultLibrary } from "../server/research/read-model";
import { parseTrendStableKey, researchTrendDetail, researchTrendList, trendStableKey } from "../server/research/trends";
import { recentResearchObjects, researchObjectAction, researchObjectPreference } from "../server/research/preferences";
import { resolveResearchInputs } from "../server/research/inputs";

describe("Research stable trend history", () => {
  const suffix = randomUUID(); const userId = `trend-user-${suffix}`; const outsiderId = `trend-outsider-${suffix}`; let workspaceId = "";
  const identity = { provider: "REDFOX", platform: "DOUYIN" as const, trendType: "HOT" as const, externalKey: `trend-${suffix}` };
  const key = trendStableKey(identity);
  beforeAll(async () => {
    await db.user.createMany({ data: [userId, outsiderId].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Research trends", slug: `research-trends-${suffix}`, members: { create: { userId, role: "EDITOR" } } } })).id;
    await db.trendSnapshot.createMany({ data: [
      { workspaceId, ...identity, title: "历史议题", keyword: "议题", rank: 10, metrics: { likes: 5, comments: null }, windowStart: new Date("2025-03-01"), windowEnd: new Date("2025-03-07"), observedAt: new Date("2025-03-08") },
      { workspaceId, ...identity, title: "历史议题", keyword: "议题", rank: 4, metrics: { likes: 12, comments: null }, windowStart: new Date("2025-04-01"), windowEnd: new Date("2025-04-07"), observedAt: new Date("2025-04-08") },
      { workspaceId, ...identity, platform: "XIAOHONGSHU", title: "其他平台的同名议题", keyword: "议题", rank: 3, metrics: {}, windowStart: new Date("2025-04-01"), windowEnd: new Date("2025-04-07"), observedAt: new Date("2025-04-08") },
    ] });
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [userId, outsiderId] } } }); await db.$disconnect(); });
  const actor = () => ({ workspaceId, userId });
  it("keeps identity across dates and separates same external key on another platform", async () => {
    expect(parseTrendStableKey(key)).toEqual(identity);
    const list = await researchTrendList(actor(), { q: "历史", platform: "DOUYIN", state: "RISING" });
    expect(list).toMatchObject({ count: 1, items: [{ stableKey: key, rank: 4, previousRank: 10, rankDelta: 6, state: "RISING" }] });
    const other = await researchTrendList(actor(), { platform: "XIAOHONGSHU", state: "FIRST_SEEN" });
    expect(other).toMatchObject({ count: 1, items: [{ previousRank: null, state: "FIRST_SEEN" }] });
    const detail = await researchTrendDetail(actor(), key);
    expect(detail.snapshots.map(item => item.rank)).toEqual([4, 10]);
    expect(detail.firstObservedAt.toISOString()).toBe("2025-03-08T00:00:00.000Z");
    expect(detail.latest.metrics.comments).toBeNull();
  });
  it("enforces workspace membership and actually cites the saved snapshot in a private run", async () => {
    await expect(researchTrendDetail({ workspaceId, userId: outsiderId }, key)).rejects.toMatchObject({ status: 403 });
    await expect(researchTrendDetail(actor(), "invalid-key")).rejects.toMatchObject({ status: 404 });
    const session = await createResearchSession(actor(), { title: "研究历史趋势", entryTemplate: "OPPORTUNITY", requestKey: randomUUID() });
    const run = await reserveResearchRun(actor(), session.id, { question: "这个趋势有什么证据缺口？", scope: { materialIds: [], benchmarkAccountIds: [], trendKeys: [key], notes: "", useCreatorProfile: false }, requestKey: randomUUID() });
    let calls = 0;
    await executeResearchRun(actor(), session.id, run.run.id, { runtime: { provider: new MockLLMProvider(() => { calls++; return { sections: [{ title: "观察边界", text: "保存的榜单快照可确认排名，但无法证明代表作品的表现。", sourceRefs: ["T1"], limitation: "缺少作品与作者样本。" }], topics: [{ title: "核实真实问题", audienceTask: "弄清问题是否仍然困扰受众", coreBenefit: "得到可执行的验证路径", angle: "先搜集代表作品", whyNow: "保存的榜单仍提示有人关注", trendRefs: ["T1"], benchmarkRefs: [], historyRefs: [], profileRefs: [], evidenceGaps: ["缺少作品与作者样本"], nextValidation: "主动检索并收录代表作品", evergreen: false, sourceRefs: ["T1"], limitation: "仅是研究假设" }] }; }), providerName: "FIXTURE", model: "fixture", mode: "FIXTURE" } });
    const stored = (await getResearchSession(actor(), session.id)).runs[0]!;
    expect(calls).toBe(1); expect(stored.status).toBe("COMPLETED");
    expect(stored.coverage).toMatchObject({ requested: 1, observed: 1, readable: 0, visual: 0, aiSampleCount: 1 });
    expect((stored.sourceRefs as Array<{ kind: string; objectId: string }>).some(source => source.kind === "TREND" && source.objectId === key)).toBe(true);
    await saveResearchResult(actor(), session.id, run.run.id);
    expect((await researchTrendDetail(actor(), key)).savedRuns).toMatchObject([{ id: run.run.id }]);
    expect((await researchResultLibrary(actor(), { trendKey: key })).items).toMatchObject([{ id: run.run.id }]);
  });
  it("keeps follow and recently viewed objects private to the member", async () => {
    const account = await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, platform: "DOUYIN", externalAccountId: `follow-${suffix}`, name: "最近查看的账号" } });
    await researchObjectAction(actor(), { kind: "TREND", key, action: "VIEW" });
    await researchObjectAction(actor(), { kind: "BENCHMARK", key: account.id, action: "VIEW" });
    expect((await recentResearchObjects(actor())).accounts).toMatchObject([{ id: account.id }]);
    expect((await recentResearchObjects(actor())).trends).toMatchObject([{ key, title: "历史议题" }]);
    expect((await researchTrendList(actor(), { state: "FOLLOWED" })).items).toEqual([]);
    await researchObjectAction(actor(), { kind: "TREND", key, action: "FOLLOW" });
    expect((await researchTrendList(actor(), { state: "FOLLOWED" })).items).toMatchObject([{ stableKey: key }]);
    expect((await researchObjectPreference(actor(), "TREND", key))?.followedAt).not.toBeNull();
    await expect(researchObjectAction({ workspaceId, userId: outsiderId }, { kind: "TREND", key, action: "FOLLOW" })).rejects.toMatchObject({ status: 403 });
    await researchObjectAction(actor(), { kind: "TREND", key, action: "UNFOLLOW" });
    expect((await researchTrendList(actor(), { state: "FOLLOWED" })).items).toEqual([]);
  });
  it("reads only opted-in own Artifact titles as history clues for topic research", async () => {
    const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "Own work" } });
    const branch = await db.draftBranch.create({ data: { workspaceId, projectId: project.id, title: "Saved", createdById: userId, updatedById: userId, workingBody: "PRIVATE_BODY_MUST_NOT_BE_READ" } });
    await db.artifact.create({ data: { workspaceId, projectId: project.id, draftBranchId: branch.id, createdById: userId, title: "已保存的标题", type: "TEXT" } });
    const scope = { materialIds: [], benchmarkAccountIds: [], trendKeys: [key], notes: "", useCreatorProfile: false, useOwnArtifacts: false };
    const without = await resolveResearchInputs(actor(), "找选题", scope, "OPPORTUNITY");
    expect(without.sourceRefs.some(source => source.kind === "PROJECT_ARTIFACT")).toBe(false);
    const withHistory = await resolveResearchInputs(actor(), "找选题", { ...scope, useOwnArtifacts: true }, "OPPORTUNITY");
    expect(withHistory.sourceRefs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "PROJECT_ARTIFACT", title: "已保存的标题" })]));
    expect(JSON.stringify(withHistory)).not.toContain("PRIVATE_BODY_MUST_NOT_BE_READ");
  });
});
