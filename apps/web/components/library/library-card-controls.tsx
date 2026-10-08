"use client";

import { Archive, ArrowRight, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { CommandSurface } from "../sidebar/command-surface";
import { NameDialog } from "../sidebar/name-dialog";
import { useSidebarLockController } from "../app-shell";

export function LibraryCardAction({ href, processing }: { href: string; processing: boolean }) {
  return <Link className="project-card-primary" href={href}>{processing ? "查看进度" : "查看详情"}<ArrowRight size={15} /></Link>;
}

export function LibraryCardMenu({ sourceId, title, archived, redirectOnDelete = false }: { sourceId: string; title: string; archived: boolean; redirectOnDelete?: boolean }) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const lock = useSidebarLockController();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null);
  async function confirm() {
    const response = await fetch(`/api/source-items/${sourceId}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      ...(action === "restore" ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "RESTORE" }) } : {}),
    });
    const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || "操作失败，请稍后再试。");
    setAction(null); setOpen(false); if (action === "delete" && redirectOnDelete) router.push("/library"); router.refresh();
  }
  return <>
    <button ref={trigger} type="button" className="asset-card-menu-trigger" aria-label={`更多资料操作：${title}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>
    <CommandSurface open={open} anchor={trigger.current} label={`资料操作：${title}`} onClose={() => setOpen(false)} onInteractionLockChange={lock}>
      <button type="button" onClick={() => setAction(archived ? "restore" : "archive")}>{archived ? <RotateCcw /> : <Archive />}{archived ? "恢复资料" : "归档资料"}</button>
      <button type="button" className="is-danger" onClick={() => setAction("delete")}><Trash2 />删除资料</button>
    </CommandSurface>
    {action ? <NameDialog title={action === "delete" ? "删除资料" : action === "archive" ? "归档资料" : "恢复资料"} confirmOnly destructive={action === "delete"} confirmLabel={action === "delete" ? "永久删除" : action === "archive" ? "确认归档" : "恢复资料"} description={action === "delete" ? `确定永久删除“${title}”？此操作无法撤销。已被项目或研究引用的资料会保留并提示原因。` : action === "archive" ? `归档“${title}”后会从默认列表隐藏，并停止待处理任务。可在“已归档”中恢复。` : "恢复后会重新显示在资料库。被归档中止的处理任务不会自动重新运行。"} onSave={confirm} onClose={() => setAction(null)} onInteractionLockChange={lock} /> : null}
  </>;
}
