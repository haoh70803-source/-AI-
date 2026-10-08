import { db } from "@content-center/db";
import { PageHeader } from "@/components/page";
import { MemberSettings } from "@/components/member-settings";
import { requireWorkspace } from "@/server/access";
export default async function MembersPage() {
  const { workspace, session, role } = await requireWorkspace();
  if (!["OWNER", "ADMIN"].includes(role)) return <><PageHeader title="成员与权限" description="你没有权限管理成员。请联系公司所有者或管理员。" /></>;
  const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id }, select: { id: true, role: true, disabledAt: true, createdAt: true, user: { select: { id: true, name: true, email: true, disabledAt: true } } }, orderBy: { createdAt: "asc" } });
  return <><PageHeader title="成员与权限" description={workspace.name + " · " + members.length + " 位成员"} /><MemberSettings owner={role === "OWNER"} actorId={session.user.id} members={members.map(m => ({ id: m.id, role: m.role, disabled: Boolean(m.disabledAt), accountDisabled: Boolean(m.user.disabledAt), createdAt: m.createdAt.toISOString(), user: { id: m.user.id, name: m.user.name, email: m.user.email } }))} /></>;
}
