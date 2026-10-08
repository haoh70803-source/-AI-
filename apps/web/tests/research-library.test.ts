import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { getResearchLibrary, researchOrganizationSchema, updateResearchOrganization } from "../server/discovery/research-library";
import { buildBenchmarkPerformance } from "../server/discovery/benchmark-performance";
import { getBenchmarkInputs, importBenchmarkComments } from "../server/discovery/benchmark-inputs";
import { analyzeBenchmarkComments } from "../server/discovery/comment-analysis";
import { validateCommentReferences } from "../server/discovery/comment-analysis-schema";
import { MockLLMProvider } from "@content-center/providers";
import { collectF2Comments } from "../server/discovery/f2-collector";

describe("research performance uses observed facts", () => {
  it("keeps missing counters distinct from zero, rejects malformed and negative counters", () => {
    const snapshot = { id: "one", title: "作品", url: "https://example.test/one", publishedAt: null, observedAt: new Date("2026-09-23T00:00:00Z") };
    const result = buildBenchmarkPerformance([
      { ...snapshot, metadata: { metrics: { likes: 0, comments: 5, favorites: null, shares: -1 } } },
      { ...snapshot, id: "two", metadata: { metrics: { likes: 20, comments: "100", favorites: 8 } } },
      { ...snapshot, id: "three", metadata: null },
    ]);
    expect(result.count).toBe(3);
    expect(result.totals).toEqual([
      { metric: "likes", covered: 2, value: 20 }, { metric: "comments", covered: 1, value: 5 },
      { metric: "favorites", covered: 1, value: 8 }, { metric: "shares", covered: 0, value: null },
    ]);
    expect(result.items[0]?.publishedAt).toBeNull();
  });
  it("does not invent data for an empty account", () => {
    expect(buildBenchmarkPerformance([]).totals.every((item) => item.value === null && item.covered === 0)).toBe(true);
  });
  it("limits organization fields and rejects extra fields", () => {
    expect(researchOrganizationSchema.safeParse({ category: "同赛道", notes: "关注开头" }).success).toBe(true);
    expect(researchOrganizationSchema.safeParse({ category: "x".repeat(41), notes: "" }).success).toBe(false);
    expect(researchOrganizationSchema.safeParse({ category: null, notes: "", workspaceId: "other" }).success).toBe(false);
  });
});

