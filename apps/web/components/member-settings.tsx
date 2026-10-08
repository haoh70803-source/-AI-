"use client";
import { Button, Card, Input } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MemberInvitations } from "./member-invitations";
type Member = { id: string; role: string; disabled: boolean; accountDisabled: boolean; createdAt: string; user: { id: string; name: string; email: string } };
const labels: Record<string, string> = { OWNER: "所有者", ADMIN: "管理员", EDITOR: "普通成员", VIEWER: "只读成员" };
export function MemberSettings({ members, actorId, owner }: { members: Member[]; actorId: string; owner: boolean }) {
  const router = useRouter(); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const filteredMembers = members.filter(member => {
    const matches = `${member.user.name} ${member.user.email}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    const disabled = member.disabled || member.accountDisabled;
    return matches && (!roleFilter || member.role === roleFilter) && (!statusFilter || (statusFilter === "disabled" ? disabled : !disabled));
  });
  async function mutate(path: string, method: string, body?: unknown) {
    if (submitting.current) return false;
    submitting.current = true; setBusy(true); setMessage("");
    try { const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const result = await response.json().catch(() => null); if (!response.ok) { setMessage(result?.message || "操作失败，请刷新后重试。"); return false; } setMessage(result?.message || "成员设置已更新。"); router.refresh(); return true; } catch { setMessage("网络连接失败，请重试。"); return false; } finally { submitting.current = false; setBusy(false); }
  }
  const roles = owner ? ["ADMIN", "EDITOR", "VIEWER"] : ["EDITOR", "VIEWER"];
  return <div className="fusion-members grid gap-6">
    <MemberInvitations owner={owner}/>
    <details className="settings-member-add"><summary>创建内部成员账号（兼容入口）</summary><Card className="mt-4 p-6"><h2 className="mb-2 font-semibold">添加成员</h2><p className="mb-4 text-sm text-[var(--text-secondary)]">创建鑫世界登录账号并加入当前公司。请通过可信渠道告知成员初始密码，首次登录后可在“我的账号”修改。</p>
      <form aria-busy={busy} className="grid gap-4 md:grid-cols-2" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); if (await mutate("/api/settings/members", "POST", data)) { form.reset(); const details = form.closest("details"); if (details) details.open = false; } }}>
        <label>姓名<Input name="name" minLength={2} maxLength={80} required /></label><label>登录邮箱<Input name="email" type="email" autoComplete="off" required /></label><label>初始密码<Input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label><label>初始角色<select name="role" defaultValue="EDITOR" className="ml-3 rounded border p-2">{roles.map(role => <option key={role} value={role}>{labels[role]}</option>)}</select></label><Button disabled={busy}>添加成员</Button>
      </form>
    </Card></details>
    <p role="status">{message}</p>{members.length <= 1 ? <p>公司还没有其他成员，可以在上方添加。</p> : null}
    <div className="fusion-member-toolbar"><label>搜索成员<Input aria-label="搜索成员" placeholder="姓名或邮箱" value={search} onChange={event => setSearch(event.target.value)} /></label><label>角色<select aria-label="筛选成员角色" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="">全部角色</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>状态<select aria-label="筛选成员状态" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已停用</option></select></label><span role="status">{filteredMembers.length} / {members.length} 位成员</span></div>
    {!filteredMembers.length ? <p className="fusion-empty">没有符合条件的成员，请调整搜索或筛选。</p> : null}
    <Card className="divide-y overflow-x-auto">{filteredMembers.map(member => {
      const editable = member.role !== "OWNER" && member.user.id !== actorId && (owner || member.role !== "ADMIN");
      return <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-medium">{member.user.name}{member.user.id === actorId ? "（你）" : ""}</p><p className="text-sm">{member.user.email}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{member.accountDisabled ? "登录账号已被平台停用" : "登录账号正常"} · {member.disabled ? "公司成员资格已停用" : "公司成员资格正常"} · 加入于 {member.createdAt.slice(0, 10)}</p></div><div className="flex flex-wrap items-center gap-3">{editable ? <><select aria-label={`${member.user.name}的角色`} value={member.role} disabled={busy} onChange={event => void mutate(`/api/settings/members/${member.id}`, "PATCH", { role: event.target.value })} className="rounded border p-2">{roles.map(role => <option key={role} value={role}>{labels[role]}</option>)}</select><Button variant="secondary" disabled={busy || member.accountDisabled} title={member.accountDisabled ? "请联系平台管理员恢复登录账号后再恢复成员资格" : undefined} onClick={() => void mutate(`/api/settings/members/${member.id}`, "PATCH", { disabled: !member.disabled })}>{member.disabled ? "恢复成员资格" : "停用成员资格"}</Button><Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(`移除 ${member.user.name} 后，对方将不能访问当前公司；已创建的项目和资料会保留。确定移除？`)) void mutate(`/api/settings/members/${member.id}`, "DELETE"); }}>移除</Button>{owner && !member.disabled && !member.accountDisabled ? <Button variant="ghost" disabled={busy} onClick={()=>{if(window.confirm(`将当前公司的负责人交接给 ${member.user.name}？你将保留管理员资格，其他公司不受影响。请确认对方身份和交接安排。`))void mutate("/api/settings/owner","POST",{memberId:member.id});}}>交接负责人</Button>:null}</> : <span>{labels[member.role]}</span>}</div></div>;
    })}</Card><p className="text-sm text-[var(--text-secondary)]">所有者管理管理员；管理员管理普通和只读成员。只读成员不能写入内容或执行 AI / 研究任务。所有者和自己的权限不可在此修改。</p>
  </div>;
}
