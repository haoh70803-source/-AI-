import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { getProjectAssistantThread } from "../server/assistant/service";
import { createTextArtifact, getArtifactHistoryPage } from "../server/artifacts/service";

const suffix = randomUUID(), userId = `v4-history-${suffix}`;
let workspaceId = "", projectId = "", threadId = "", artifactId = "", foreignCursor = "";
const actor = () => ({ workspaceId, userId, projectId });
beforeAll(async () => {
  await db.user.create({ data: { id: userId, name: "历史验收", email: `${userId}@test.invalid` } });
  workspaceId = (await db.workspace.create({ data: { name: "长历史隔离", slug: suffix, members: { create: { userId, role: "OWNER" } } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "长历史" } })).id;
  threadId = (await db.assistantThread.create({ data: { workspaceId, projectId, createdById: userId } })).id;
  const timestamp = new Date("2026-01-01T00:00:00Z");
  await db.assistantMessage.createMany({ data: Array.from({ length: 161 }, (_, index) => ({ id: `${suffix}-${String(index).padStart(3, "0")}`, threadId, role: "ASSISTANT" as const, status: "COMPLETED" as const, content: `正文 ${index}`, createdAt: timestamp })) });
  const artifact = await createTextArtifact({ ...actor(), title: "长版本历史", sourceMessageId: `${suffix}-160` });
  artifactId = artifact.artifactId;
  const row = await db.artifact.findUniqueOrThrow({ where: { id: artifactId } });
  await db.draftRevision.createMany({ data: Array.from({ length: 200 }, (_, index) => ({ workspaceId, projectId, draftBranchId: row.draftBranchId, revision: index + 2, title: "历史", body: `版本 ${index + 2}`, outline: [], origin: "HUMAN" as const, createdById: userId })) });
  const otherProject = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "不同项目历史" } });
  const other = await db.assistantThread.create({ data: { workspaceId, projectId: otherProject.id, createdById: userId, canvasObjectId: null } });
  foreignCursor = (await db.assistantMessage.create({ data: { threadId: other.id, role: "USER", status: "COMPLETED", content: "不同线程" } })).id;
});
afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect(); });
it("loads every older message once when all timestamps are equal", async () => {
  const ids: string[] = []; let beforeMessageId: string | undefined;
  do {
    const page = await getProjectAssistantThread({ ...actor(), beforeMessageId });
    expect(page.messages.length).toBeLessThanOrEqual(80);
    ids.push(...page.messages.map(message => message.id));
    beforeMessageId = page.nextCursor ?? undefined;
  } while (beforeMessageId);
  expect(ids).toHaveLength(161); expect(new Set(ids).size).toBe(161);
  await expect(getProjectAssistantThread({ ...actor(), beforeMessageId: foreignCursor })).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("loads all 201 revisions without repeating or losing the oldest saved content", async () => {
  const revisions: number[] = []; let beforeRevision: number | undefined;
  do {
    const page = await getArtifactHistoryPage({ ...actor(), artifactId, beforeRevision });
    revisions.push(...page.items.map(item => item.revision)); beforeRevision = page.nextCursor ?? undefined;
  } while (beforeRevision);
  expect(revisions).toEqual(Array.from({ length: 201 }, (_, index) => 201 - index));
  await expect(getArtifactHistoryPage({ ...actor(), artifactId, beforeRevision: -1 })).rejects.toMatchObject({ code: "ARTIFACT_INVALID_INPUT" });
});
