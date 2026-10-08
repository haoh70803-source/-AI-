"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { SidebarInteractionLock } from "../sidebar-state";

export function NameDialog({ title, initialValue = "", description, destructive = false, confirmOnly = false, confirmLabel, onSave, onClose, onInteractionLockChange }: {
  title: string; initialValue?: string; description?: string; destructive?: boolean; confirmOnly?: boolean; confirmLabel?: string;
  onSave: (name: string) => Promise<unknown>; onClose: () => void;
  onInteractionLockChange: (lock: SidebarInteractionLock, active: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    onInteractionLockChange("DIALOG", true);
    return () => onInteractionLockChange("DIALOG", false);
  }, [onInteractionLockChange]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await onSave(value.trim()); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试。"); }
    finally { setBusy(false); }
  }
  return createPortal(<dialog ref={ref} className="sidebar-native-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form onSubmit={save}>
      <header><h2>{title}</h2><button type="button" aria-label="关闭" disabled={busy} onClick={onClose}><X size={16} /></button></header>
      {description ? <p>{description}</p> : null}
      {!destructive && !confirmOnly ? <label>名称<input autoFocus aria-label="名称" required maxLength={title.includes("文件夹") ? 80 : 200} value={value} onChange={(event) => setValue(event.target.value)} /></label> : null}
      {error ? <p role="alert">{error}</p> : null}
      <footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className={destructive ? "is-danger" : "is-primary"} disabled={busy || (!destructive && !confirmOnly && !value.trim())}>{busy ? "正在处理…" : confirmLabel || (destructive ? "删除文件夹" : "保存")}</button></footer>
    </form>
  </dialog>, document.body);
}
