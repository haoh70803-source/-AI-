"use client";

import { ArrowDown, ArrowUp, ChevronsUp, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { CommandSurface } from "./command-surface";
import { NameDialog } from "./name-dialog";
import type { ProjectFolderView, ProjectListView } from "@/server/sidebar/view-model";
import type { FolderCommand } from "@/server/sidebar/service";
import type { SidebarInteractionLock } from "../sidebar-state";

export function SidebarFolderMenu({ folder, onCommand, onDelete, onInteractionLockChange }: {
  folder: ProjectFolderView;
  onCommand: (folderId: string, command: FolderCommand) => Promise<ProjectListView>;
  onDelete: (folderId: string) => Promise<ProjectListView>;
  onInteractionLockChange: (lock: SidebarInteractionLock, active: boolean) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button ref={triggerRef} type="button" className="sidebar-row-action" aria-label={`文件夹菜单：${folder.label}`} aria-haspopup="dialog" aria-expanded={open} onContextMenu={(event) => { event.preventDefault(); setOpen(true); }} onClick={() => setOpen(!open)}><MoreHorizontal size={15} /></button>
    <CommandSurface open={open} anchor={triggerRef.current} label={`文件夹操作：${folder.label}`} onClose={() => setOpen(false)} onInteractionLockChange={onInteractionLockChange}>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setDialog("rename"); }}><PencilLine />重命名</button>
      <button type="button" disabled={busy} onClick={() => void run(() => onCommand(folder.folderId, { action: "MOVE_TOP" }))}><ChevronsUp />移到顶部</button>
      <button type="button" disabled={busy} onClick={() => void run(() => onCommand(folder.folderId, { action: "MOVE_UP" }))}><ArrowUp />上移</button>
      <button type="button" disabled={busy} onClick={() => void run(() => onCommand(folder.folderId, { action: "MOVE_DOWN" }))}><ArrowDown />下移</button>
      <button type="button" className="is-danger" disabled={busy} onClick={() => { setOpen(false); setDialog("delete"); }}><Trash2 />删除文件夹</button>
      {error ? <p role="alert">{error}</p> : null}
    </CommandSurface>
    {dialog ? <NameDialog title={dialog === "rename" ? "重命名文件夹" : "删除文件夹"} initialValue={folder.label} destructive={dialog === "delete"} description={dialog === "delete" ? `“${folder.label}”中的项目会移到未分组，项目内容将保留。` : undefined} onSave={(name) => dialog === "delete" ? onDelete(folder.folderId) : onCommand(folder.folderId, { action: "RENAME", name })} onClose={() => setDialog(null)} onInteractionLockChange={onInteractionLockChange} /> : null}
  </>;
}
