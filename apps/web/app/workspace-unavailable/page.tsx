import Link from "next/link";
import { db } from "@content-center/db";
import { requireSession } from "@/server/access";
import { WorkspaceSettings, ProfileSettings } from "@/components/account-settings";
export default async function UnavailablePage() {
  const session = await requireSession();
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { systemRole: true } });
  const memberships = await db.workspaceMember.findMany({ where: { userId: session.user.id, disabledAt: null, workspace: { disabledAt: null } }, select: { workspace: { select: { id: true, name: true } } } });
  return <main className="mx-auto grid max-w-3xl gap-6 p-8"><h1 className="text-2xl font-semibold">当前公司空间不可用</h1><p>公司空间或你的成员资格已停用，或者你已被移出公司。请联系管理员，或选择其他可用空间。</p><WorkspaceSettings currentId="" name="" canManage={false} spaces={memberships.map(m => m.workspace)} />{user?.systemRole === "SYSTEM_ADMIN" ? <Link className="underline" href="/platform/accounts">进入平台账号与客户空间管理</Link> : null}<ProfileSettings name={session.user.name} email={session.user.email} /></main>;
}
