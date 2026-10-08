"use client";

import { Button, Input } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectForm({ sourceItemId, initialIdea }: { sourceItemId?: string; initialIdea?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(formData.get("title") || ""),
          goal: String(formData.get("goal") || ""),
          audience: String(formData.get("audience") || ""),
          description: String(formData.get("description") || ""),
          sourceItemId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "无法开始创作");
      router.push(`/dashboard?project=${result.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法开始创作");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="grid gap-5">
      <label className="grid gap-2 text-sm font-medium">创作名称 *<Input name="title" required maxLength={200} defaultValue={initialIdea?.slice(0, 200)} placeholder="例如：短视频内容生产方法论" /></label>
      <label className="grid gap-2 text-sm font-medium">创作目标<textarea name="goal" maxLength={2000} rows={3} className="rounded-[var(--radius)] border bg-[var(--surface)] p-3 font-normal outline-none focus:border-[var(--accent)]" placeholder="这篇内容希望达成什么目标？" /></label>
      <label className="grid gap-2 text-sm font-medium">目标受众<textarea name="audience" maxLength={2000} rows={3} className="rounded-[var(--radius)] border bg-[var(--surface)] p-3 font-normal outline-none focus:border-[var(--accent)]" placeholder="内容写给谁？" /></label>
      <label className="grid gap-2 text-sm font-medium">创作说明<textarea name="description" maxLength={5000} rows={5} defaultValue={initialIdea} className="rounded-[var(--radius-control)] border bg-[var(--surface)] p-3 font-normal outline-none focus:border-[var(--accent)]" placeholder="补充这次创作的背景和边界。" /></label>
      {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
      <div><Button disabled={busy}>{busy ? "正在开始…" : "开始创作"}</Button></div>
    </form>
  );
}
