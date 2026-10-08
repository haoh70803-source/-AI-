import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { researchSourceInbox, researchSourceDetail } from "../server/research/read-model";
import { researchObjectAction } from "../server/research/preferences";
import { researchSourceLabel } from "../components/research/research-labels";
import { createResearchSession, reserveResearchRun } from "../server/research/service";
const suffix = randomUUID(), userId = "inbox-owner-" + suffix, viewerId = "inbox-viewer-" + suffix;
let workspaceId = "", otherWorkspaceId = "", materialId = "", foreignId = "", archivedId = "", projectId = "";
const actor = () => ({ workspaceId, userId });
beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || target.port !== "55436" || target.pathname !== "/content_center_upgrade_review") throw Error("ISOLATED_REVIEW_REQUIRED");
  await db.user.createMany({ data: [{ id: userId, email: userId + "@example.test", name: "Inbox fixture" }, { id: viewerId, email: viewerId + "@example.test", name: "Inbox viewer" }] });
  workspaceId = (await db.workspace.create({ data: { name: "Inbox disposable", slug: "inbox-" + suffix, members: { create: [{ userId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } })).id;
  otherWorkspaceId = (await db.workspace.create({ data: { name: "Inbox foreign", slug: "inbox-other-" + suffix } })).id;
  async function material(ws: string, status: "READY" | "ARCHIVED") { return (await db.sourceItem.create({ data: { workspaceId: ws, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", status, title: "a123456789012345678901234_raw", rawText: "可核查的原始内容。不要把它自动发送到创作。", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") } })).id; }
  materialId = await material(workspaceId, "READY"); foreignId = await material(otherWorkspaceId, "READY"); archivedId = await material(workspaceId, "ARCHIVED");
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "Do not change creative" } })).id;
  const thread = await db.assistantThread.create({ data: { workspaceId, projectId, createdById: userId } });
  await db.assistantMessage.create({ data: { threadId: thread.id, role: "USER", content: "保留正常用户对话", status: "COMPLETED" } });
});
afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId].filter(Boolean) } } });
  await db.user.deleteMany({ where: { id: { in: [userId, viewerId] } } });
  await db.$disconnect();
});
it("shows stored excerpts and acquisition dates without inventing daily news", async () => {
  const result = await researchSourceInbox(actor());
  expect(result.items).toHaveLength(1); expect(result.items[0]).toMatchObject({ id: materialId, excerptKind: "原文摘录", read: false, followed: false, createdAt: new Date("2026-01-01") });
  expect(result.items[0]?.excerpt).toContain("可核查"); expect(result.items[0]).not.toHaveProperty("rawText"); expect(result.items[0]).not.toHaveProperty("transcript");
  expect((await researchSourceInbox(actor(), { q: "可核查" })).items).toHaveLength(1);
});
it("keeps read state and favorites independent and only in the current user scope", async () => {
  await researchObjectAction(actor(), { kind: "MATERIAL", key: materialId, action: "FOLLOW" });
  expect((await researchSourceInbox(actor(), { view: "favorites" })).items).toHaveLength(1);
  expect((await researchSourceInbox(actor(), { view: "unread" })).items).toHaveLength(1);
  await researchObjectAction(actor(), { kind: "MATERIAL", key: materialId, action: "VIEW" });
  expect((await researchSourceInbox(actor(), { view: "unread" })).items).toHaveLength(0);
  const other = await researchSourceInbox({ workspaceId, userId: viewerId }, { view: "favorites" }); expect(other.items).toHaveLength(0);
  await researchObjectAction(actor(), { kind: "MATERIAL", key: materialId, action: "UNREAD" });
  expect((await researchSourceInbox(actor(), { view: "unread" })).items).toHaveLength(1);
});
it("source updates reopen unread status without deleting the bookmark", async () => {
  await researchObjectAction(actor(), { kind: "MATERIAL", key: materialId, action: "VIEW" });
  await db.sourceItem.update({ where: { id: materialId }, data: { updatedAt: new Date(Date.now() + 10000) } });
  const result = await researchSourceDetail(actor(), materialId);
  expect(result).toMatchObject({ read: false, followed: true }); expect(result.content?.contentText).toContain("可核查");
});
it("rejects foreign/archived sources and disabled membership", async () => {
  for (const id of [foreignId, archivedId]) {
    await expect(researchSourceDetail(actor(), id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(researchObjectAction(actor(), { kind: "MATERIAL", key: id, action: "FOLLOW" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  await expect(researchSourceInbox({ workspaceId: otherWorkspaceId, userId })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("read, bookmark, repeated refresh and isolated research reservation never write creative history or artifacts", async () => {
  const snapshot = async () => JSON.stringify({ messages: await db.assistantMessage.findMany({ where: { thread: { projectId } }, orderBy: { id: "asc" } }), artifacts: await db.artifact.findMany({ where: { workspaceId, projectId }, orderBy: { id: "asc" } }) });
  const before = await snapshot();
  await researchSourceInbox(actor()); await researchSourceDetail(actor(), materialId);
  for (let i = 0; i < 2; i++) await researchObjectAction(actor(), { kind: "MATERIAL", key: materialId, action: "FOLLOW" });
  const session = await createResearchSession(actor(), { title: "私人研究日志", entryTemplate: "BREAKDOWN", requestKey: randomUUID(), projectId });
  await reserveResearchRun(actor(), session.id, { question: "这里只研究原件", requestKey: randomUUID(), scope: { materialIds: [materialId], benchmarkAccountIds: [], trendKeys: [], notes: "", useCreatorProfile: false, useOwnArtifacts: false } });
  expect(await snapshot()).toBe(before);
});
it("display labels handle machine filenames/unnamed sources without renaming normal titles", () => {
  expect(researchSourceLabel("ab123456789012345678901234_raw", "TEXT")).toBe("文字资料");
  expect(researchSourceLabel(null, "VIDEO")).toBe("视频资料"); expect(researchSourceLabel("原作者具体标题", "TEXT")).toBe("原作者具体标题");
});

it("saves one private human clipping under simultaneous retry and rejects changed payloads", async () => {
  const { saveResearchClipping } = await import("../server/research/service");
  const { researchResultLibrary, getResearchResult } = await import("../server/research/read-model");
  const input = { requestKey: randomUUID(), quote: "可核查的原始内容。", note: "私人备注：不可自动分享" };
  const counts = async () => ({ messages: await db.assistantMessage.count({ where: { thread: { projectId } } }), artifacts: await db.artifact.count({ where: { workspaceId } }), ai: await db.aIRun.count({ where: { workspaceId } }) });
  const before = await counts();
  const results = await Promise.all([saveResearchClipping(actor(), materialId, input), saveResearchClipping(actor(), materialId, input)]);
  expect(results[0].id).toBe(results[1].id);
  const run = await getResearchResult(actor(), results[0].id);
  expect(run.coverage).toMatchObject({ manualClipping: true, aiSampleCount: 0 });
  expect(run.blocks.some(block => block.type === "text" && block.text.includes(input.note))).toBe(true);
  expect((await researchResultLibrary(actor(), { library: "clippings" })).count).toBe(1);
  expect((await researchSourceDetail(actor(), materialId)).clippings).toHaveLength(1);
  expect((await researchSourceDetail({ workspaceId, userId: viewerId }, materialId)).clippings).toHaveLength(0);
  await expect(getResearchResult({ workspaceId, userId: viewerId }, run.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(saveResearchClipping(actor(), materialId, { ...input, note: "变更内容" })).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
  await expect(saveResearchClipping(actor(), materialId, { ...input, requestKey: randomUUID(), quote: "不在原文中的虚构文字" })).rejects.toMatchObject({ code: "QUOTE_NOT_IN_SOURCE" });
  await expect(saveResearchClipping({ workspaceId, userId: viewerId }, materialId, { ...input, requestKey: randomUUID() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await counts()).toEqual(before);
});
it("adopts explicitly selected sources idempotently without overwriting the first note or copying private notes", async () => {
  const { createIdea } = await import("../server/discovery/service");
  const input = { ...actor(), title: "明确采用的候选标题", description: "本人明确填写的共享说明", sourceItemId: materialId, deduplicateSource: true };
  const first = await createIdea(input), again = await createIdea({ ...input, description: "重试不能覆盖已存说明" });
  expect(again.id).toBe(first.id); expect(again.description).toBe(input.description);
  expect((await researchSourceDetail(actor(), materialId)).topics).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id })]));
  const references = await db.contentIdeaReference.findMany({ where: { ideaId: first.id } });
  expect(references).toHaveLength(1); expect(references[0]!.sourceItemId).toBe(materialId);
  expect(JSON.stringify(first)).not.toContain("私人备注：不可自动分享");
  const another = await createIdea({ ...input, title: "另一个明确选择的角度" }); expect(another.id).not.toBe(first.id);
});
it("uses saved works, real dates, missing metrics and per-user unread/favorites without cross-workspace access", async () => {
  const { researchWorkInbox } = await import("../server/research/read-model");
  const account = await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, platform: "DOUYIN", externalAccountId: suffix, name: "研究方法的老师", researchNotes: "学习讲解方法", lastSyncedAt: new Date("2026-01-02") } });
  const foreign = await db.benchmarkAccount.create({ data: { workspaceId: otherWorkspaceId, createdById: userId, platform: "DOUYIN", externalAccountId: suffix, name: "foreign" } });
  const makeWork = (ws: string, id: string, externalId: string, publishedAt: Date | null) => db.benchmarkContentSnapshot.create({ data: { workspaceId: ws, benchmarkAccountId: id, platform: "DOUYIN", externalId, title: "已有普通作品", url: "https://example.test/work", metadata: {}, publishedAt } });
  const work = await makeWork(workspaceId, account.id, suffix + "-work", new Date());
  const unknown = await makeWork(workspaceId, account.id, suffix + "-unknown", null);
  const foreignWork = await makeWork(otherWorkspaceId, foreign.id, suffix + "-foreign", new Date());
  await db.benchmarkMetricObservation.create({ data: { snapshotId: work.id, metrics: { likes: 0, comments: 12, favorites: -1 } } });
  await db.sourceItem.update({ where: { id: materialId }, data: { sourcePlatform: "DOUYIN", externalId: work.externalId } });
  const result = await researchWorkInbox(actor());
  expect(result.items).toHaveLength(2);
  expect(result.items.find(item => item.id === work.id)).toMatchObject({ sourceItemId: materialId, readable: true, counts: { likes: 0, comments: 12, favorites: null, shares: null }, reportId: null, benchmarkAccount: { researchNotes: "学习讲解方法" } });
  expect(result.items.find(item => item.id === unknown.id)?.publishedAt).toBeNull();
  expect((await researchWorkInbox(actor(), { days: "3" })).items.map(item => item.id)).toEqual([work.id]);
  expect((await researchWorkInbox(actor(), { accountId: foreign.id })).items).toHaveLength(0);
  await researchObjectAction(actor(), { kind: "WORK", key: work.id, action: "FOLLOW" });
  expect((await researchWorkInbox(actor(), { view: "favorites" })).items.map(item => item.id)).toEqual([work.id]);
  expect((await researchWorkInbox({ workspaceId, userId: viewerId }, { view: "favorites" })).items).toHaveLength(0);
  await researchObjectAction(actor(), { kind: "WORK", key: work.id, action: "VIEW" });
  expect((await researchWorkInbox(actor(), { view: "unread" })).items.map(item => item.id)).toEqual([unknown.id]);
  await expect(researchObjectAction(actor(), { kind: "WORK", key: foreignWork.id, action: "FOLLOW" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
