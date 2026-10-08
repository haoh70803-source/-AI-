"use client";

import { ChevronDown, FolderPlus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SourceWorkspaceModel } from "@/server/material-detail/read-model";

export function ProjectPicker({ data }: { data: Pick<SourceWorkspaceModel["actions"], "sourceId" | "sourceTitle" | "availableProjects" | "relatedProjects"> }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) ref.current?.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") ref.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  const projects = useMemo(() => {
    const seen = new Set<string>();
    return [...data.relatedProjects.map((project) => ({ ...project, kind: "最近项目" })), ...data.availableProjects.map((project) => ({ ...project, kind: "项目" }))].filter((project) => {
      if (seen.has(project.id)) return false;
      seen.add(project.id);
      return !query.trim() || project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    }).slice(0, 8);
  }, [data.availableProjects, data.relatedProjects, query]);

  async function addToProject(projectId: string) {
    setBusyId(projectId); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/sources`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceItemId: data.sourceId, role: "REFERENCE" }) });
      if (!response.ok && response.status !== 409) throw new Error("暂时无法加入这个项目。");
      router.push(`/dashboard?project=${projectId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "暂时无法加入这个项目。"); }
    finally { setBusyId(null); }
  }

  async function createWithSource() {
    setBusyId("new"); setError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: data.sourceTitle.slice(0, 200), sourceItemId: data.sourceId }) });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error(result.message || "创建失败");
      router.push(`/dashboard?project=${result.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "创建失败"); }
    finally { setBusyId(null); }
  }

  return <details ref={ref} className="material-detail-action-menu material-detail-project-picker">
    <summary><FolderPlus size={15} /><span>添加到项目</span><ChevronDown size={14} /></summary>
    <div className="material-detail-action-menu-panel">
      <div className="material-detail-picker-heading"><strong>添加到项目</strong><span>选择一个创作空间继续</span></div>
      <label className="material-detail-picker-search"><span className="sr-only">搜索项目</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目" /></label>
      <div className="material-detail-project-list">
        {projects.length ? projects.map((project) => project.kind === "最近项目" ? <Link key={project.id} href={`/dashboard?project=${project.id}`}><span>{project.kind}</span><strong>{project.title}</strong></Link> : <button key={project.id} type="button" disabled={busyId !== null} onClick={() => void addToProject(project.id)}><span>{busyId === project.id ? "正在加入" : project.kind}</span><strong>{project.title}</strong></button>) : <p className="material-detail-action-empty">没有匹配的项目。</p>}
      </div>
      <button type="button" className="material-detail-new-project" disabled={busyId !== null} onClick={() => void createWithSource()}><Plus size={14} />新建项目并加入资料</button>
      {error ? <p className="material-detail-action-error" role="alert">{error}</p> : null}
    </div>
  </details>;
}
