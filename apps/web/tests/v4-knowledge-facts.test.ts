import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { ContextBuilderV2 } from "../server/ai/control/context-builder-v2";
import { resolveContextReferences } from "../server/assistant/references";

const suffix = randomUUID(), userId = `v4-facts-${suffix}`;
let workspaceId = "", projectId = "", sourceId = "", knowledgeId = "", factId = "", restrictedId = "";
const actor = () => ({ workspaceId, projectId, userId });
beforeAll(async () => {
  await db.user.create({ data: { id: userId, name: "事实验收", email: `${userId}@test.invalid` } });
  workspaceId = (await db.workspace.create({ data: { name: "V4事实隔离", slug: suffix, members: { create: { userId, role: "OWNER" } } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "授权事实项目" } })).id;
  sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: "企业资料", rawText: "企业资料正文与外部资料必须保持来源区别。", sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY" } })).id;
  await db.projectSource.create({ data: { projectId, sourceItemId: sourceId, role: "REFERENCE" } });
  const knowledge = await db.knowledgeEntry.create({ data: { workspaceId, createdById: userId, sourceItemId: sourceId, sourceTitle: "企业资料", sourceSnapshot: { id: sourceId, version: "fixture" }, sourceHash: "fixture-hash", title: "知识条目", body: "外部企业曾做过服务调整，不代表我们亲历。" } });
  knowledgeId = knowledge.id;
  restrictedId = (await db.knowledgeEntry.create({ data: { ...{ workspaceId, createdById: userId, sourceItemId: sourceId, sourceTitle: "企业资料", sourceSnapshot: {}, sourceHash: "fixture" }, title: "受限条目", body: "不可放进共享项目的正文", confidentiality: "RESTRICTED" } })).id;
  for (const [claim, category, confirmed, validUntil] of [
    ["本公司提供线下课程服务。", "STABLE", true, null],
    ["过期确认不能使用。", "DYNAMIC", true, new Date(Date.now() - 1000)],
    ["尚未确认的经历。", "STABLE", false, null],
    ["争议事实不可使用。", "DISPUTED", true, null],
    ["禁止陈述不可使用。", "PROHIBITED", true, null],
  ] as const) {
    const fact = await db.factRecord.create({ data: { workspaceId, createdById: userId, knowledgeId, claim, category, validUntil, ...(validUntil ? { createdAt: new Date(Date.now() - 3600000) } : {}),
      ...(confirmed ? { confirmations: { create: { hostUserId: userId, contentOwnerUserId: "fixture-content-owner", requestedById: userId, expiresAt: new Date(Date.now() + 3600000), approvals: { create: [{ identity: "HOST", actorId: userId, decision: "APPROVE", reason: "隔离验收" }, { identity: "CONTENT_OWNER", actorId: "fixture-content-owner", decision: "APPROVE", reason: "隔离验收" }] } } } } : {}) } });
    if (category === "STABLE" && confirmed) factId = fact.id;
  }
});
afterAll(async () => {
  if (workspaceId) {
    // Governed confirmation history is append-only even in LOCAL_TEST.
    // Retire only this suite's UUID fixtures; never disable history triggers.
    await db.factRecord.updateMany({ where: { workspaceId }, data: { retiredAt: new Date() } });
    await db.knowledgeEntry.updateMany({ where: { workspaceId }, data: { retiredAt: new Date() } });
    await db.sourceItem.updateMany({ where: { workspaceId }, data: { status: "ARCHIVED" } });
    await db.contentProject.updateMany({ where: { workspaceId }, data: { status: "ARCHIVED" } });
    await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: new Date() } });
  }
  await db.user.updateMany({ where: { id: userId }, data: { disabledAt: new Date() } });
  await db.$disconnect();
});
it("reads a versioned knowledge entry and preserves its external origin", async () => {
  const result = await resolveContextReferences(actor(), [{ sourceType: "KNOWLEDGE", sourceId: knowledgeId }]);
  expect(result.items[0]).toMatchObject({ objectType: "KNOWLEDGE", objectId: knowledgeId, version: 1, ownership: "EXTERNAL" });
  expect(result.items[0]?.content).toContain("fixture-hash");
});
it("only supplies confirmed valid project facts, never unconfirmed or external experiences", async () => {
  const context = await new ContextBuilderV2().build({ ...actor(), taskType: "GENERAL_QUERY", action: "PROJECT_ASSISTANT", userInput: "整理已有资料", skillVersionIds: [], references: [{ sourceType: "KNOWLEDGE", sourceId: knowledgeId }] });
  expect(context?.ownFacts.map(fact => fact.text)).toEqual(["本公司提供线下课程服务。"]);
  expect(context?.manifest.confirmedInformationRefs).toEqual([factId]);
  expect(context?.manifest.items.find(item => item.objectType === "KNOWLEDGE")?.ownership).toBe("EXTERNAL");
});
it("rejects restricted, missing and cross-workspace knowledge", async () => {
  for (const sourceId of [restrictedId, "missing"]) await expect(resolveContextReferences(actor(), [{ sourceType: "KNOWLEDGE", sourceId }])).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  await expect(resolveContextReferences({ ...actor(), workspaceId: "foreign" }, [{ sourceType: "KNOWLEDGE", sourceId: knowledgeId }])).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("revalidates retirement on reopening a project", async () => {
  await db.factRecord.update({ where: { id: factId }, data: { retiredAt: new Date() } });
  const context = await new ContextBuilderV2().build({ ...actor(), taskType: "GENERAL_QUERY", action: "PROJECT_ASSISTANT", userInput: "继续修改", skillVersionIds: [] });
  expect(context?.ownFacts).toEqual([]);
  await db.knowledgeEntry.update({ where: { id: knowledgeId }, data: { retiredAt: new Date() } });
  await expect(resolveContextReferences(actor(), [{ sourceType: "KNOWLEDGE", sourceId: knowledgeId }])).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
});
