import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";

/** A stored selection never falls through to another company when access is lost. */
export async function resolveWorkspaceMembership(userId: string, sessionId: string, provision = false) {
  const session = await db.session.findFirst({ where: { id: sessionId, userId }, select: { activeWorkspaceId: true } });
  if (!session) return null;
  const active = { userId, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } };
  if (session.activeWorkspaceId) {
    return db.workspaceMember.findFirst({ where: { ...active, workspaceId: session.activeWorkspaceId }, include: { workspace: true } });
  }
  let membership = await db.workspaceMember.findFirst({ where: active, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  if (!membership && provision && !await db.workspaceMember.count({ where: { userId } })) {
    await ensurePersonalWorkspaceForUser(db, { userId });
    membership = await db.workspaceMember.findFirst({ where: active, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  }
  if (membership) await db.session.updateMany({ where: { id: sessionId, userId, activeWorkspaceId: null }, data: { activeWorkspaceId: membership.workspaceId } });
  return membership;
}
