"use client";

import { FileText, Grid2X2, ImageIcon, List, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { employeeSourceMeta, employeeSourceTypeLabels } from "@/lib/content-labels";

export const PROJECT_MATERIAL_DRAG_TYPE = "application/x-xsj-project-material";

export type ProjectMaterial = {
  id: string;
  title: string;
  description: string | null;
  summary: string | null;
  author: string | null;
  sourcePlatform: string;
  sourceType: string;
  status: string;
  thumbnailUrl: string | null;
  addedAt: string;
  updatedAt: string;
  tags: Array<{ id: string; name: string }>;
  imageAssets: Array<{ id: string; assetType: string; status: string; mimeType: string | null }>;
};

export type ProjectMaterialDrop = { sourceId: string; kind: "material" | "image"; sourceAssetId?: string };

function dropPayload(source: ProjectMaterial): ProjectMaterialDrop {
  const image = source.sourceType === "IMAGE" ? source.imageAssets.find(({ status }) => status === "STORED") : null;
  return image ? { sourceId: source.id, kind: "image", sourceAssetId: image.id } : { sourceId: source.id, kind: "material" };
}

function startDrag(event: DragEvent<HTMLElement>, source: ProjectMaterial, onDragState: (active: boolean) => void) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(PROJECT_MATERIAL_DRAG_TYPE, JSON.stringify(dropPayload(source)));
  const preview = document.createElement("div");
  preview.className = "project-material-drag-preview";
  preview.textContent = source.title;
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 20, 20);
  window.setTimeout(() => preview.remove(), 0);
  onDragState(true);
}

export function ProjectMaterialsPanel({ open, sources, editable, onClose, onAdd, onDragState }: {
  open: boolean;
  sources: ProjectMaterial[];
  editable: boolean;
  onClose: () => void;
  onAdd: (source: ProjectMaterial, payload: ProjectMaterialDrop) => void;
  onDragState: (active: boolean) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [tag, setTag] = useState("ALL");
  const [sort, setSort] = useState<"NEWEST" | "OLDEST" | "NAME">("NEWEST");
  const [view, setView] = useState<"GRID" | "LIST">("GRID");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim().toLocaleLowerCase("zh-CN")), 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const stored = window.localStorage.getItem("project-materials-view:v1");
    if (stored === "GRID" || stored === "LIST") setView(stored);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, open]);

  const types = useMemo(() => [...new Set(sources.map((source) => source.sourceType))].sort(), [sources]);
  const tags = useMemo(() => [...new Map(sources.flatMap((source) => source.tags).map((item) => [item.id, item])).values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")), [sources]);
  const visible = useMemo(() => sources.filter((source) => {
    const haystack = [source.title, source.author, source.summary, source.description].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    return (!search || haystack.includes(search)) && (type === "ALL" || source.sourceType === type) && (tag === "ALL" || source.tags.some(({ id }) => id === tag));
  }).sort((a, b) => sort === "NAME" ? a.title.localeCompare(b.title, "zh-CN") : sort === "OLDEST" ? a.addedAt.localeCompare(b.addedAt) : b.addedAt.localeCompare(a.addedAt)), [search, sort, sources, tag, type]);

  const chooseView = (next: "GRID" | "LIST") => { setView(next); window.localStorage.setItem("project-materials-view:v1", next); };

  return <aside className="project-materials-panel" role="dialog" aria-modal="false" data-open={open} aria-hidden={!open} inert={!open} aria-label="项目资料">
    <header><div><strong>项目资料</strong><span>{sources.length} 条当前项目资料</span></div><button type="button" aria-label="关闭项目资料" onClick={onClose}><X size={17} /></button></header>
    <div className="project-material-search"><Search size={15} /><input aria-label="搜索项目资料" value={searchInput} placeholder="搜索标题、作者或摘要" onChange={(event) => setSearchInput(event.target.value)} /></div>
    <div className="project-material-filters">
      <select aria-label="资料类型" value={type} onChange={(event) => setType(event.target.value)}><option value="ALL">全部类型</option>{types.map((value) => <option key={value} value={value}>{employeeSourceTypeLabels[value] || "资料"}</option>)}</select>
      {tags.length ? <select aria-label="资料标签" value={tag} onChange={(event) => setTag(event.target.value)}><option value="ALL">全部标签</option>{tags.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select> : null}
      <select aria-label="资料排序" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="NEWEST">最近加入</option><option value="OLDEST">最早加入</option><option value="NAME">按名称</option></select>
      <div role="group" aria-label="资料视图"><button type="button" aria-label="网格视图" aria-pressed={view === "GRID"} onClick={() => chooseView("GRID")}><Grid2X2 size={15} /></button><button type="button" aria-label="列表视图" aria-pressed={view === "LIST"} onClick={() => chooseView("LIST")}><List size={16} /></button></div>
    </div>
    <div className={`project-material-items is-${view.toLowerCase()}`} role="list">
      {visible.map((source) => {
        const payload = dropPayload(source);
        const TypeIcon = payload.kind === "image" ? ImageIcon : FileText;
        return <article key={source.id} role="listitem" aria-selected={selectedId === source.id} draggable={editable} onDragStart={(event) => startDrag(event, source, onDragState)} onDragEnd={() => onDragState(false)}>
          <button className="project-material-select" type="button" onClick={() => setSelectedId((current) => current === source.id ? null : source.id)}>
            <span className="project-material-cover">{source.thumbnailUrl ? <img src={source.thumbnailUrl} alt="" loading="lazy" /> : <TypeIcon size={22} />}</span>
            <span className="project-material-copy"><strong>{source.title}</strong><small>{source.summary || source.description || "尚未整理摘要"}</small><em>{employeeSourceMeta(source.sourceType, source.sourcePlatform)}{source.author ? ` · ${source.author}` : ""}</em>{source.tags.length ? <i>{source.tags.slice(0, 2).map(({ id, name }) => <b key={id}>{name}</b>)}</i> : null}</span>
          </button>
          <footer><time>{source.addedAt.slice(0, 10)}</time><Link href={`/library/${source.id}`}>打开资料</Link><button type="button" disabled={!editable} title={editable ? "添加到画布" : "VIEWER 只能查看资料"} onClick={() => onAdd(source, payload)}><Plus size={14} />添加到画布</button></footer>
        </article>;
      })}
      {!visible.length ? <p className="project-material-empty">没有符合当前条件的项目资料。</p> : null}
    </div>
    {!editable ? <p className="project-material-readonly">当前权限可以查看资料，但不能向画布添加引用。</p> : <p className="project-material-hint">拖到画布中的位置，或使用“添加到画布”。资料仍保留原始来源。</p>}
  </aside>;
}
