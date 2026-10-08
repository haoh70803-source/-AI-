"use client";

import { Button } from "@content-center/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

type Run = { id: string; output?: unknown; outputJson?: unknown };

export function WorkflowHumanizeAction({ projectId, body, version, editable, configured, onApplied }: {
  projectId: string;
  body: string;
  version: number;
  editable: boolean;
  configured: boolean;
  onApplied: (content: { title: string; body: string; outline: string[]; version: number }) => void;
}) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function humanize() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects/" + projectId + "/ai/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studioAction: "HUMANIZE_TEXT", selectedText: body, selectionStart: 0, selectionEnd: body.length }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "去 AI 味暂时无法完成。");
      setRun(result as Run);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "去 AI 味暂时无法完成。");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects/" + projectId + "/ai/runs/" + run.id + "/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studioQuickAction: true, expectedVersion: version }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "润色应用失败，请重新生成。");
      const content = object(result.motherContent);
      onApplied({ title: text(content.title), body: text(content.body), outline: Array.isArray(content.outline) ? content.outline.filter((item): item is string => typeof item === "string") : [], version: typeof content.version === "number" ? content.version : version + 1 });
      setRun(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "润色应用失败，请重新生成。");
    } finally {
      setBusy(false);
    }
  }

  const output = object(run?.output ?? run?.outputJson);
  return <section className="mt-4 rounded-xl border bg-[var(--surface-elevated)] p-3" data-testid="workflow-humanize-action">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm">生成后润色</strong><p className="mt-1 text-xs text-[var(--text-secondary)]">保留事实、数字和观点，只调整表达。</p></div><Button variant="secondary" disabled={!editable || !configured || !body.trim() || busy} onClick={() => void humanize()}>{busy ? "处理中…" : "去 AI 味"}</Button></div>
    {run ? <div className="mt-3 grid gap-3 border-t pt-3 text-sm"><div><strong>原稿</strong><p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[var(--text-secondary)]">{text(output.original)}</p></div><div><strong>润色候选</strong><p className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap">{text(output.replacement)}</p></div><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void apply()}>应用润色</Button><Button variant="ghost" disabled={busy} onClick={() => setRun(null)}>保留原稿</Button></div></div> : null}
    {error ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
  </section>;
}
