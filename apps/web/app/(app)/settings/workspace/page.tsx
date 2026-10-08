import { db } from "@content-center/db";
import { PageHeader } from "@/components/page";
import { WorkspaceSettings } from "@/components/account-settings";
import { requireWorkspace, canManageWorkspace } from "@/server/access";
export default async function WorkspacePage() {
  const { session, workspace, role } = await requireWorkspace();
  const [count, memberships] = await Promise.all([db.workspaceMember.count({ where: { workspaceId: workspace.id } }), db.workspaceMember.findMany({ where: { userId: session.user.id, disabledAt: null, workspace: { disabledAt: null } }, select: { workspace: { select: { id: true, name: true } } } })]);
  return <><PageHeader title="公司空间" description={`${workspace.name} · ${count} 位成员 · 创建于 ${workspace.createdAt.toISOString().slice(0, 10)} · 正常`} /><WorkspaceSettings currentId={workspace.id} name={workspace.name} canManage={canManageWorkspace(role)} spaces={memberships.map(m => m.workspace)} /></>;
}
