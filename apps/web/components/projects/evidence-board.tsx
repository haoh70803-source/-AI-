"use client";

import { Badge, Button } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CreativeBasisSummary } from "@/server/studio/creative-basis";
import { StudioDrawer } from "./studio-drawer";

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "操作失败");
}

export function EvidenceBoard({ projectId, summary, editable }: { projectId: string; summary: CreativeBasisSummary; editable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function action(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }
  function save(item: CreativeBasisSummary["items"][number], formData: FormData) {
    const value = String(formData.get("text") || "").trim();
    if (item.evidenceId) return call(`/api/projects/${projectId}/evidence/${item.evidenceId}`, "PATCH", { claim: value });
    return call(`/api/projects/${projectId}/evidence`, "POST", { type: "OTHER", sourceItemId: item.sourceItemId, claim: value, note: "由创作依据人工确认" });
  }
  function adopt(item: CreativeBasisSummary["items"][number]) {
    return call(`/api/projects/${projectId}/evidence`, "POST", { type: "OTHER", sourceItemId: item.sourceItemId, claim: item.text, note: "由创作依据人工确认" });
  }
  function dismiss(item: CreativeBasisSummary["items"][number]) {
    if (item.evidenceId) return call(`/api/projects/${projectId}/evidence/${item.evidenceId}`, "DELETE");
    return call(`/api/projects/${projectId}/creative-basis`, "POST", { action: "DISMISS", basisId: item.id });
  }

  return <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-elevated)] p-3">
    <div><div className="flex items-center gap-2"><h3 className="text-sm font-medium">创作依据</h3><Badge>{summary.totalCount}</Badge></div><p className="mt-1 text-xs text-[var(--text-secondary)]">{summary.totalCount ? `已整理 ${summary.totalCount} 条信息 · ${summary.usableCount} 条可直接参考${summary.needsVerificationCount ? ` · ${summary.needsVerificationCount} 条需要核实` : ""}` : "系统尚未整理出可用依据"}</p></div>
    <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => setOpen(true)}>查看依据</Button>
    <StudioDrawer title="创作依据" open={open} onClose={() => setOpen(false)}>
      <p className="text-sm text-[var(--text-secondary)]">系统会用已采用的信息约束事实边界；待核实建议不会自动写成确定事实。</p>
      <div className="mt-4 grid gap-3">
        {summary.items.map((item) => <article key={item.id} className="rounded-xl border bg-[var(--surface)] p-4 text-sm">
          <div className="flex items-center justify-between gap-2"><Badge>{item.displayType}</Badge><span className="text-xs text-[var(--text-secondary)]">{item.sourceTitle}</span></div>
          <p className="mt-2 font-medium leading-6">{item.text}</p>
          {item.note ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{item.note}</p> : null}
          {editable ? <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button disabled={busy || item.status === "ADOPTED"} onClick={() => action(() => adopt(item))}>{item.status === "ADOPTED" ? "已采用" : "采用"}</button>
            <button className="text-[var(--danger)]" disabled={busy} onClick={() => action(() => dismiss(item))}>不采用</button>
            <details><summary className="cursor-pointer">修改</summary><form className="mt-2 grid min-w-64 gap-2" action={(formData) => action(() => save(item, formData))}><textarea name="text" aria-label={`修改${item.displayType}`} defaultValue={item.text} rows={3} className="rounded-[var(--radius)] border bg-[var(--surface)] p-2" /><Button disabled={busy}>保存并采用</Button></form></details>
          </div> : null}
        </article>)}
        {summary.items.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">无需额外管理；你仍可继续确认创作方案。</p> : null}
      </div>
      {error ? <p role="alert" className="mt-3 text-xs text-[var(--danger)]">{error}</p> : null}
    </StudioDrawer>
  </section>;
}
