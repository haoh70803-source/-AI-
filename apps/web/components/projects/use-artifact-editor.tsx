"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ArtifactView } from "@/lib/contracts/artifacts";
// Only ephemeral callbacks live here; no draft text is stored outside its editor.
const navigationGuards = new Set<(next: () => void) => void>();
let navigationApproved = false;
let historyTrackingInstalled = false;
const historyPositionKey = "__researchHistoryPosition";
function historyPosition(state: unknown = history.state) {
  const navigation = (window as Window & { navigation?: { currentEntry?: { index: number } } }).navigation;
  return navigation?.currentEntry?.index ?? Number((state as Record<string, unknown> | null)?.[historyPositionKey]);
}
function trackHistoryPositions() {
  if (historyTrackingInstalled) return;
  historyTrackingInstalled = true;
  let position = historyPosition();
  if (!Number.isFinite(position)) position = 0;
  const push = history.pushState.bind(history), replace = history.replaceState.bind(history);
  replace({ ...history.state, [historyPositionKey]: position }, "");
  window.dispatchEvent(new Event("researchhistorychange"));
  history.pushState = (state, title, url) => {
    position = Number(history.state?.[historyPositionKey] ?? position) + 1;
    push({ ...state, [historyPositionKey]: position }, title, url);
    window.dispatchEvent(new Event("researchhistorychange"));
  };
  history.replaceState = (state, title, url) => {
    position = Number(history.state?.[historyPositionKey] ?? position);
    replace({ ...state, [historyPositionKey]: position }, title, url);
  };
}
export function guardedArtifactNavigation(action: () => void) {
  const guards = [...navigationGuards];
  const next = () => { const guard = guards.shift(); if (guard) guard(next); else { navigationApproved = true; action(); } };
  next();
}

