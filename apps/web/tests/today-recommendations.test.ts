import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { enqueueContentIngestMock } = vi.hoisted(() => ({enqueueContentIngestMock: vi.fn().mockResolvedValue(undefined)}));
vi.mock("@content-center/worker/queue", () => ({ enqueueContentIngest: enqueueContentIngestMock }));
vi.mock("@content-center/worker/queue-producer", () => ({ enqueueContentIngest: enqueueContentIngestMock }));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { buildRecommendationContext } from "../server/discovery/recommendations/context-builder";
import { actOnRecommendation, generateRecommendationBatch, getCurrentRecommendationBatch, getRecommendationItem, RecommendationServiceError } from "../server/discovery/recommendations/service";

describe("Content Discovery D4 today recommendations", () => {
  const suffix = randomUUID(); const ownerId = `recommend-owner-${suffix}`; const otherId = `recommend-other-${suffix}`;
  const viewerId = `recommend-viewer-${suffix}`;
  let workspaceId = ""; let otherWorkspaceId = ""; const sourceIds: string[] = [];

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Recommendation Owner", email: `${ownerId}@example.test` }, { id: otherId, name: "Other Owner", email: `${otherId}@example.test` }] });
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: "Recommendation Workspace", slug: `recommend-${suffix}`, members: { create: { userId: ownerId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Other Recommendation Workspace", slug: `recommend-other-${suffix}`, members: { create: { userId: otherId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id; otherWorkspaceId = other.id;
    await db.promptTemplate.create({ data: { workspaceId, name: "Recommendation test", type: "GENERATE_TODAY_RECOMMENDATIONS", version: 1, systemPrompt: "Use supplied evidence only.", template: "{{context}}" } });
    await db.user.create({ data: { id: viewerId, name: "Viewer", email: `${viewerId}@example.test` } });
    await db.workspaceMember.createMany({ data: [{ workspaceId, userId: otherId, role: "EDITOR" }, { workspaceId, userId: viewerId, role: "VIEWER" }] });
  });

  beforeEach(async () => {
    await db.recommendationBatch.deleteMany({ where: { workspaceId } });
    await db.contentIdea.deleteMany({ where: { workspaceId } });
    await db.contentProject.deleteMany({ where: { workspaceId } });
    await db.sourceItem.deleteMany({ where: { workspaceId } });
    await db.apiUsage.deleteMany({ where: { workspaceId } });
    await db.aIRun.deleteMany({ where: { workspaceId } });
    sourceIds.length = 0;
    for (const [index, title] of ["AI 团队如何减少重复沟通", "创作者建立证据库", "短视频选题复盘方法"].entries()) {
      const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", title, description: `真实素材摘要 ${index}`, rawText: "不进入推荐上下文的完整原文", status: "READY" } });
      sourceIds.push(source.id);
    }
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherId, viewerId] } } });
    await db.$disconnect();
  });

  it("builds a bounded context without transcript or full raw text", async () => {
    const context = await buildRecommendationContext({ workspaceId, userId: ownerId });
    expect(context.candidates).toHaveLength(3);
    expect(JSON.stringify(context)).not.toContain("不进入推荐上下文的完整原文");
    expect(context.candidates.length).toBeLessThanOrEqual(15);
  });

  it("uses deterministic mode without profile, creates no AIRun, and reuses a valid batch", async () => {
    const runtime = { provider: new MockLLMProvider(() => ({})), providerName: "MOCK", model: "mock" };
    const first = await generateRecommendationBatch({ workspaceId, userId: ownerId }, { runtime });
    const second = await generateRecommendationBatch({ workspaceId, userId: ownerId }, { runtime });
    expect(first.mode).toBe("DETERMINISTIC");
    expect(first.creatorProfileId).toBeNull();
    expect(first.items).toHaveLength(3);
    expect(second.id).toBe(first.id);
    expect(await db.aIRun.count({ where: { workspaceId, action: "GENERATE_TODAY_RECOMMENDATIONS" } })).toBe(0);
    expect(await db.apiUsage.count({ where: { workspaceId, provider: "REDFOX" } })).toBe(0);
  });

  it("makes one AI call, validates evidence ids and persists only real evidence", async () => {
    let calls = 0;
    const runtime = { provider: new MockLLMProvider(() => { calls += 1; return { recommendations: sourceIds.map((id, index) => ({ candidateId: `source:${id}`, title: `方向 ${index + 1}`, coreQuestion: "核心问题", angle: "差异化切口", whyRecommended: "编辑判断", whyNow: "素材最近更新", creatorFit: "未使用个性化结论", evidenceRefs: [id, "forged-evidence"], differenceFromRecentContent: "无精确重复", suggestedNextStep: "核对素材", riskNotes: [], recommendedFormat: null })) }; }), providerName: "FIXTURE", model: "fixture-model" };
    const batch = await generateRecommendationBatch({ workspaceId, userId: ownerId, force: true }, { runtime });
    expect(batch.mode).toBe("AI_ASSISTED"); expect(calls).toBe(1); expect(batch.items).toHaveLength(3);
    expect(batch.items.flatMap((item) => item.evidence).every((evidence) => evidence.referenceId !== "forged-evidence")).toBe(true);
    expect(await db.aIRun.count({ where: { workspaceId, action: "GENERATE_TODAY_RECOMMENDATIONS" } })).toBe(1);
    expect(await db.apiUsage.count({ where: { workspaceId, provider: "FIXTURE", operation: "GENERATE_TODAY_RECOMMENDATIONS" } })).toBe(1);
  });

  it("dismisses only one item and supports save, research and project creation", async () => {
    const batch = await generateRecommendationBatch({ workspaceId, userId: ownerId, force: true }, { runtime: { provider: new MockLLMProvider(() => ({})), providerName: "MOCK", model: "mock" } });
    await actOnRecommendation({ workspaceId, userId: ownerId, itemId: batch.items[0]!.id, action: "DISMISS" });
    expect((await getRecommendationItem({ workspaceId, userId: ownerId, itemId: batch.items[0]!.id }))?.status).toBe("DISMISSED");
    expect((await getRecommendationItem({ workspaceId, userId: ownerId, itemId: batch.items[1]!.id }))?.status).toBe("NEW");
    const saved = await actOnRecommendation({ workspaceId, userId: ownerId, itemId: batch.items[1]!.id, action: "START_RESEARCH" });
    expect(saved.status).toBe("SAVED");
    await expect(db.contentIdea.findUniqueOrThrow({ where: { id: "ideaId" in saved ? saved.ideaId : "" } })).resolves.toMatchObject({ status: "READY" });
    const started = await actOnRecommendation({ workspaceId, userId: ownerId, itemId: batch.items[2]!.id, action: "START_CREATION" });
    expect(started.status).toBe("STARTED");
    expect("projectId" in started ? started.projectId : null).toBeTruthy();
  });

  it("enforces workspace isolation and reports no-data honestly", async () => {
    const batch = await generateRecommendationBatch({ workspaceId, userId: ownerId, force: true }, { runtime: { provider: new MockLLMProvider(() => ({})), providerName: "MOCK", model: "mock" } });
    expect(await getRecommendationItem({ workspaceId: otherWorkspaceId, userId: otherId, itemId: batch.items[0]!.id })).toBeNull();
    await db.recommendationBatch.deleteMany({ where: { workspaceId } }); await db.sourceItem.deleteMany({ where: { workspaceId } });
    await expect(generateRecommendationBatch({ workspaceId, userId: ownerId, force: true }, { runtime: { provider: new MockLLMProvider(() => ({})), providerName: "MOCK", model: "mock" } })).rejects.toBeInstanceOf(RecommendationServiceError);
    expect(await getCurrentRecommendationBatch({ workspaceId, userId: ownerId })).toBeNull();
  });

  it("keeps recommendations private from another member of the same workspace", async () => {
    const runtime = { provider: new MockLLMProvider(() => ({})), providerName: "MOCK", model: "mock" };
    const batch = await generateRecommendationBatch({ workspaceId, userId: ownerId, force: true }, { runtime });
    expect(await getCurrentRecommendationBatch({ workspaceId, userId: otherId })).toBeNull();
    expect(await getRecommendationItem({ workspaceId, userId: otherId, itemId: batch.items[0]!.id })).toBeNull();
    for (const action of ["DISMISS", "SAVE_IDEA", "START_RESEARCH", "START_CREATION"] as const) {
      await expect(actOnRecommendation({ workspaceId, userId: otherId, itemId: batch.items[0]!.id, action })).rejects.toMatchObject({ code: "RECOMMENDATION_NOT_FOUND" });
      await expect(actOnRecommendation({ workspaceId: otherWorkspaceId, userId: otherId, itemId: batch.items[0]!.id, action })).rejects.toMatchObject({ code: "RECOMMENDATION_NOT_FOUND" });
    }
    expect(await db.contentIdea.count({ where: { workspaceId } })).toBe(0);
    expect((await getRecommendationItem({ workspaceId, userId: ownerId, itemId: batch.items[0]!.id }))?.status).toBe("NEW");
    const own = await generateRecommendationBatch({ workspaceId, userId: otherId }, { runtime });
    expect((await getCurrentRecommendationBatch({ workspaceId, userId: otherId }))?.id).toBe(own.id);
    expect((await getCurrentRecommendationBatch({ workspaceId, userId: ownerId }))?.id).toBe(batch.id);
  });

  it("denies viewer generation and actions at the service boundary", async () => {
    const runtime = { provider: new MockLLMProvider(() => ({})), providerName: "MOCK", model: "mock" };
    await expect(generateRecommendationBatch({ workspaceId, userId: viewerId }, { runtime })).rejects.toMatchObject({ code: "RECOMMENDATION_FORBIDDEN" });
    const batch = await db.recommendationBatch.create({ data: { workspaceId, createdById: viewerId, mode: "DETERMINISTIC", expiresAt: new Date(Date.now() + 60000), items: { create: { workspaceId, position: 0, title: "Viewer topic", coreQuestion: "Question", angle: "Angle", whyRecommended: "Reason", whyNow: "Now", creatorFit: "Fit", differenceFromRecentContent: "Different", suggestedNextStep: "Next", riskNotes: [] } } }, include: { items: true } });
    for (const action of ["DISMISS", "SAVE_IDEA", "START_RESEARCH", "START_CREATION"] as const) await expect(actOnRecommendation({ workspaceId, userId: viewerId, itemId: batch.items[0]!.id, action })).rejects.toMatchObject({ code: "RECOMMENDATION_FORBIDDEN" });
  });

  it("shares only the selected topic and public source refs, once under concurrent saves", async () => {
    const batch = await generateRecommendationBatch({ workspaceId, userId: ownerId, force: true }, { runtime: { provider: new MockLLMProvider(() => ({})), providerName: "MOCK", model: "mock" } });
    const item = batch.items[0]!;
    await db.recommendationItem.update({ where: { id: item.id }, data: { whyRecommended: "PRIVATE_RATIONALE", creatorFit: "PRIVATE_FIT" } });
    await db.recommendationEvidence.create({ data: { workspaceId, recommendationItemId: item.id, type: "CREATOR_PROFILE", referenceId: "private-profile", snapshot: { positioning: "PRIVATE_PROFILE" } } });
    const results = await Promise.all([1, 2].map(() => actOnRecommendation({ workspaceId, userId: ownerId, itemId: item.id, action: "SAVE_IDEA" })));
    expect(results[0]).toEqual(results[1]);
    const ideas = await db.contentIdea.findMany({ where: { workspaceId }, include: { references: true } });
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ title: item.title, description: item.angle, creatorProfileId: null, aiRationale: null });
    expect(JSON.stringify(ideas)).not.toContain("PRIVATE_");
    expect(ideas[0]!.references.length).toBeGreaterThan(0);
  });
});
