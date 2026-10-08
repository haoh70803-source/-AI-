import "server-only";
import { db } from "@content-center/db";
import { securityAudit } from "../account-security";

export class UserLifecycleError extends Error {
  constructor(readonly code: "USER_NOT_FOUND" | "FORBIDDEN" | "CANNOT_DISABLE_SELF" | "CANNOT_DISABLE_ADMIN" | "LAST_WORKSPACE_MANAGER", message: string) { super(message); this.name = "UserLifecycleError"; }
}
export async function setUserDisabled(input: { adminId: string; userId: string; disabled: boolean }) {
  return db.$transaction(async tx => {
    const memberships = await tx.workspaceMember.findMany({ where: { userId: input.userId }, select: { workspaceId: true } });
    for (const workspaceId of [...new Set(memberships.map(member=>member.workspaceId))].sort())
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    for (const userId of [...new Set([input.adminId,input.userId])].sort())
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: input.adminId }, select: { systemRole: true, disabledAt: true } });
    const target = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, name: true, systemRole: true, disabledAt: true } });
    if (!actor || actor.systemRole !== "SYSTEM_ADMIN" || actor.disabledAt) throw new UserLifecycleError("FORBIDDEN", "只有系统管理员可以修改用户状态。");
    if (!target) throw new UserLifecycleError("USER_NOT_FOUND", "用户不存在。");
    if (input.disabled && target.id === input.adminId) throw new UserLifecycleError("CANNOT_DISABLE_SELF", "不能停用当前登录的管理员账号。");
    if (input.disabled && target.systemRole === "SYSTEM_ADMIN") throw new UserLifecycleError("CANNOT_DISABLE_ADMIN", "不能停用系统管理员账号。");
    if (input.disabled === Boolean(target.disabledAt)) return target;
    if (input.disabled) {
      const managed = await tx.workspaceMember.findMany({ where: { userId: target.id, disabledAt: null, role: { in: ["OWNER","ADMIN"] }, workspace: { disabledAt: null } }, select: { workspaceId: true, role: true } });
      for (const member of managed) {
        const others = await tx.workspaceMember.count({ where: { workspaceId: member.workspaceId, userId: { not: target.id }, disabledAt: null, role: { in: ["OWNER","ADMIN"] }, user: { disabledAt: null } } });
        const owners = member.role === "OWNER" ? await tx.workspaceMember.count({ where: { workspaceId: member.workspaceId, userId: { not: target.id }, disabledAt: null, role: "OWNER", user: { disabledAt: null } } }) : 1;
        if (!others || !owners) throw new UserLifecycleError("LAST_WORKSPACE_MANAGER", "该账号是某公司最后一位有效负责人或管理员。请先由原负责人完成受控交接，再停用账号。");
      }
    }
    const user = await tx.user.update({ where: { id: target.id }, data: { disabledAt: input.disabled ? new Date() : null } });
    if (input.disabled) await tx.session.deleteMany({ where: { userId: target.id } });
    const workspaceId = memberships[0]?.workspaceId ?? (await tx.workspaceMember.findFirst({ where: { userId: input.adminId }, select: { workspaceId: true } }))?.workspaceId;
    if (workspaceId) await tx.auditLog.create({ data: { workspaceId, userId: input.adminId, action: input.disabled ? "user.disabled" : "user.restored", resourceType: "user", resourceId: target.id, metadata: { targetUserId: target.id, previousDisabled: Boolean(target.disabledAt), disabled: input.disabled, outcome: "success", sessionsRevoked: input.disabled } } });
    else await securityAudit(tx, input.adminId, input.disabled ? "user.disabled_without_workspace:" + target.id : "user.restored_without_workspace:" + target.id);
    return user;
  });
}
