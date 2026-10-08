"use client";
import { Button, Input } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { PASSWORD_HINT } from "@/lib/password-policy";
export function CreateUserForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    submitting.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }) });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) { setMessage(body?.message ?? "创建未完成，请检查输入后重试。"); return; }
      element.reset(); setMessage("账号已创建，个人内容空间已就绪。"); router.refresh();
    } catch { setMessage("网络连接失败。请刷新确认账号是否已创建，再重试，避免重复创建。"); }
    finally { submitting.current = false; setPending(false); }
  }
  return <form onSubmit={submit} className="grid gap-3 md:grid-cols-4" aria-busy={pending}>
    <label className="grid gap-2">姓名<Input name="name" autoComplete="name" minLength={2} maxLength={80} required /></label>
    <label className="grid gap-2">邮箱<Input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
    <label className="grid gap-2">初始密码<Input name="password" type="password" autoComplete="new-password" aria-describedby="admin-password-hint" minLength={8} maxLength={128} required /></label>
    <Button disabled={pending}>{pending ? "创建中…" : "创建用户"}</Button>
    <p id="admin-password-hint" className="text-sm text-[var(--text-secondary)] md:col-span-4">{PASSWORD_HINT}</p>
    {message ? <p role="status" className="text-sm text-[var(--text-secondary)] md:col-span-4">{message}</p> : null}
  </form>;
}
