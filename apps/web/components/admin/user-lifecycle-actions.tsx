"use client";

import { Button } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function UserLifecycleActions({ userId, disabled, canChange = true }: { userId: string; disabled: boolean; canChange?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  async function change() {
    if (submitting.current) return;
    if (!disabled && !window.confirm("停用后该用户将无法登录，现有登录会话也会失效。确定继续吗？")) return;
    submitting.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ disabled: !disabled }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "操作失败");
      setMessage(disabled ? "登录账号已恢复；公司成员资格保持原状态" : "登录账号已停用，现有会话已退出"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败"); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (!canChange) return <span className="text-xs text-[var(--text-secondary)]">{disabled ? "系统管理员账号需受控恢复" : "系统管理员账号受保护"}</span>;
  return <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" className="h-8 px-2 text-xs" disabled={busy} onClick={() => void change()}>{busy ? "处理中…" : disabled ? "恢复登录账号" : "停用登录账号"}</Button>{message ? <span role="status" className="text-xs text-[var(--text-secondary)]">{message}</span> : null}</div>;
}
