import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createOwnedWorkspace, db, ensurePersonalWorkspaceForUser, findWorkspaceForUser } from "./index";

describe("workspace isolation", () => {
  const runId = randomUUID();
  const userIds = [`user-a-${runId}`, `user-b-${runId}`];

  afterAll(async () => {
    await db.workspace.deleteMany({
      where: { members: { some: { userId: { in: userIds } } } },
    });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it("does not return User B's workspace to User A", async () => {
    const [userA, userB] = await Promise.all([
      db.user.create({ data: { id: userIds[0], name: "User A", email: `a-${runId}@example.test` } }),
      db.user.create({ data: { id: userIds[1], name: "User B", email: `b-${runId}@example.test` } }),
    ]);

    const workspaceB = await db.workspace.create({
      data: {
        name: "Workspace B",
        slug: `workspace-b-${runId}`,
        members: { create: { userId: userB.id, role: "OWNER" } },
      },
    });

    await expect(
      findWorkspaceForUser(db, { userId: userA.id, workspaceId: workspaceB.id }),
    ).resolves.toBeNull();
  });

  it("creates an OWNER membership and audit log atomically", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: userIds[0] } });
    const workspace = await createOwnedWorkspace(db, {
      userId: user.id,
      name: "Workspace A",
      slug: `workspace-a-${runId}`,
    });

    await expect(db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    })).resolves.toMatchObject({ role: "OWNER" });
    await expect(db.auditLog.findFirst({
      where: { workspaceId: workspace.id, action: "workspace.created" },
    })).resolves.not.toBeNull();
  });

  it("provisions one personal workspace idempotently", async () => {
    const id = `personal-${runId}`;
    await db.user.create({ data: { id, name: "Personal User", email: `${id}@example.test` } });
    const first = await ensurePersonalWorkspaceForUser(db, { userId: id });
    const second = await ensurePersonalWorkspaceForUser(db, { userId: id });
    expect(second.id).toBe(first.id);
    await expect(db.workspaceMember.count({ where: { userId: id, role: "OWNER" } })).resolves.toBe(1);
    await db.workspace.deleteMany({ where: { members: { some: { userId: id } } } });
    await db.user.delete({ where: { id } });
  });
});
