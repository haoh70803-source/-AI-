import { PageHeader } from "@/components/page";
import { ProfileSettings } from "@/components/account-settings";
import { requireWorkspace } from "@/server/access";
export default async function AccountPage() {
  const { session, workspace, role } = await requireWorkspace();
  const labels = { OWNER: "所有者", ADMIN: "管理员", EDITOR: "普通成员", VIEWER: "只读成员" };
  return <><PageHeader title="我的账号" description={`当前公司：${workspace.name} · ${labels[role]}`} /><ProfileSettings name={session.user.name} email={session.user.email} userId={session.user.id} /></>;
}
