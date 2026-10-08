"use client";
import Link from "next/link";
import { Button, Input } from "@content-center/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PASSWORD_HINT } from "@/lib/password-policy";
type Kind = "recovery" | "reset" | "verify" | "invite";
export function AccountSecurityForm({ kind, mailAvailable, signedInEmail }: { kind: Kind; mailAvailable: boolean; signedInEmail?: string }) {
  const [token,setToken] = useState(""), [message,setMessage] = useState(""), [error,setError] = useState(""), [busy,setBusy] = useState(false), [done,setDone] = useState(false);
  const submitting = useRef(false);
  const [ready,setReady] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(/^[a-f0-9]{64}$/.test(value) ? value : "");
    setDone(false); setError(""); setMessage("");
    // Keep the grant out of the address bar, referrers and navigation history.
    if (window.location.hash) window.history.replaceState(window.history.state,"",window.location.pathname);
    setReady(true);
  }, [kind]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const form = event.currentTarget, data = new FormData(form);
    setError(""); setMessage("");
    if ((kind === "reset" || (kind === "invite" && !signedInEmail)) && data.get("password") !== data.get("confirm")) { setError("两次密码不一致。"); form.querySelector<HTMLInputElement>('[name="confirm"]')?.focus(); return; }
    submitting.current = true; setBusy(true);
    try {
      const path = kind === "invite" ? "invitation" : kind === "verify" ? "verification" : "recovery";
      const body = kind === "recovery" ? { email: data.get("email") } : kind === "verify" ? { token } : kind === "reset" ? { token, password: data.get("password") } : { token, email: signedInEmail ?? data.get("email"), ...(!signedInEmail ? { name: data.get("name"), password: data.get("password") } : {}) };
      const response = await fetch("/api/account/" + path, { method: ["reset","verify"].includes(kind) ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok) { setError(result?.message ?? (response.status === 429 ? "请求过于频繁，请稍后重试。" : "操作未完成，请检查链接或联系管理员。")); return; }
      form.reset(); setMessage(result?.message ?? "操作已完成。");
      if (kind !== "recovery") { setDone(true); setToken(""); }
    } catch { setError("网络连接失败。请确认网络后重试；链接若已使用，请重新登录或申请新的链接。"); }
    finally { submitting.current = false; setBusy(false); }
  }
  const missingLink = ready && kind !== "recovery" && !token && !done;
  return <div className="space-y-4">
    <h2 className="text-xl font-semibold">{{ recovery: "找回密码", reset: "设置新密码", verify: "验证邮箱", invite: "接受公司邀请" }[kind]}</h2>
    {kind === "recovery" ? <p className="text-sm">恢复不会重新启用停用账号，也不会恢复公司成员资格。新密码由你本人设置。</p> : null}
    {kind === "reset" ? <p className="text-sm">提交后所有登录设备将退出，请使用新密码重新登录。</p> : null}
    {kind === "invite" ? <p className="text-sm">{signedInEmail ? "使用当前登录账号接受邀请。邮箱必须与邀请一致。" : "已有账号请先登录，再从邮件重新打开邀请；新成员可以在此设置本人密码。"}</p> : null}
    {!mailAvailable && kind === "recovery" ? <p role="status" className="rounded-lg border p-3">邮件服务尚未配置，暂不能发送恢复邮件。请联系平台管理员安排受控恢复。</p> : null}
    {!ready && kind !== "recovery" ? <p role="status">正在检查链接…</p> : null}
    {missingLink ? <p role="alert">链接缺失或已失效。请从邮件重新打开，或申请新的链接。</p> : null}
    {!done ? <form onSubmit={submit} aria-busy={busy} className="space-y-4">
      {kind === "recovery" || kind === "invite" ? <label className="block space-y-2"><span>登录邮箱</span><Input name="email" type="email" autoComplete="email" maxLength={320} defaultValue={signedInEmail} readOnly={!!signedInEmail} required /></label> : null}
      {kind === "invite" && !signedInEmail ? <label className="block space-y-2"><span>姓名</span><Input name="name" autoComplete="name" minLength={2} maxLength={80} required /></label> : null}
      {kind === "reset" || (kind === "invite" && !signedInEmail) ? <><label className="block space-y-2"><span>新密码</span><Input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} aria-describedby="account-password-hint" required /></label><label className="block space-y-2"><span>确认密码</span><Input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} aria-invalid={error === "两次密码不一致。"} aria-describedby="account-action-error" required /></label><p id="account-password-hint" className="text-sm text-[var(--text-secondary)]">{PASSWORD_HINT}</p></> : null}
      {kind === "verify" ? <p>请先登录收到验证邮件的账号。此操作只验证邮箱，不修改权限。</p> : null}
      <Button className="w-full" disabled={busy || !ready || missingLink || (kind === "recovery" && !mailAvailable)}>{busy ? "处理中…" : kind === "recovery" ? "申请恢复邮件" : "确认提交"}</Button>
    </form> : null}
    {error ? <p id="account-action-error" role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    <Link href="/login" className="inline-block text-sm underline">返回登录</Link>
  </div>;
}
