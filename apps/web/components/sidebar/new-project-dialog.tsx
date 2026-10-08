"use client";

import { Button, Input } from "@content-center/ui";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SidebarInteractionLock } from "../sidebar-state";

export function NewProjectDialog({ open, onOpenChange, onInteractionLockChange, onCreated, folderId, returnTo }: {
  folderId?: string;
  returnTo?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInteractionLockChange: (lock: SidebarInteractionLock, active: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setDescription(""); setError("");
    dialogRef.current?.showModal();
    onInteractionLockChange("DIALOG", true);
    return () => onInteractionLockChange("DIALOG", false);
  }, [onInteractionLockChange, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onOpenChange, open]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sidebar/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: nextTitle, ...(folderId ? { folderId } : {}), ...(description.trim() ? { description: description.trim() } : {}) }),
      });
      const result = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.message || result.error || "无法创建项目。");
      // Creation already succeeded. A failed list refresh must not invite a duplicate POST.
      await onCreated().catch(() => undefined);
      onOpenChange(false);
      router.push(returnTo || `/dashboard?project=${result.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法创建项目。");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(<dialog ref={dialogRef} aria-label={returnTo ? "新建创作" : "新建项目"} className="sidebar-native-dialog app-sidebar-dialog" onCancel={(event) => { event.preventDefault(); if (!busy) onOpenChange(false); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onOpenChange(false); }}>
      <header><div><strong>{returnTo ? "新建创作" : "新建项目"}</strong></div><button type="button" aria-label="关闭" disabled={busy} onClick={() => onOpenChange(false)}><X /></button></header>
      <form onSubmit={submit}>
        <label>项目名称<Input autoFocus value={title} required maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="输入项目名称" /></label>
        <label>项目描述（可选）<textarea value={description} maxLength={5_000} rows={4} onChange={(event) => setDescription(event.target.value)} placeholder="补充一句背景，也可以稍后再说" /></label>
        {error ? <p role="alert">{error}</p> : null}
        <footer><Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button><Button disabled={busy || !title.trim()}>{busy ? "正在创建…" : returnTo ? "创建" : "创建并进入"}</Button></footer>
      </form>
  </dialog>, document.body);
}
