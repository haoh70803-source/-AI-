import { createHash, randomBytes } from "node:crypto";
import { db, assertTestDatabaseTarget, type Prisma } from "@content-center/db";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { AccountSpaceError } from "./account-space";
import type { AccountDelivery } from "./account-delivery";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../lib/password-policy";

const password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
export const resetInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password }).strict();
const genericRecovery = "如果账号可用且邮件送达，请检查邮箱。未收到邮件可联系平台管理员；本次请求不会恢复停用账号。";
type Challenge = { kind: "reset" | "verify" | "invite"; userId?: string; email: string; workspaceId?: string; inviterId?: string; role?: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" };
const identifier = (token: string) => "account-challenge:" + createHash("sha256").update(token).digest("hex");
function requireDelivery(delivery?: AccountDelivery): asserts delivery is AccountDelivery {
  if (!delivery) throw new AccountSpaceError(503, "邮件服务尚未配置，请联系平台管理员安排受控恢复。");
  // Until an approved real provider exists, injected delivery is sandbox-only.
  try { assertTestDatabaseTarget(process.env); }
  catch { throw new AccountSpaceError(503, "正式邮件服务尚未接入，不能启用测试发送器。"); }
}
export async function securityAudit(tx: Prisma.TransactionClient, userId: string, action: string) {
  const member = await tx.workspaceMember.findFirst({ where: { userId }, select: { workspaceId: true }, orderBy: { createdAt: "asc" } });
  // Users without membership still get an account-scoped event in Verification.
  if (member) await tx.auditLog.create({ data: { workspaceId: member.workspaceId, userId, action, resourceType: "user", resourceId: userId, metadata: { outcome: "success" } } });
  else await tx.verification.create({ data: { identifier: "account-audit:" + userId, value: JSON.stringify({ action, userId, outcome: "success", occurredAt: new Date().toISOString() }), expiresAt: new Date(Date.now() + 90 * 86400000) } });
}
async function createChallenge(data: Challenge, minutes: number) {
  const token = randomBytes(32).toString("hex");
  const id = identifier(token);
  await db.verification.create({ data: { id, identifier: id, value: JSON.stringify(data), expiresAt: new Date(Date.now() + minutes * 60000) } });
  return { token, id };
}
async function readChallenge(tx: Prisma.TransactionClient, token: string, kind: Challenge["kind"]) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AccountSpaceError(400, "链接无效或已过期，请重新申请。");
  const id = identifier(token);
  await tx.$queryRaw`SELECT id FROM "Verification" WHERE id = ${id} FOR UPDATE`;
  const row = await tx.verification.findUnique({ where: { id } });
  if (!row || row.expiresAt.getTime() <= Date.now()) throw new AccountSpaceError(400, "链接无效或已过期，请重新申请。");
  const data = JSON.parse(row.value) as Challenge;
  if (data.kind !== kind) throw new AccountSpaceError(400, "链接无效或已过期，请重新申请。");
  return { id, data };
}
async function activeUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, disabledAt: true } });
  if (!user || user.disabledAt) throw new AccountSpaceError(400, "链接无效或账号不可用，请联系平台管理员。");
  return user;
}
function callback(kind: "reset" | "verify" | "invite", token: string) {
  const app = new URL(process.env.APP_URL!);
  return new URL("/account/" + kind + "#token=" + token, app.origin).href;
}
export async function requestPasswordRecovery(emailInput: unknown, delivery?: AccountDelivery) {
  requireDelivery(delivery);
  const email = z.string().trim().toLowerCase().email().max(320).parse(emailInput);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, disabledAt: true } });
  if (user && !user.disabledAt) {
    const challenge = await createChallenge({ kind: "reset", email, userId: user.id }, 20);
    try { await delivery({ to: email, kind: "reset", url: callback("reset", challenge.token) }); }
    catch { await db.verification.deleteMany({ where: { id: challenge.id } }); }
  }
  return { message: genericRecovery };
}
export async function finishPasswordRecovery(input: unknown, delivery?: AccountDelivery) {
  if (delivery) requireDelivery(delivery);
  const data = resetInput.parse(input);
  const hashed = await hashPassword(data.password);
  const result = await db.$transaction(async tx => {
    const grant = await readChallenge(tx, data.token, "reset");
    const user = await activeUser(tx, grant.data.userId!);
    if (user.email !== grant.data.email) throw new AccountSpaceError(400, "链接无效或已过期，请重新申请。");
    const updated = await tx.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { password: hashed } });
    if (!updated.count) throw new AccountSpaceError(400, "该账号无法使用密码恢复，请联系平台管理员。");
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.verification.delete({ where: { id: grant.id } });
    await securityAudit(tx, user.id, "account.password_reset");
    return { email: user.email };
  });
  let notified = false;
  if (delivery) try { await delivery({ to: result.email, kind: "security", text: "登录密码已修改，所有设备登录已退出。如非本人操作，请联系平台管理员。" }); notified = true; } catch { /* The committed reset is not rolled back by delivery failure. */ }
  return { message: "密码已更新，所有设备需要重新登录。", securityNoticeDelivered: notified };
}
export async function requestEmailVerification(userId: string, delivery?: AccountDelivery) {
  requireDelivery(delivery);
  const user = await db.user.findFirst({ where: { id: userId, disabledAt: null }, select: { id: true, email: true, emailVerified: true } });
  if (!user) throw new AccountSpaceError(401, "请重新登录。");
  if (user.emailVerified) return { message: "邮箱已验证。" };
  const grant = await createChallenge({ kind: "verify", email: user.email, userId }, 20);
  try { await delivery({ to: user.email, kind: "verify", url: callback("verify", grant.token) }); }
  catch { await db.verification.deleteMany({ where: { id: grant.id } }); throw new AccountSpaceError(503, "邮件发送未完成，请稍后重试。"); }
  return { message: "验证邮件已发送，请在 20 分钟内打开。" };
}
export async function finishEmailVerification(token: string, userId: string) {
  await db.$transaction(async tx => {
    const grant = await readChallenge(tx, token, "verify");
    if (grant.data.userId !== userId) throw new AccountSpaceError(403, "请使用收到邮件的账号登录后验证。");
    const user = await activeUser(tx, userId);
    if (user.email !== grant.data.email) throw new AccountSpaceError(400, "链接无效或已过期。");
    await tx.user.update({ where: { id: userId }, data: { emailVerified: true } });
    await tx.verification.delete({ where: { id: grant.id } });
    await securityAudit(tx, userId, "account.email_verified");
  });
  return { message: "邮箱已验证。" };
}

