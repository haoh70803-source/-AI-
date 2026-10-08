import { randomUUID } from "node:crypto";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@content-center/db";
import { confirmMotherContent, saveMotherContent, saveMotherWarningConfirmations } from "../server/mother-content-service";

describe("mother content confirmation", () => {
  const suffix = randomUUID();
  const userId = `mother-confirm-${suffix}`;
  let workspaceId = "";
  let projectId = "";

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, name: "Mother Confirm", email: `${userId}@example.test` } });
    const workspace = await db.workspace.create({ data: { name: "Mother Confirm", slug: `mother-confirm-${suffix}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "Confirm project", motherContent: { create: { workspaceId, createdById: userId, title: "稿子", body: "正文", outline: [] } } } });
    projectId = project.id;
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("persists warning confirmation and binds approval to the current version", async () => {
    await saveMotherWarningConfirmations({ workspaceId, userId, projectId, version: 1, warningKeys: ["UNCERTAIN_REFERENCE:needs review"] });
    await expect(confirmMotherContent({ workspaceId, userId, projectId, version: 1, warningKeys: ["UNCERTAIN_REFERENCE:needs review"], currentWarningKeys: ["UNCERTAIN_REFERENCE:needs review"] })).resolves.toMatchObject({ confirmedVersion: 1 });
    await expect(db.motherContent.findUnique({ where: { projectId }, select: { confirmedVersion: true, confirmedWarnings: true } })).resolves.toMatchObject({ confirmedVersion: 1, confirmedWarnings: ["UNCERTAIN_REFERENCE:needs review"] });
  });

  it("invalidates confirmation when a new mother version is saved", async () => {
    const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    await expect(saveMotherContent({ workspaceId, userId, projectId, data: { title: mother.title, body: `${mother.body} 新内容`, outline: [], expectedVersion: mother.version } })).resolves.toMatchObject({ version: 2, confirmedVersion: null });
    await expect(confirmMotherContent({ workspaceId, userId, projectId, version: 2, warningKeys: [], currentWarningKeys: ["UNCERTAIN_REFERENCE:needs review"] })).rejects.toMatchObject({ code: "MOTHER_WARNINGS_UNCONFIRMED" });
    await expect(confirmMotherContent({ workspaceId, userId, projectId, version: 1, warningKeys: [], currentWarningKeys: [] })).rejects.toMatchObject({ code: "MOTHER_VERSION_CONFLICT" });
  });
});
