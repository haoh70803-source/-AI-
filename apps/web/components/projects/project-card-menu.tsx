"use client";

import { MoreHorizontal, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { useSidebarLockController } from "../app-shell";
import { CommandSurface } from "../sidebar/command-surface";
import { NameDialog } from "../sidebar/name-dialog";
import type { ProjectFolderView } from "@/server/sidebar/view-model";
import type { SidebarInteractionLock } from "../sidebar-state";

export function ProjectCardMenu({ projectId, title, archived = false, folders, folderId, canManage = true, lifecycleActions }: { projectId: string; title: string; ended?: boolean; archived?: boolean; folders?: ProjectFolderView[]; folderId?: string | null; canManage?: boolean; lifecycleActions?: (input: { closeMenu: () => void; onInteractionLockChange: (lock: SidebarInteractionLock, active: boolean) => void }) => ReactNode }) {
  const router = useRouter();
  const lock = useSidebarLockController();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [rename, setRename] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  async function move(target: string | null) {
    setMoving(true); setError("");
    try {
      const response = await fetch(`/api/sidebar/projects/${projectId}/preference`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "MOVE", folderId: target }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "移动失败");
      window.dispatchEvent(new Event("project-list-changed")); setOpen(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "移动失败"); }
    finally { setMoving(false); }
  }
  async function saveName(name: string) {
    const response = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: name }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "重命名失败，请重试。");
    window.dispatchEvent(new Event("project-list-changed"));
    router.refresh();
  }
  return <>
    <button ref={trigger} className="project-card-menu-trigger" type="button" aria-label={`更多项目操作：${title}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>
    <CommandSurface open={open} anchor={trigger.current} label={`项目操作：${title}`} onClose={() => setOpen(false)} onInteractionLockChange={lock}>
      {canManage ? <button type="button" onClick={() => { setOpen(false); setRename(true); }}><PencilLine />重命名</button> : null}
      {folders && !archived ? <fieldset><legend>移动到文件夹</legend>{folderId ? <button type="button" disabled={moving} onClick={() => void move(null)}>未分组</button> : null}{folders.filter((folder) => folder.folderId !== folderId).map((folder) => <button type="button" key={folder.folderId} disabled={moving} onClick={() => void move(folder.folderId)}>{folder.label}</button>)}{!folders.length ? <small>先在项目库新建文件夹</small> : null}</fieldset> : null}
      {error ? <p role="alert">{error}</p> : null}
      {lifecycleActions?.({ closeMenu: () => setOpen(false), onInteractionLockChange: lock })}
    </CommandSurface>
    {rename ? <NameDialog title="重命名项目" initialValue={title} onSave={saveName} onClose={() => setRename(false)} onInteractionLockChange={lock} /> : null}
  </>;
}
