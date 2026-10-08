import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { setUserDisabled } from "../server/admin/user-lifecycle";

describe("admin user lifecycle", () => {
  const suffix = randomUUID();
  const adminId = `closure-admin-${suffix}`;
  const userId = `closure-user-${suffix}`;
  const otherUserId = `closure-other-${suffix}`;
  let workspaceId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: adminId, name: "Closure Admin", email: `${adminId}@example.test`, systemRole: "SYSTEM_ADMIN" },
      { id: userId, name: "Closure User", email: `${userId}@example.test` },
      { id: otherUserId, name: "Closure Other", email: `${otherUserId}@example.test` },
    ] });
    const workspace = await db.workspace.create({ data: { name: "Closure", slug: `closure-${suffix}`, members: { create: [{ userId: adminId, role: "OWNER" }, { userId, role: "OWNER" }, { userId: otherUserId, role: "OWNER" }] } } });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [adminId, userId, otherUserId] } } });
    await db.$disconnect();
  });

  it("allows a system admin to disable and restore a user", async () => {
    const session = await db.session.create({ data: { userId, token: `closure-token-${suffix}`, expiresAt: new Date(Date.now() + 3_600_000) } });
    await expect(setUserDisabled({ adminId, userId, disabled: true })).resolves.toMatchObject({ id: userId });
    await expect(db.user.findUnique({ where: { id: userId }, select: { disabledAt: true } })).resolves.toMatchObject({ disabledAt: expect.any(Date) });
    await expect(db.session.findUnique({ where: { id: session.id } })).resolves.toBeNull();
    await expect(setUserDisabled({ adminId, userId, disabled: false })).resolves.toMatchObject({ id: userId, disabledAt: null });
  });

  it("refuses disabling the final effective owner even when another administrator exists", async () => {
    const sole=await db.workspace.create({data:{name:"Last owner fixture",slug:"last-owner-"+suffix,members:{create:[{userId:otherUserId,role:"OWNER"},{userId:userId,role:"ADMIN"}]}}});
    try { await expect(setUserDisabled({adminId,userId:otherUserId,disabled:true})).rejects.toMatchObject({code:"LAST_WORKSPACE_MANAGER"}); expect((await db.user.findUniqueOrThrow({where:{id:otherUserId},select:{disabledAt:true}})).disabledAt).toBeNull(); } finally { await db.workspace.delete({where:{id:sole.id}}); }
  });
  it("rejects a non-admin actor", async () => {
    await expect(setUserDisabled({ adminId: userId, userId: otherUserId, disabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not allow an admin to disable itself", async () => {
    await expect(setUserDisabled({ adminId, userId: adminId, disabled: true })).rejects.toMatchObject({ code: "CANNOT_DISABLE_SELF" });
  });
});
