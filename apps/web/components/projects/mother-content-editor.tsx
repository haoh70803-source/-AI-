"use client";

import { FileCheck2, MessageSquareText, Scissors, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type Snapshot = { title: string; body: string; outline: string[] };
type SaveState = "IDLE" | "DIRTY" | "SAVING" | "SAVED" | "FAILED";
export type StudioSelectionAction = "ALTERNATIVE_EXPRESSION" | "HUMANIZE_TEXT" | "SHORTEN_TEXT" | "STRENGTHEN_EVIDENCE" | "FACT_CHECK";
export type MotherContentEditorHandle = { flush: () => Promise<boolean> };

const labels: Record<SaveState, string> = { IDLE: "已保存", DIRTY: "等待保存", SAVING: "正在保存", SAVED: "已保存", FAILED: "保存失败" };

export const MotherContentEditor = forwardRef<MotherContentEditorHandle, { projectId: string; draftBranchId: string; initial: { title: string; body: string; outline: string[]; draftBranchVersion: number; origin?: "HUMAN" | "KIMI" | "GPT_WEB"; originNote?: string | null }; editable: boolean; onSaved?: (branchVersion: number, snapshot: Snapshot, legacyMotherVersion: number | null) => void; onSelectionChange?: (selection: { text: string; start: number; end: number } | null) => void; onSelectionAction?: (action: StudioSelectionAction) => void }>(function MotherContentEditor({ projectId, draftBranchId, initial, editable, onSaved, onSelectionChange, onSelectionAction }, ref) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [outlineText, setOutlineText] = useState(initial.outline.join("\n"));
  const [saveState, setSaveState] = useState<SaveState>("IDLE");
  const [error, setError] = useState("");
  const inFlight = useRef<Promise<boolean> | null>(null);
  const pending = useRef<Snapshot | null>(null);
  const lastSaved = useRef<Snapshot>({ title: initial.title, body: initial.body, outline: initial.outline });
  const version = useRef(initial.draftBranchVersion);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState<{ text: string; start: number; end: number } | null>(null);

  useEffect(() => {
    setTitle(initial.title);
    setBody(initial.body);
    setOutlineText(initial.outline.join("\n"));
    version.current = initial.draftBranchVersion;
    lastSaved.current = { title: initial.title, body: initial.body, outline: initial.outline };
    setSelection(null);
    onSelectionChange?.(null);
  }, [initial.draftBranchVersion]);

  function reportSelection(element: HTMLTextAreaElement) {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = body.slice(start, end).trim();
    const next = selected ? { text: body.slice(start, end), start, end } : null;
    setSelection(next);
    onSelectionChange?.(next);
  }

  async function drain(): Promise<boolean> {
    if (inFlight.current) {
      const saved = await inFlight.current;
      return saved && pending.current ? drain() : saved;
    }
    if (!pending.current) return true;
    const snapshot = pending.current;
    pending.current = null;
    setSaveState("SAVING");
    const request = (async () => {
      try {
      const response = await fetch(`/api/projects/${projectId}/drafts/${draftBranchId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...snapshot, expectedVersion: version.current }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "保存失败");
      version.current = result.branch.version;
      lastSaved.current = snapshot;
      onSaved?.(result.branch.version, snapshot, typeof result.legacyContent?.version === "number" ? result.legacyContent.version : null);
      setError("");
      setSaveState(pending.current ? "DIRTY" : "SAVED");
      return true;
    } catch (cause) {
      pending.current = null;
      setError(cause instanceof Error ? cause.message : "保存失败");
      setSaveState("FAILED");
      return false;
    }
    })();
    inFlight.current = request;
    const saved = await request;
    inFlight.current = null;
    if (pending.current) return saved && drain();
    return saved;
  }

  useImperativeHandle(ref, () => ({ flush: async () => {
    const outline = outlineText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (title !== lastSaved.current.title || body !== lastSaved.current.body || outline.join("\n") !== lastSaved.current.outline.join("\n")) pending.current = { title, body, outline };
    return drain();
  } }), [title, body, outlineText]);

  useEffect(() => {
    if (!editable) return;
    const outline = outlineText.split("\n").map((item) => item.trim()).filter(Boolean);
    if (title === lastSaved.current.title && body === lastSaved.current.body && outline.join("\n") === lastSaved.current.outline.join("\n")) return;
    setSaveState("DIRTY");
    const timer = window.setTimeout(() => {
      pending.current = { title, body, outline };
      void drain();
    }, 1_800);
    return () => window.clearTimeout(timer);
  }, [title, body, outlineText, editable]);

  const characters = body.replace(/\s/g, "").length;
  const outline = outlineText.split("\n").map((item) => item.trim()).filter(Boolean);

  function locateSection(item: string) {
    const element = bodyRef.current;
    if (!element) return;
    const exact = body.indexOf(item);
    const keyword = item.replace(/^\d+[.、]\s*/u, "").replace(/[：:？?！!]/gu, "").trim();
    const approximate = keyword ? body.indexOf(keyword) : -1;
    const start = exact >= 0 ? exact : approximate >= 0 ? approximate : 0;
    element.focus();
    element.setSelectionRange(start, Math.min(body.length, start + (exact >= 0 ? item.length : keyword.length)));
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return (
    <section className="mother-editor-workspace">
      <div className="mother-editor-status"><div><h3>正文编辑</h3><p>选中文字可调用 AI 局部优化，应用前会先预览。</p></div><div><p className={saveState === "FAILED" ? "text-[var(--danger)]" : ""}><FileCheck2 size={14} />{labels[saveState]}</p><span>{characters} 字 · {labels[saveState]}</span></div></div>
      {outline.length ? <nav className="studio-outline-nav" aria-label="稿件分段导航">{outline.map((item, index) => <button key={`${item}-${index}`} type="button" onClick={() => locateSection(item)}><span>{index + 1}</span><strong>{item}</strong></button>)}</nav> : null}
      <input aria-label="口播稿标题" value={title} disabled={!editable} onChange={(event) => setTitle(event.target.value)} className="mother-title-input" placeholder="口播稿标题" />
      <div className="mother-document-toolbar"><span>正文</span><i /><span>停止输入后自动保存</span><span className="ml-auto">选中文字后可局部优化</span></div>
      <div className="mother-body-shell">{selection && onSelectionAction ? <div className="mother-selection-toolbar" role="toolbar" aria-label="选中文字操作"><button type="button" onClick={() => onSelectionAction("ALTERNATIVE_EXPRESSION")}><WandSparkles size={14} />换个表达</button><button type="button" onClick={() => onSelectionAction("HUMANIZE_TEXT")}><MessageSquareText size={14} />更口语</button><button type="button" onClick={() => onSelectionAction("SHORTEN_TEXT")}><Scissors size={14} />精简</button><button type="button" onClick={() => onSelectionAction("STRENGTHEN_EVIDENCE")}><Sparkles size={14} />补依据</button><button type="button" onClick={() => onSelectionAction("FACT_CHECK")}><ShieldCheck size={14} />检查事实</button></div> : null}<textarea ref={bodyRef} aria-label="口播稿正文" value={body} disabled={!editable} onChange={(event) => { setBody(event.target.value); setSelection(null); onSelectionChange?.(null); }} onSelect={(event) => reportSelection(event.currentTarget)} onKeyUp={(event) => reportSelection(event.currentTarget)} onMouseUp={(event) => reportSelection(event.currentTarget)} className="mother-body-editor" placeholder="从这里开始写口播稿。停止输入后自动保存。" /></div>
      <details id="mother-outline" className="outline-editor"><summary>编辑大纲</summary><textarea aria-label="口播稿提纲" value={outlineText} disabled={!editable} onChange={(event) => setOutlineText(event.target.value)} rows={4} placeholder="提纲，每行一点" /></details>
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
    </section>
  );
});