type Draft = { artifact: ArtifactView | null; messageId: string; title: string; body: string };
type Options = { projectId: string; canWrite: boolean; externalBusy?: boolean; initialArtifact?: ArtifactView | null; onSaved?: (value: ArtifactView) => void };
export function useArtifactEditor(options: Options) {
  const [draft, setDraft] = useState<Draft>({ artifact: options.initialArtifact ?? null, messageId: "", title: options.initialArtifact?.title ?? "我的创作版本", body: options.initialArtifact?.content ?? "" });
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null), editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<{ body: string; title: string } | null>(null);
  const lock = useRef(false), pendingRef = useRef<(() => void) | null>(null), resolving = useRef(false);
  const latest = useRef(options); latest.current = options;
  const draftRef = useRef(draft); draftRef.current = draft;
  const { artifact, messageId, title, body } = draft;
  const dirty = artifact ? body !== artifact.content || title !== artifact.title : Boolean(messageId);
  const dirtyRef = useRef(dirty); if (dirty && !dirtyRef.current) navigationApproved = false; dirtyRef.current = dirty;
  const savedRef = useRef({ artifact, messageId }); savedRef.current = { artifact, messageId };
  useEffect(() => { trackHistoryPositions(); }, []);
  function update(value: Draft) { draftRef.current = value; savedRef.current = { artifact: value.artifact, messageId: value.messageId }; setDraft(value); }
  function showArtifact(value: ArtifactView) { inputRef.current = null; dirtyRef.current = false; update({ artifact: value, messageId: "", title: value.title, body: value.content }); setError(""); }
  function clear() { inputRef.current = null; dirtyRef.current = false; update({ artifact: null, messageId: "", title: "我的创作版本", body: "" }); setError(""); setStatus(""); }
  function setGenerated(id: string, content: string) { inputRef.current = null; navigationApproved = false; update({ artifact: null, messageId: id, title: "我的创作版本", body: content }); setError(""); setStatus(""); }
  function hasUnsavedContent() {
    const text = editorRef.current?.querySelector<HTMLTextAreaElement>('textarea[aria-label="成果正文"]');
    const name = editorRef.current?.querySelector<HTMLInputElement>('input[aria-label="成果名称"]');
    const savedValue = savedRef.current.artifact, input = inputRef.current;
    if (input) return savedValue ? input.body !== savedValue.content || input.title !== savedValue.title : Boolean(savedRef.current.messageId);
    return text && name ? savedValue ? text.value !== savedValue.content || name.value !== savedValue.title : Boolean(savedRef.current.messageId) : dirtyRef.current;
  }
  function editBody(value: string) { const current = draftRef.current; navigationApproved = false; dirtyRef.current = current.artifact ? value !== current.artifact.content || current.title !== current.artifact.title : Boolean(current.messageId); update({ ...current, body: value }); }
  function editTitle(value: string) { const current = draftRef.current; navigationApproved = false; dirtyRef.current = current.artifact ? current.body !== current.artifact.content || value !== current.artifact.title : Boolean(current.messageId); update({ ...current, title: value }); }
  function blocked() { return lock.current || latest.current.externalBusy; }
  function queueAction(action: () => void) { if (blocked() || pendingRef.current || resolving.current) return; pendingRef.current = action; setPendingAction(() => action); }
  function cancelAction() { pendingRef.current = null; setPendingAction(null); }
  function protect(action: () => void) { if (blocked() || pendingRef.current || resolving.current) return; if (hasUnsavedContent()) queueAction(action); else action(); }
  async function request(url: string, method: string, value: unknown): Promise<ArtifactView> {
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "保存失败，当前编辑内容仍保留。");
    return data as ArtifactView;
  }
  async function save() {
    if (blocked() || !latest.current.canWrite) return false;
    const current = draftRef.current, fields = inputRef.current ?? { title: current.title, body: current.body };
    if (!fields.title.trim()) { setError("请填写成果名称，当前编辑内容仍保留。"); return false; }
    if (current.artifact && !hasUnsavedContent()) return true;
    lock.current = true; setBusy(true); setError(""); setStatus("正在保存成果…");
    try {
      const project = latest.current.projectId;
      let value = current.artifact;
      if (!value) {
        if (!current.messageId) throw new Error("请先完成生成，再保存成果。");
        value = await request("/api/projects/" + project + "/artifacts", "POST", { type: "TEXT", title: fields.title.trim(), sourceMessageId: current.messageId });
        update({ ...current, artifact: value });
      }
      if (value.content !== fields.body || value.title !== fields.title.trim()) value = await request("/api/projects/" + project + "/artifacts/" + value.artifactId, "PUT", { expectedVersion: value.version, title: fields.title.trim(), body: fields.body });
      showArtifact(value); setStatus("成果已保存，旧版本保留。"); latest.current.onSaved?.(value); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败，当前编辑内容仍保留。"); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function resolveAction(saveFirst: boolean) {
    if (resolving.current || blocked() || !pendingRef.current) return;
    resolving.current = true; const action = pendingRef.current;
    try { if (saveFirst && !await save()) return; if (!saveFirst) { const value = draftRef.current.artifact; if (value) showArtifact(value); else clear(); } cancelAction(); action(); }
    finally { resolving.current = false; }
  }
  useEffect(() => { if (pendingAction && !dialogRef.current?.open) dialogRef.current?.showModal(); }, [pendingAction]);
  useEffect(() => { const value = options.initialArtifact; if (value && !hasUnsavedContent() && (value.artifactId !== draftRef.current.artifact?.artifactId || value.version > (draftRef.current.artifact?.version ?? 0))) showArtifact(value); }, [options.initialArtifact?.artifactId, options.initialArtifact?.version]);

  useLayoutEffect(() => {

    const resetNavigation = () => { navigationApproved = false; };
    resetNavigation();
    let currentPosition = historyPosition();
    const historyChange = () => { currentPosition = historyPosition(); };
    let restoring = false;
    let destinationPosition: number | null = null;
    const guard = (next: () => void) => { if (hasUnsavedContent()) queueAction(next); else next(); };
    navigationGuards.add(guard);
    const leave = (event: BeforeUnloadEvent) => { if (!hasUnsavedContent() || navigationApproved) return; event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      if (!hasUnsavedContent() || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.download || target.target === "_blank" || (target.pathname === location.pathname && target.search === location.search)) return;
      event.preventDefault(); event.stopPropagation();
      guardedArtifactNavigation(() => window.location.assign(target.href));
    };
    const input = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !editorRef.current?.contains(target)) return;
      if (target.getAttribute("aria-label") !== "成果名称" && target.getAttribute("aria-label") !== "成果正文") return;
      const text = editorRef.current.querySelector<HTMLTextAreaElement>("textarea");
      const title = editorRef.current.querySelector<HTMLInputElement>('input[aria-label="成果名称"]');
      if (text && title) { inputRef.current = { body: text.value, title: title.value }; navigationApproved = false; }
    };
    const back = (event: PopStateEvent) => {
      const position = historyPosition(event.state);
      if (!hasUnsavedContent() || navigationApproved) { currentPosition = position; navigationApproved = false; return; }
      if (!Number.isFinite(position) || !Number.isFinite(currentPosition)) return;
      event.stopImmediatePropagation();
      if (restoring) {
        if (position !== currentPosition) { history.go(currentPosition - position); return; }
        restoring = false;
        const destination = destinationPosition;
        destinationPosition = null;
        if (destination !== null) guardedArtifactNavigation(() => history.go(destination - currentPosition));
        return;
      }
      if (position === currentPosition) return;
      destinationPosition = position; restoring = true;
      // Restore the existing entry before asking; never append or truncate history.
      history.go(currentPosition - position);
    };
    window.addEventListener("researchhistorychange", historyChange);
    window.addEventListener("pageshow", resetNavigation);
    window.addEventListener("beforeunload", leave);
    window.addEventListener("popstate", back, true);
    document.addEventListener("input", input, true);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("researchhistorychange", historyChange); navigationGuards.delete(guard); window.removeEventListener("pageshow", resetNavigation); window.removeEventListener("beforeunload", leave); window.removeEventListener("popstate", back, true); document.removeEventListener("input", input, true); document.removeEventListener("click", click, true); };
  }, []);

  function download() {
    const value = draftRef.current.artifact; if (!value) return;
    if (hasUnsavedContent() && !window.confirm("当前有未保存修改。确定只导出已保存 V" + value.version + "？编辑内容会保留。")) return;
    const url = URL.createObjectURL(new Blob(["# " + value.title + "\n\n" + value.content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = value.title.replace(/[\\/:*?"<>|]/g, "_") + ".md"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { ...draft, dirty, busy: busy || Boolean(options.externalBusy), status, error, pendingAction, dialogRef, editorRef, editBody, editTitle, protect, hasUnsavedContent, cancelAction, resolveAction, showArtifact, clear, setGenerated, save, download };
}
export type ArtifactEditorState = ReturnType<typeof useArtifactEditor>;
