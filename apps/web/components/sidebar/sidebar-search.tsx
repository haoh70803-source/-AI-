"use client";

import { Folder, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** The existing route-search behavior, sized for the Sidebar shell. */
export function SidebarSearch({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"PROJECTS" | "LIBRARY">("PROJECTS");
  const dialog = useRef<HTMLDialogElement>(null);
  const callback = useRef(onOpenChange);
  callback.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    callback.current(true);
    return () => callback.current(false);
  }, [open]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    router.push(`${scope === "PROJECTS" ? "/projects" : "/library"}${query.trim() ? `?search=${encodeURIComponent(query.trim())}` : ""}`);
    setOpen(false);
  }

  return <>
    <button type="button" className="global-search-trigger is-icon" aria-label="搜索工作和资料" title="搜索 · Ctrl K" onClick={() => setOpen(true)}><Search size={17} /></button>
    {open ? createPortal(<dialog ref={dialog} className="sidebar-search-dialog" aria-label="全局搜索" onCancel={() => setOpen(false)}>
      <header><strong>搜索已有内容</strong><button type="button" aria-label="关闭搜索" onClick={() => setOpen(false)}><X size={17} /></button></header>
      <form onSubmit={submit}>
        <label><Search size={17} /><input autoFocus aria-label="搜索项目和资料" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={scope === "PROJECTS" ? "搜索项目名称" : "搜索资料标题"} /></label>
        <nav aria-label="搜索范围"><button type="button" aria-pressed={scope === "PROJECTS"} onClick={() => setScope("PROJECTS")}><Folder size={15} />项目</button><button type="button" aria-pressed={scope === "LIBRARY"} onClick={() => setScope("LIBRARY")}>资料</button></nav>
        <button type="submit">搜索{scope === "PROJECTS" ? "项目" : "资料"}</button>
      </form>
    </dialog>, document.body) : null}
  </>;
}
