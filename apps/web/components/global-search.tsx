"use client";

import { FileText, Folder, Plus, Search, Settings, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./global-search-v1.css";
import { guardedArtifactNavigation } from "./projects/use-artifact-editor";

type SearchItem = { id: string; title: string; type: string; href: string; date?: string; projectTitle?: string; version?: number };
const filters = [["ALL", "全部"], ["PROJECT", "项目"], ["ARTIFACT", "成果"], ["DOCUMENT", "文档"], ["IMAGE", "图片"], ["VIDEO", "视频"], ["TEXT", "文本"], ["AUDIO", "音频"], ["URL", "链接"], ["ACTION", "快捷操作"]];
const actions: SearchItem[] = [
  { id: "create", title: "开始创作", type: "ACTION", href: "/dashboard" },
  { id: "library", title: "打开资料库", type: "ACTION", href: "/library" },
  { id: "settings", title: "打开设置", type: "ACTION", href: "/settings" },
  { id: "skill", title: "打开 Skill", type: "ACTION", href: "/library/methods" },
];

export function GlobalSearch({ compact = false, onOpenChange }: { compact?: boolean; onOpenChange?: (open: boolean) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("ALL");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const callback = useRef(onOpenChange);
  callback.current = onOpenChange;
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.showModal();
    callback.current?.(true);
    return () => callback.current?.(false);
  }, [open]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setItems([]); setSelected(0);
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(query)}&scope=${scope}`, { signal: controller.signal })
        .then(async (response) => { if (!response.ok) throw new Error("搜索暂时不可用，请稍后重试。"); return response.json() as Promise<{ items: SearchItem[] }>; })
        .then((result) => { if (!controller.signal.aborted) setItems(result.items); })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "搜索失败"); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, scope]);
  const results = [...items, ...actions.filter((action) => !query.trim() || action.title.toLowerCase().includes(query.trim().toLowerCase()))].filter((item) => scope === "ALL" || item.type === scope);
  function go(item: SearchItem) { guardedArtifactNavigation(() => { setOpen(false); router.push(item.href); }); }
  return <>
    <button type="button" aria-label="搜索项目、成果和资料" title="搜索 · Ctrl K" className={`global-search-trigger ${compact ? "is-icon" : ""}`} onClick={() => setOpen(true)}><Search size={17} />{!compact ? <><span>搜索项目、成果、资料…</span><kbd>Ctrl K</kbd></> : null}</button>
    {open ? createPortal(<dialog ref={dialogRef} className="studio-search-dialog" aria-label="全局搜索" onCancel={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="studio-search-content">
        <div className="studio-search-input"><Search size={18} /><input ref={inputRef} autoFocus aria-label="搜索项目、成果和资料" placeholder="搜索项目、成果名称、资料或快捷操作…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const next = results.length ? (selected + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0; setSelected(next); document.getElementById(`studio-search-result-${next}`)?.scrollIntoView({ block: "nearest" }); }
          if (event.key === "Enter" && results[selected]) { event.preventDefault(); go(results[selected]); }
        }} /><button type="button" aria-label="关闭搜索" onClick={() => setOpen(false)}><X size={16} /></button></div>
        <div className="studio-search-tabs" role="tablist" aria-label="搜索范围">{filters.map(([key, label]) => <button type="button" role="tab" aria-selected={scope === key} key={key} onClick={() => { setScope(key!); setSelected(0); inputRef.current?.focus(); }}>{label}</button>)}</div>
        <div className="studio-search-results" aria-label="搜索结果" aria-busy={loading}>
          <p className="studio-search-caption" role="status">{error || (loading ? "正在搜索…" : query ? `显示 ${results.length} 个结果` : "最近内容与快捷操作")}</p>
          {results.map((item, index) => { const Icon = item.type === "PROJECT" ? Folder : item.type !== "ACTION" ? FileText : item.id === "settings" ? Settings : item.id === "skill" ? Zap : Plus; return <button type="button" id={`studio-search-result-${index}`} key={`${item.type}:${item.id}`} className={selected === index ? "is-selected" : ""} onMouseEnter={() => setSelected(index)} onClick={() => go(item)}><span className="studio-search-result-icon"><Icon size={17} /></span><span><strong>{item.title}</strong>{item.type === "ARTIFACT" ? <small>{item.projectTitle} · 当前 V{item.version}</small> : null}{item.date ? <small>{new Date(item.date).toLocaleDateString("zh-CN")}</small> : null}</span><em>{filters.find(([key]) => key === item.type)?.[1] || "资料"}</em></button>; })}
          {!loading && !error && !results.length ? <div className="studio-search-empty"><Search size={24} /><p>没有找到相关内容</p><small>试试其他关键词或切换分类</small></div> : null}
        </div>
        <footer><span>↑ ↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span></footer>
      </div>
    </dialog>, document.body) : null}
  </>;
}
