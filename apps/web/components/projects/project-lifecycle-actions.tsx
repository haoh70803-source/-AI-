"use client";

import { Archive, Copy, LogOut, RotateCcw, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { NameDialog } from "../sidebar/name-dialog";
import type { SidebarInteractionLock } from "../sidebar-state";

export function ProjectLifecycleActions({ projectId, title, archived = false, canManage = true, closeMenu, onInteractionLockChange }: {
  projectId: string; title: string; archived?: boolean; canManage?: boolean; closeMenu: () => void;
  onInteractionLockChange: (lock: SidebarInteractionLock, active: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [action, setAction] = useState<"archive" | "restore" | "delete" | null>(null);
  const [feedback, setFeedback] = useState("");
  const current = pathname === "/dashboard" && params.get("project") === projectId;
  async function copy() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/dashboard?project=${encodeURIComponent(projectId)}`); setFeedback("项目链接已复制"); }
    catch { setFeedback("复制失败，请检查浏览器剪贴板权限。"); }
  }
  async function confirm() {
    const response = await fetch(action === "archive" ? `/api/projects/${projectId}/transition` : action === "restore" ? `/api/projects/${projectId}/restore` : `/api/projects/${projectId}`, {
      method: action === "delete" ? "DELETE" : "POST", ...(action === "archive" ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ to: "ARCHIVED" }) } : {}),
    });
    const body = response.status === 204 ? {} : await response.json().catch(() => ({})) as { message?: string; error?: string };
    if (!response.ok) throw new Error(body.message || body.error || "操作失败，请重试。");
    window.dispatchEvent(new Event("project-list-changed"));
    setAction(null); closeMenu();
    if (current && action !== "restore") router.replace("/projects");
    router.refresh();
  }
  return <>
    <button type="button" onClick={() => void copy()}><Copy />复制项目链接</button>
    {current ? <button type="button" onClick={() => { closeMenu(); router.push("/dashboard"); }}><LogOut />关闭当前项目</button> : null}
    {canManage ? <><hr /><button type="button" onClick={() => setAction(archived ? "restore" : "archive")}>{archived ? <RotateCcw /> : <Archive />}{archived ? "恢复项目" : "归档项目"}</button><button type="button" className="is-danger" onClick={() => setAction("delete")}><Trash2 />删除项目</button></> : null}
    {feedback ? <small role="status">{feedback}</small> : null}
    {action ? <NameDialog title={action === "delete" ? "删除项目" : action === "archive" ? "归档项目" : "恢复项目"} destructive={action === "delete"} confirmOnly confirmLabel={action === "delete" ? "永久删除" : action === "archive" ? "确认归档" : "恢复项目"} description={action === "delete" ? `确定永久删除“${title}”？该项目的对话、稿件及版本记录将一并删除，无法撤销。资料库里的原始资料会保留。` : action === "archive" ? `归档“${title}”后，它会从侧栏和默认列表隐藏。内容会保留，可在“已归档”中恢复。` : `恢复“${title}”，保留原有内容、个人分组和置顶设置。`} onSave={confirm} onClose={() => setAction(null)} onInteractionLockChange={onInteractionLockChange} /> : null}
  </>;
}
