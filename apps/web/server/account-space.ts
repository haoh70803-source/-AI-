import { createLocalAccountIssuer } from "@better-auth/core/db";
import { db, type Prisma } from "@content-center/db";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

export const memberInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
}).strict();
export const memberChange = z.union([
  z.object({ role: z.enum(["ADMIN", "EDITOR", "VIEWER"]) }).strict(),
  z.object({ disabled: z.boolean() }).strict(),
]);
export class AccountSpaceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
async function manager(tx: Prisma.TransactionClient, workspaceId: string, userId: string) {
  // Serialize governance mutations within a company, including concurrent role changes.
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const actor = await tx.workspaceMember.findFirst({ where: { workspaceId, userId, disabledAt: null, user: { disabledAt: null }, workspace: { disabledAt: null } } });
  if (!actor || !["OWNER", "ADMIN"].includes(actor.role)) throw new AccountSpaceError(403, "你没有权限修改这个设置。");
  return actor;
}
export async function createMember(workspaceId: string, userId: string, input: unknown) {
  const data = memberInput.parse(input);
  const password = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    const actor = await manager(tx, workspaceId, userId);
    if (actor.role !== "OWNER" && data.role === "ADMIN") throw new AccountSpaceError(403, "只有所有者可以管理管理员。");
    // Never attach or reset an existing account by guessing its email.
    if (await tx.user.findUnique({ where: { email: data.email }, select: { id: true } })) throw new AccountSpaceError(409, "该账号无法直接创建。请使用新的登录邮箱，已有账号暂不支持直接加入。");
    const user = await tx.user.create({ data: { name: data.name, email: data.email } });
    await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", issuer: createLocalAccountIssuer("credential"), password } });
    const member = await tx.workspaceMember.create({ data: { workspaceId, userId: user.id, role: data.role } });
    await tx.auditLog.create({ data: { workspaceId, userId, action: "member.created", resourceType: "workspace_member", resourceId: member.id, metadata: { role: data.role } } });
    return { id: member.id };
  });
}
export async function changeMember(workspaceId: string, userId: string, memberId: string, input: unknown, remove = false) {
  const change = remove ? null : memberChange.parse(input);
  return db.$transaction(async (tx) => {
    const actor = await manager(tx, workspaceId, userId);
    const target = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId }, include: { user: { select: { disabledAt: true } } } });
    if (!target) throw new AccountSpaceError(404, "成员不存在或已被移除。");
    if (target.userId === userId || target.role === "OWNER") throw new AccountSpaceError(403, "不能修改自己或所有者的成员权限。");
    if (actor.role !== "OWNER" && (target.role === "ADMIN" || (change && "role" in change && change.role === "ADMIN"))) throw new AccountSpaceError(403, "只有所有者可以管理管理员。");
    if (change && "disabled" in change && !change.disabled && target.user.disabledAt) throw new AccountSpaceError(409, "该登录账号已被平台停用。恢复公司成员资格不能恢复登录，请联系平台管理员核查。");
    if (remove) await tx.workspaceMember.delete({ where: { id: target.id } });
    else await tx.workspaceMember.update({ where: { id: target.id }, data: change && "role" in change ? { role: change.role } : { disabledAt: change && "disabled" in change && change.disabled ? new Date() : null } });
    await tx.auditLog.create({ data: { workspaceId, userId, action: remove ? "member.removed" : "member.updated", resourceType: "workspace_member", resourceId: target.id, metadata: change ?? {} } });
    return { ok: true };
  });
}

export async function createInternalPlatformUser(actorId: string, input: unknown) {
  const data = memberInput.omit({ role: true }).parse(input);
  const password = await hashPassword(data.password);
  return db.$transaction(async tx => {
    const actor = await tx.user.findFirst({ where: { id: actorId, systemRole: "SYSTEM_ADMIN", disabledAt: null }, select: { id: true } });
    if (!actor) throw new AccountSpaceError(403, "只有平台管理员可以创建内部账号。");
    if (await tx.user.findUnique({ where: { email: data.email }, select: { id: true } })) throw new AccountSpaceError(409, "该账号已存在，请核查后重试。");
    const user = await tx.user.create({ data: { name: data.name, email: data.email }, select: { id: true, name: true, email: true } });
    await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", issuer: createLocalAccountIssuer("credential"), password } });
    const workspace = await tx.workspace.create({ data: { name: user.name + "的内容空间", slug: "personal-" + user.id, members: { create: { userId: user.id, role: "OWNER" } } } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, userId: actorId, action: "user.created", resourceType: "user", resourceId: user.id, metadata: { outcome: "success", initialRole: "USER" } } });
    return user;
  });
}
export async function transferWorkspaceOwner(workspaceId: string, actorId: string, memberId: string) {
  return db.$transaction(async tx => {
    const actor = await manager(tx, workspaceId, actorId);
    if (actor.role !== "OWNER") throw new AccountSpaceError(403, "只有当前所有者可以交接负责人。");
    const candidate = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId }, select: { userId: true } });
    if (candidate) await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${candidate.userId} FOR UPDATE`;
    const target = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId, disabledAt: null, user: { disabledAt: null } }, select: { id: true, userId: true, role: true } });
    if (!target || target.userId === actorId || target.role === "OWNER") throw new AccountSpaceError(400, "请选择本公司另一位有效成员。");
    await tx.workspaceMember.update({ where: { id: target.id }, data: { role: "OWNER" } });
    await tx.workspaceMember.update({ where: { id: actor.id }, data: { role: "ADMIN" } });
    await tx.auditLog.create({ data: { workspaceId, userId: actorId, action: "workspace.owner_transferred", resourceType: "workspace_member", resourceId: target.id, metadata: { previousOwnerId: actorId, newOwnerId: target.userId, previousRole: target.role, outcome: "success" } } });
    return { message: "负责人已交接，你保留公司管理员资格。" };
  });
}
