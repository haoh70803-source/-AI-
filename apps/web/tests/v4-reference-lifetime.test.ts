import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { continuingReferences } from "../lib/reference-scope";
import { getProjectAssistantThread, runProjectAssistant } from "../server/assistant/service";
import type { ContextReference } from "../lib/contracts/references";

const suffix = randomUUID(), userId = `v4-refs-${suffix}`;
let workspaceId = "", projectId = "", sourceId = "";
const actor = () => ({ workspaceId, projectId, userId });
let lastPrompt = "";
const provider = new MockLLMProvider(input => { lastPrompt = input.prompt; return "资料已读取，下面给出一个明确标记的分析建议。"; });
const runtime = { provider, providerName: "MOCK", model: "v4-reference-fixture", mode: "MOCK" as const };
beforeAll(async () => {
  await db.user.create({ data: { id: userId, name: "引用验收", email: `${userId}@test.invalid` } });
  workspaceId = (await db.workspace.create({ data: { name: "引用隔离", slug: suffix, members: { create: { userId, role: "OWNER" } } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "资料持续使用" } })).id;
  sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: "原始资料", rawText: "持续引用独有标记 REFERENCE_V4。", sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY" } })).id;
});
afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect(); });
it("separates turn, task and project lifetimes and preserves legacy task references", () => {
  const refs: ContextReference[] = [{ sourceType: "MATERIAL", sourceId: "turn", scope: "TURN" }, { sourceType: "MATERIAL", sourceId: "task", scope: "TASK" }, { sourceType: "MATERIAL", sourceId: "project", scope: "PROJECT" }, { sourceType: "RESEARCH", sourceId: "legacy" }];
  expect(continuingReferences(refs, true).map(ref => ref.sourceId)).toEqual(["task", "project", "legacy"]);
  expect(continuingReferences(refs, false).map(ref => ref.sourceId)).toEqual(["project"]);
});
it("persists a task source and version, reopens it, and carries it into the next edit", async () => {
  await runProjectAssistant({ ...actor(), content: "分析这份资料", references: [{ sourceType: "MATERIAL", sourceId, scope: "TASK" }], skillVersionIds: [] }, () => {}, { runtime });
  const reopened = await getProjectAssistantThread(actor());
  expect(reopened.activeReferences?.[0]).toMatchObject({ sourceId, scope: "TASK", sourceVersion: expect.any(String) });
  await runProjectAssistant({ ...actor(), content: "短一点", skillVersionIds: [] }, () => {}, { runtime });
  expect(lastPrompt).toContain("REFERENCE_V4");
});
it("explicit project lifetime links material and survives reopening", async () => {
  await runProjectAssistant({ ...actor(), content: "请长期使用这份资料", references: [{ sourceType: "MATERIAL", sourceId, scope: "PROJECT" }], skillVersionIds: [] }, () => {}, { runtime });
  expect(await db.projectSource.count({ where: { projectId, sourceItemId: sourceId } })).toBe(1);
  expect((await getProjectAssistantThread(actor())).activeReferences?.[0]).toMatchObject({ sourceId, scope: "PROJECT" });
});
it("marks a changed persisted source unavailable instead of silently reusing its old version", async () => {
  await db.sourceItem.update({ where: { id: sourceId }, data: { rawText: "新来源版本，不可冒充原版本。", updatedAt: new Date(Date.now() + 1000) } });
  const reopened = await getProjectAssistantThread(actor());
  expect(reopened.activeReferences).toEqual([]);
  expect(reopened.referenceWarnings?.length).toBeGreaterThan(0);
  const spy = vi.spyOn(provider, "streamText"); spy.mockClear();
  const response = await runProjectAssistant({ ...actor(), content: "继续处理", references: [{ sourceType: "MATERIAL", sourceId, scope: "PROJECT" }], skillVersionIds: [] }, () => {}, { runtime });
  expect(response.status).toBe("FAILED"); expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
});
