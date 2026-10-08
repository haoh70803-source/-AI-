"use client";

import { Button, Input } from "@content-center/ui";
import { CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SupportedPlatform } from "@/lib/platforms";

export function AddToPublishingButton({ projectId, platform, disabledReason, compact = false }: { projectId: string; platform: SupportedPlatform; disabledReason?: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(useSchedule: boolean) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/publish-tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, platform, scheduledAt: useSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "创建发布任务失败");
      router.push(`/calendar/tasks/${result.id}`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建发布任务失败"); }
    finally { setBusy(false); }
  }

  if (disabledReason) return <div className={compact ? "" : "mt-4"}><Button variant="secondary" disabled className="w-full"><CalendarPlus size={16} />加入发布中心</Button><p className="mt-2 text-xs text-[var(--text-secondary)]">{disabledReason}</p></div>;
  return <div className={compact ? "" : "mt-4"}>
    {!open ? <Button className="w-full" onClick={() => setOpen(true)}><CalendarPlus size={16} />加入发布中心</Button> : <div className="grid gap-3 rounded-xl border p-4">
      <label className="text-sm">计划发布时间（可选）<Input aria-label="计划发布时间" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-2" /></label>
      <div className="grid gap-2 sm:grid-cols-2"><Button variant="secondary" disabled={busy} onClick={() => create(false)}>加入待发布</Button><Button disabled={busy || !scheduledAt} onClick={() => create(true)}>按此时间排期</Button></div>
      <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>取消</Button>
      {error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>}
  </div>;
}
