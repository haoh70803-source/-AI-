import Link from "next/link";
import { db } from "@content-center/db";
import { Card } from "@content-center/ui";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { UserLifecycleActions } from "@/components/admin/user-lifecycle-actions";
import { PageHeader } from "@/components/page";
import { requireSystemAdmin } from "@/server/access";

export default async function AdminUsersPage() {
  await requireSystemAdmin();
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, systemRole: true, disabledAt: true, createdAt: true, workspaceMemberships: { take: 1, select: { workspace: { select: { name: true } } } }, sessions: { take: 1, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  return <>
    <PageHeader title="平台账号" description="查看登录账号状态。客户成员权限在各自公司空间管理；开通客户请选择“客户空间”。" />
    <nav aria-label="平台账号与空间" className="mb-5 flex flex-wrap gap-4 text-sm"><Link className="underline" href="/platform/accounts">平台账号</Link><Link className="underline" href="/platform/spaces">客户空间与负责人邀请</Link></nav>
    <Card className="mb-6 p-5"><CreateUserForm /></Card>
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-b border-[var(--border)] text-[var(--text-secondary)]"><tr>{["用户", "邮箱", "Workspace", "系统角色", "状态", "创建时间", "最近登录", "操作"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead>
        <tbody>{users.map((user) => <tr key={user.id} className="border-b border-[var(--border)] last:border-0">
          <td className="px-4 py-3 font-medium">{user.name}</td><td className="px-4 py-3">{user.email}</td><td className="px-4 py-3">{user.workspaceMemberships[0]?.workspace.name ?? "未创建"}</td><td className="px-4 py-3">{user.systemRole}</td><td className="px-4 py-3">{user.disabledAt ? "已停用" : "正常"}</td><td className="px-4 py-3">{user.createdAt.toLocaleString("zh-CN")}</td><td className="px-4 py-3">{user.sessions[0]?.updatedAt.toLocaleString("zh-CN") ?? "尚未登录"}</td><td className="px-4 py-3"><UserLifecycleActions userId={user.id} disabled={Boolean(user.disabledAt)} canChange={user.systemRole !== "SYSTEM_ADMIN"} /></td>
        </tr>)}</tbody>
      </table>
    </Card>
  </>;
}
