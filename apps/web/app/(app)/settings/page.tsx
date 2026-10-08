import Link from "next/link";
import { PageHeader } from "@/components/page";
import { requireWorkspace } from "@/server/access";
export default async function GeneralSettings() {
 const {session,workspace,role}=await requireWorkspace();
 const roles={OWNER:"所有者",ADMIN:"管理员",EDITOR:"普通成员",VIEWER:"只读成员"};
 return <><PageHeader title="通用" description="管理当前工作台的账号、服务和保存位置。"/><section className="settings-preferences"><div><div><h2>当前账号</h2><p>{session.user.name} · {session.user.email}</p></div><Link href="/settings/account" replace>管理账号</Link></div><div><div><h2>公司空间</h2><p>{workspace.name} · {roles[role]}</p></div><Link href="/settings/workspace" replace>查看空间</Link></div><div><div><h2>本机文件存储</h2><p>查看上传资料的本地目录，检查读写或更改保存位置。</p></div><Link href="/settings/storage" replace>管理存储</Link></div><div><div><h2>模型与 API</h2><p>使用公司配置连接模型、研究数据和转录服务。</p></div><Link href="/settings/integrations" replace>配置服务</Link></div></section><p className="settings-footnote">设置仅作用于当前账号或公司空间。关闭窗口即可继续之前的工作。</p></>;
}
