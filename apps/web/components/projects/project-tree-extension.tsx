"use client";

import { BookOpen, ChevronDown, FileText, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./project-tree-extension.css";

type ProjectTreeData = { id: string; title: string; sources: Array<{ id: string; title: string }>; artifacts: Array<{ id: string; title: string; node: string }> };

/** Later project workspace navigation mounts beside, rather than inside, the Sidebar baseline. */
export function ProjectTreeExtension({ projectId, selectedNode, artifactOptions }: { projectId: string; selectedNode: string | null; artifactOptions: Array<{ artifactId: string; title: string }> }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<ProjectTreeData | null>(null);
  const [open, setOpen] = useState(true);
  useEffect(() => setTarget(document.getElementById("xsj-project-tree-slot")), []);
  useEffect(() => {
    let active = true;
    void fetch(`/api/projects/${projectId}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload: unknown) => {
        if (!active || !payload || typeof payload !== "object") return;
        const record = payload as Record<string, unknown>;
        const sources = (Array.isArray(record.sources) ? record.sources : []).flatMap((value) => {
          const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
          const source = row.sourceItem && typeof row.sourceItem === "object" ? row.sourceItem as Record<string, unknown> : row;
          return typeof source.id === "string" ? [{ id: source.id, title: typeof source.title === "string" && source.title.trim() ? source.title : "未命名资料" }] : [];
        });
        const artifacts = artifactOptions.map(item => ({ id: item.artifactId, title: item.title, node: `artifact:${item.artifactId}` }));
        setData({ id: projectId, title: typeof record.title === "string" ? record.title : "当前项目", sources, artifacts });
      })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [projectId, artifactOptions]);
  if (!target || !data) return null;
  return createPortal(<section className={`xsj-project-tree ${open ? "is-open" : ""}`} aria-label="当前项目树">
    <header><button type="button" onClick={() => setOpen(!open)} aria-expanded={open}><ChevronDown size={13} /><span>当前项目</span></button><Link href={`/dashboard?project=${data.id}`} title={data.title}>{data.title}</Link></header>
    {open ? <div className="xsj-project-tree-body">
      <Link className={`xsj-project-tree-node ${selectedNode === "conversation" || !selectedNode ? "is-selected" : ""}`} href={`/dashboard?project=${data.id}`}><Sparkles size={14} /><span>对话</span></Link>
      {data.sources.length ? <details open><summary><ChevronDown size={12} /><FileText size={14} /><span>资料</span><small>{data.sources.length}</small></summary><div>{data.sources.slice(0, 12).map((source) => <Link className={selectedNode === `source:${source.id}` ? "is-selected" : ""} key={source.id} href={`/library/${source.id}`} title={source.title}><FileText size={13} /><span>{source.title}</span></Link>)}</div></details> : null}
      {data.artifacts.length ? <details open><summary><ChevronDown size={12} /><BookOpen size={14} /><span>产出</span><small>{data.artifacts.length}</small></summary><div>{data.artifacts.slice(0, 8).map((artifact) => <Link className={selectedNode === artifact.node ? "is-selected" : ""} key={artifact.id} href={`/dashboard?project=${data.id}&node=${artifact.node}`} title={artifact.title}><FileText size={13} /><span>{artifact.title}</span></Link>)}</div></details> : null}
    </div> : null}
  </section>, target);
}
