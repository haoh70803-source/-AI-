"use client";
import { Button, Input, Card } from "@content-center/ui";
import { useEffect, useRef, useState } from "react";
type Invite = { id: string; email: string; role: string; expiresAt: string; expired: boolean };
export function MemberInvitations({ owner }: { owner: boolean }) {
  const [invites,setInvites] = useState<Invite[]>([]), [available,setAvailable] = useState(false), [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const submitting = useRef(false);
  async function load() {
    const response = await fetch("/api/settings/invitations", { cache: "no-store" }); const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "无法读取邀请。");
    setInvites(data.invitations); setAvailable(data.delivery.available);
  }
  useEffect(() => { load().catch(() => setMessage("邀请列表读取失败，请重试。")).finally(() => setLoading(false)); }, []);
  async function mutate(method: string, body: unknown) {
    if (submitting.current) return false; submitting.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/settings/invitations", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setMessage(data?.message ?? "操作未完成，请稍后重试。"); return false; }
      setMessage(data?.message ?? "邀请已更新。"); await load(); return true;
    } catch { setMessage("网络连接失败。请刷新邀请列表确认结果，再重试。"); return false; }
    finally { submitting.current = false; setBusy(false); }
  }
  return <Card className="p-5"><h2 className="font-semibold">邀请成员</h2><p className="mt-2 text-sm">邀请发往成员本人邮箱，有效期 48 小时。本人接受后加入公司，已有账号的密码和其他公司权限保持原样。</p>
    {!loading && !available ? <p role="status" className="mt-3 text-sm">邮件服务尚未配置，暂不能发送邀请。不会创建成员或生成公开邀请链接。</p> : null}
    <form className="mt-4 grid gap-3 sm:grid-cols-3" aria-busy={busy} onSubmit={async event => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); if(await mutate("POST",{email:data.get("email"),role:data.get("role")}))form.reset(); }}>
      <label className="grid gap-2">成员邮箱<Input name="email" type="email" autoComplete="email" maxLength={320} required disabled={!available || busy} /></label>
      <label className="grid gap-2">公司角色<select name="role" defaultValue="EDITOR" disabled={!available || busy} className="rounded-lg border p-2">{owner?<option value="ADMIN">管理员</option>:null}<option value="EDITOR">普通成员</option><option value="VIEWER">只读成员</option></select></label>
      <Button disabled={loading || busy || !available}>{busy?"处理中…":"发送邀请"}</Button>
    </form>
    {loading?<p role="status" className="mt-3">正在读取邀请…</p>:!invites.length?<p className="mt-3 text-sm text-[var(--text-secondary)]">目前没有待接受的邀请。</p>:<ul className="mt-4 divide-y">{invites.map(invite=><li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="min-w-0 break-all">{invite.email}<small className="block">{invite.expired?"已过期":"待接受"} · {new Date(invite.expiresAt).toLocaleString("zh-CN")}</small></span><Button variant="secondary" disabled={busy || (!owner && invite.role==="ADMIN")} onClick={()=>void mutate("DELETE",{id:invite.id})}>撤回</Button></li>)}</ul>}
    {message?<p role="status" className="mt-3">{message}</p>:null}
    <button type="button" className="settings-small-action mt-3" disabled={busy || loading} onClick={()=>{setLoading(true);load().catch(()=>setMessage("读取失败，请重试。")).finally(()=>setLoading(false));}}>刷新邀请</button>
  </Card>;
}