export const invitationInput = z.object({ email: z.string().trim().toLowerCase().email().max(320), role: z.enum(["ADMIN","EDITOR","VIEWER"]) }).strict();
export async function issueInvitation(workspaceId: string, actorId: string, input: unknown, delivery?: AccountDelivery) {
  requireDelivery(delivery);
  const data = invitationInput.parse(input);
  return issueInvitationForRole(workspaceId, actorId, data.email, data.role, delivery);
}
async function invitationActor(tx: Prisma.TransactionClient, workspaceId: string, actorId: string, role: Challenge["role"]) {
  await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
  if (role === "OWNER") {
    const actor = await tx.user.findFirst({ where: { id: actorId, systemRole: "SYSTEM_ADMIN", disabledAt: null }, select: { id: true } });
    const workspace = await tx.workspace.findFirst({ where: { id: workspaceId, disabledAt: null }, select: { id: true } });
    const opened = await tx.auditLog.findFirst({ where: { workspaceId, action: "workspace.opened_pending_owner", resourceId: workspaceId }, select: { id: true } });
    if (!actor || !workspace || !opened) throw new AccountSpaceError(403, "没有权限开通该空间。");
    if (await tx.workspaceMember.count({ where: { workspaceId } })) throw new AccountSpaceError(409, "该空间已有成员，不能通过负责人邀请转移所有权。");
    return;
  }
  const actor = await tx.workspaceMember.findFirst({ where: { workspaceId, userId: actorId, disabledAt: null, user: { disabledAt: null }, workspace: { disabledAt: null } }, select: { role: true } });
  if (!actor || !["OWNER","ADMIN"].includes(actor.role) || (role === "ADMIN" && actor.role !== "OWNER")) throw new AccountSpaceError(403, "没有权限邀请这个角色。");
}
async function issueInvitationForRole(workspaceId: string, actorId: string, email: string, role: NonNullable<Challenge["role"]>, delivery: AccountDelivery) {
  const token = randomBytes(32).toString("hex"), id = identifier(token);
  const workspace = await db.$transaction(async tx => {
    await invitationActor(tx, workspaceId, actorId, role);
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true, disabledAt: true } });
    if (existing?.disabledAt || (existing && await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: existing.id } } }))) throw new AccountSpaceError(409, "该账号不可邀请，或已经是当前公司成员。停用资格须通过恢复流程处理。");
    const row = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } });
    await tx.verification.create({ data: { id, identifier: "account-invite:" + workspaceId, value: JSON.stringify({ kind: "invite", workspaceId, inviterId: actorId, email, role } satisfies Challenge), expiresAt: new Date(Date.now() + 48 * 3600000) } });
    await tx.auditLog.create({ data: { workspaceId, userId: actorId, action: "member.invitation_created", resourceType: "invitation", resourceId: id, metadata: { role, outcome: "pending_delivery" } } });
    return row;
  });
  try { await delivery({ to: email, kind: "invite", url: callback("invite", token), workspaceName: workspace.name }); }
  catch {
    await db.$transaction(async tx => {
      await tx.verification.deleteMany({ where: { id } });
      await tx.auditLog.create({ data: { workspaceId, userId: actorId, action: "member.invitation_delivery_failed", resourceType: "invitation", resourceId: id, metadata: { outcome: "failed" } } });
    });
    throw new AccountSpaceError(503, "邀请邮件发送失败，邀请已撤回。可以稍后重新发送。");
  }
  return { id, expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(), message: "邀请已发送，48 小时内有效。" };
}
export async function openCustomerWorkspace(actorId: string, input: unknown, delivery?: AccountDelivery) {
  requireDelivery(delivery);
  const data = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(320) }).strict().parse(input);
  const workspace = await db.$transaction(async tx => {
    const actor = await tx.user.findFirst({ where: { id: actorId, systemRole: "SYSTEM_ADMIN", disabledAt: null }, select: { id: true } });
    if (!actor) throw new AccountSpaceError(403, "只有平台管理员可以开通客户空间。");
    const row = await tx.workspace.create({ data: { name: data.name, slug: "customer-" + randomBytes(12).toString("hex") } });
    await tx.auditLog.create({ data: { workspaceId: row.id, userId: actorId, action: "workspace.opened_pending_owner", resourceType: "workspace", resourceId: row.id, metadata: { outcome: "awaiting_owner" } } });
    return row;
  });
  // Delivery failure preserves the empty space and audit, rather than deleting a scope.
  const invitation = await issueInvitationForRole(workspace.id, actorId, data.email, "OWNER", delivery);
  return { workspace: { id: workspace.id, name: workspace.name }, invitation };
}
export async function listInvitations(workspaceId: string, actorId: string) {
  return db.$transaction(async tx => {
    await invitationActor(tx, workspaceId, actorId, "EDITOR");
    const rows = await tx.verification.findMany({ where: { identifier: "account-invite:" + workspaceId }, orderBy: { createdAt: "desc" } });
    return rows.map(row => { const data = JSON.parse(row.value) as Challenge; return { id: row.id, email: data.email, role: data.role, expiresAt: row.expiresAt.toISOString(), expired: row.expiresAt.getTime() <= Date.now() }; });
  });
}
export async function revokeInvitation(workspaceId: string, actorId: string, id: string) {
  await db.$transaction(async tx => {
    await invitationActor(tx, workspaceId, actorId, "EDITOR");
    const row = await tx.verification.findFirst({ where: { id, identifier: "account-invite:" + workspaceId } });
    if (!row) throw new AccountSpaceError(404, "邀请不存在或已撤回。");
    const data = JSON.parse(row.value) as Challenge;
    if (data.role === "OWNER") throw new AccountSpaceError(403, "负责人邀请只能由平台管理员管理。");
    await invitationActor(tx, workspaceId, actorId, data.role);
    await tx.verification.delete({ where: { id } });
    await tx.auditLog.create({ data: { workspaceId, userId: actorId, action: "member.invitation_revoked", resourceType: "invitation", resourceId: id, metadata: { outcome: "success" } } });
  });
  return { message: "邀请已撤回，原链接立即失效。" };
}
export async function acceptInvitation(input: unknown, sessionUserId?: string) {
  const data = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), email: z.string().trim().toLowerCase().email().max(320), name: z.string().trim().min(2).max(80).optional(), password: password.optional() }).strict().parse(input);
  // This hash is only for a new invitee; existing identities never get reset here.
  const hashed = data.password ? await hashPassword(data.password) : undefined;
  return db.$transaction(async tx => {
    // Lock the workspace before the challenge, matching revoke/issue lock order.
    const preview = await tx.verification.findUnique({ where: { id: identifier(data.token) }, select: { value: true } });
    if (!preview) throw new AccountSpaceError(400, "链接无效或已过期，请重新申请。");
    const previewData = JSON.parse(preview.value) as Challenge;
    if (previewData.kind !== "invite" || !previewData.workspaceId) throw new AccountSpaceError(400, "链接无效或已过期。");
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${previewData.workspaceId} FOR NO KEY UPDATE`;
    const grant = await readChallenge(tx, data.token, "invite");
    if (grant.data.email !== data.email) throw new AccountSpaceError(403, "邮箱与邀请不一致。");
    const { workspaceId, inviterId, role } = grant.data;
    await invitationActor(tx, workspaceId!, inviterId!, role);
    let user = await tx.user.findUnique({ where: { email: data.email }, select: { id: true, disabledAt: true } });
    if (user) {
      if (sessionUserId !== user.id) throw new AccountSpaceError(401, "这是已有账号，请先使用受邀邮箱登录，再打开邀请。");
      await activeUser(tx, user.id);
      if (data.password) throw new AccountSpaceError(400, "已有账号接受邀请时无需设置密码。");
    } else {
      if (sessionUserId) throw new AccountSpaceError(403, "请退出其他账号后接受邀请。");
      if (!hashed || !data.name) throw new AccountSpaceError(400, "请填写姓名和 8–128 位密码。");
      user = await tx.user.create({ data: { name: data.name, email: data.email, emailVerified: true }, select: { id: true, disabledAt: true } });
      const { createLocalAccountIssuer } = await import("@better-auth/core/db");
      await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", issuer: createLocalAccountIssuer("credential"), password: hashed } });
    }
    if (await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspaceId!, userId: user.id } } })) throw new AccountSpaceError(409, "你已加入或成员资格已停用。请通过成员管理处理。");
    await tx.user.update({ where: { id: user.id }, data: { emailVerified: true } });
    await tx.workspaceMember.create({ data: { workspaceId: workspaceId!, userId: user.id, role: role! } });
    await tx.verification.delete({ where: { id: grant.id } });
    await tx.auditLog.create({ data: { workspaceId: workspaceId!, userId: user.id, action: "member.invitation_accepted", resourceType: "user", resourceId: user.id, metadata: { role: role!, outcome: "success" } } });
    return { message: "已加入公司空间。请登录后选择该空间。", requiresLogin: !sessionUserId };
  });
}