describe("research account classification and isolation", () => {
  const suffix = randomUUID();
  const owner = `research-owner-${suffix}`;
  const editor = `research-editor-${suffix}`;
  const viewer = `research-viewer-${suffix}`;
  const outsider = `research-outsider-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let accountA = "";
  let accountB = "";
  let otherAccount = "";
  let snapshotId = "";
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, editor, viewer, outsider].map((id) => ({ id, name: id, email: `${id}@example.test` })) });
    const workspace = await db.workspace.create({ data: { name: "Research test", slug: `research-${suffix}`, members: { create: [{ userId: owner, role: "OWNER" }, { userId: editor, role: "EDITOR" }, { userId: viewer, role: "VIEWER" }] } } });
    workspaceId = workspace.id;
    const other = await db.workspace.create({ data: { name: "Other research", slug: `research-other-${suffix}`, members: { create: { userId: outsider, role: "OWNER" } } } });
    otherWorkspaceId = other.id;
    const create = (name: string, workspaceId: string, createdById: string) => db.benchmarkAccount.create({ data: { workspaceId, createdById, platform: "DOUYIN", externalAccountId: `${name}-${suffix}`, name } });
    accountA = (await create("A", workspaceId, owner)).id;
    accountB = (await create("B", workspaceId, owner)).id;
    otherAccount = (await create("private", otherWorkspaceId, outsider)).id;
    snapshotId = (await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountA, platform: "DOUYIN", externalId: suffix, title: "A only", url: "https://example.test/a", metadata: {} } })).id;
  });
  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: [owner, editor, viewer, outsider] } } });
    await db.$disconnect();
  });
  it("classifies A without modifying B, and persists to a new read", async () => {
    const beforeB = await db.benchmarkAccount.findUniqueOrThrow({ where: { id: accountB } });
    await updateResearchOrganization({ workspaceId, userId: editor, accountId: accountA, data: { category: "  ＡＩ工具  ", notes: "学习结构，不照搬事实。" } });
    const rows = await getResearchLibrary(workspaceId, viewer);
    expect(rows.find((item) => item.id === accountA)).toMatchObject({ researchCategory: "ai工具", researchNotes: "学习结构，不照搬事实。", sampleCount: 1 });
    expect(rows.find((item) => item.id === accountB)).toMatchObject({ researchCategory: null, researchNotes: null, sampleCount: 0 });
    expect(await db.benchmarkAccount.findUniqueOrThrow({ where: { id: accountB } })).toEqual(beforeB);
    expect(rows.some((item) => item.id === otherAccount)).toBe(false);
  });
  it("allows regrouping and removing classification without deleting account or samples", async () => {
    await updateResearchOrganization({ workspaceId, userId: owner, accountId: accountA, data: { category: "表达参考", notes: "新的关注点" } });
    await updateResearchOrganization({ workspaceId, userId: owner, accountId: accountA, data: { category: null, notes: "" } });
    const account = (await getResearchLibrary(workspaceId, owner)).find((item) => item.id === accountA);
    expect(account).toMatchObject({ researchCategory: null, researchNotes: null, sampleCount: 1 });
  });
  it("rejects viewer writes and cross-workspace/non-member access", async () => {
    const data = { category: "禁止", notes: "" };
    await expect(updateResearchOrganization({ workspaceId, userId: viewer, accountId: accountA, data })).rejects.toMatchObject({ status: 403 });
    await expect(updateResearchOrganization({ workspaceId, userId: owner, accountId: otherAccount, data })).rejects.toMatchObject({ code: "DISCOVERY_NOT_FOUND" });
    await expect(getResearchLibrary(workspaceId, outsider)).rejects.toMatchObject({ status: 404 });
    await expect(updateResearchOrganization({ workspaceId, userId: outsider, accountId: accountA, data })).rejects.toMatchObject({ status: 404 });
  });
  it("imports real comment bodies idempotently and rejects cross-account or mixed-work data", async () => {
    const comments = Array.from({ length: 5 }, (_, index) => ({ cid: `comment-${index}`, aweme_id: suffix, text: `有第 ${index + 1} 步的教程吗？`, digg_count: index, user: { nickname: "禁止保存的作者姓名" } }));
    const data = { snapshotId, payload: { comments } };
    await importBenchmarkComments({ workspaceId, userId: owner, accountId: accountA, data });
    await importBenchmarkComments({ workspaceId, userId: owner, accountId: accountA, data });
    const input = await getBenchmarkInputs(workspaceId, viewer, accountA);
    expect(input.commentCount).toBe(5);
    expect(JSON.stringify(input)).not.toContain("禁止保存的作者姓名");
    expect((await getBenchmarkInputs(workspaceId, owner, accountB)).commentCount).toBe(0);
    await expect(importBenchmarkComments({ workspaceId, userId: owner, accountId: accountB, data })).rejects.toMatchObject({ status: 404 });
    await expect(importBenchmarkComments({ workspaceId, userId: viewer, accountId: accountA, data })).rejects.toMatchObject({ status: 403 });
    await expect(importBenchmarkComments({ workspaceId, userId: owner, accountId: accountA, data: { snapshotId, payload: { comments: [...comments, { cid: "wrong", aweme_id: "other-work", text: "不能串号" }] } } })).rejects.toThrow();
    expect((await getBenchmarkInputs(workspaceId, owner, accountA)).commentCount).toBe(5);
  });
  it("only computes metric change from two stored observations", async () => {
    expect((await getBenchmarkInputs(workspaceId, owner, accountA)).works[0]?.likesDelta).toBeNull();
    await db.benchmarkMetricObservation.createMany({ data: [{ snapshotId, observedAt: new Date("2026-09-20"), metrics: { likes: 10 } }, { snapshotId, observedAt: new Date("2026-09-21"), metrics: { likes: 14 } }] });
    expect((await getBenchmarkInputs(workspaceId, viewer, accountA)).works[0]?.likesDelta).toBe(4);
  });
  it("persists a cited comment analysis and five ideas without inventing source IDs", async () => {
    const inputs = await getBenchmarkInputs(workspaceId, owner, accountA);
    const commentIds = inputs.comments.map((item) => item.id);
    const output = { summary: "当前导入评论询问教程步骤。", needs: [{ name: "教程", explanation: "需要更具体的步骤。", commentIds }], ideas: Array.from({ length: 5 }, (_, index) => ({ title: `选题 ${index + 1}`, angle: "解释一个真实步骤", hook: "这个步骤该怎么做？", requiredOwnEvidence: "我们自己的演示记录", commentIds: [commentIds[index]!] })), limitations: ["仅反映导入的评论样本。"] };
    const runtime = { provider: new MockLLMProvider(() => output), providerName: "FIXTURE", model: "fixture", mode: "FIXTURE" as const };
    await analyzeBenchmarkComments({ workspaceId, userId: owner, accountId: accountA }, { runtime });
    const result = await getBenchmarkInputs(workspaceId, viewer, accountA);
    expect(result.analysis?.output.ideas).toHaveLength(5);
    expect(result.analysis?.evidence).toHaveLength(5);
    expect((await getBenchmarkInputs(workspaceId, owner, accountB)).analysis).toBeNull();
    expect(() => validateCommentReferences({ ...output, needs: [{ ...output.needs[0]!, commentIds: ["foreign-comment"] }] }, new Set(commentIds))).toThrow();
    const invalidRuntime = { ...runtime, provider: new MockLLMProvider(() => ({ ...output, needs: [{ ...output.needs[0]!, commentIds: ["foreign-comment"] }] })) };
    await expect(analyzeBenchmarkComments({ workspaceId, userId: owner, accountId: accountA }, { runtime: invalidRuntime })).rejects.toThrow();
    expect((await getBenchmarkInputs(workspaceId, viewer, accountA)).analysis?.id).toBe(result.analysis?.id);
    await expect(analyzeBenchmarkComments({ workspaceId, userId: viewer, accountId: accountA }, { runtime })).rejects.toMatchObject({ status: 403 });
  });
  it("binds optional collector execution to the scoped work and preserves pagination", async () => {
    const snapshot = await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountB, platform: "DOUYIN", externalId: "1234567890123456789", title: "采集桥接测试", url: "https://www.douyin.com/video/1234567890123456789", metadata: {} } });
    const run = vi.fn().mockResolvedValue({ comments: [{ cid: "collector-comment", aweme_id: snapshot.externalId, text: "教程在哪里？" }], hasMore: true, nextOffset: 20 });
    const result = await collectF2Comments({ workspaceId, userId: owner, accountId: accountB, snapshotId: snapshot.id, offset: 0 }, { run });
    expect(run).toHaveBeenCalledWith(snapshot.externalId, 0);
    expect(result).toEqual({ imported: 1, hasMore: true, nextOffset: 20 });
    run.mockClear();
    await expect(collectF2Comments({ workspaceId, userId: owner, accountId: accountA, snapshotId: snapshot.id, offset: 0 }, { run })).rejects.toMatchObject({ status: 404 });
    expect(run).not.toHaveBeenCalled();
  });
});
