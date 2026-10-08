import { canManageWorkspace, canReadWorkspace, hasWorkspaceRole, type WorkspaceRole } from "@content-center/core";
import { db, findWorkspaceForUser } from "@content-center/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveWorkspaceMembership } from "./workspace-context";
import { auth } from "@/lib/auth";

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(process.env.DEMO_AUTO_LOGIN === "true" ? "/experience" : "/login?reason=reauth");
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { disabledAt: true } });
  if (!user || user.disabledAt) redirect("/login?reason=reauth");
  return session;
}

export async function requireWorkspace(workspaceId?: string) {
  const session = await requireSession();
  if (workspaceId) {
    const workspace = await findWorkspaceForUser(db, { userId: session.user.id, workspaceId });
    const membership = workspace?.members[0];
    if (!workspace || !membership) redirect("/workspace-unavailable");
    return { session, workspace, role: membership.role as WorkspaceRole };
  }

  const membership = await resolveWorkspaceMembership(session.user.id, session.session.id, true);
  if (!membership) redirect("/workspace-unavailable");
  return { session, workspace: membership.workspace, role: membership.role as WorkspaceRole };
}

export async function requireSystemAdmin() {
  const session = await requireSession();
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, systemRole: true, disabledAt: true },
  });
  if (!user || user.systemRole !== "SYSTEM_ADMIN" || user.disabledAt) redirect("/dashboard");
  return { session, user };
}

export async function requireWorkspaceRole(
  allowedRoles: readonly WorkspaceRole[],
  workspaceId?: string,
) {
  const context = await requireWorkspace(workspaceId);
  if (!hasWorkspaceRole(context.role, allowedRoles)) redirect("/dashboard");
  return context;
}

export { canManageWorkspace, canReadWorkspace };
