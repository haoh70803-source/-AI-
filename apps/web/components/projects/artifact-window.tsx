"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, FileText } from "lucide-react";
import type { EditScope } from "@/lib/contracts/creation";
import type { ArtifactSummaryView, ArtifactView } from "@/lib/contracts/artifacts";
import { ArtifactEditor, ArtifactUnsavedDialog } from "./artifact-editor";
import { useArtifactEditor } from "./use-artifact-editor";
import "./artifact-window.css";
import { Pagination } from "../pagination";
import { pageWindow } from "@/lib/content-pagination";
export function ArtifactWindow({ projectId, artifacts, active, canWrite, onClose, onContinue, embedded = false }: { projectId: string; artifacts: ArtifactSummaryView[]; active: ArtifactView | null; canWrite: boolean; onClose: () => void; onContinue: (scope?: EditScope | null) => void; embedded?: boolean }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const pageSize = embedded ? 5 : 8;
  const selectedPage = Math.floor(Math.max(0, artifacts.findIndex(item => item.artifactId === active?.artifactId)) / pageSize) + 1;
  const [listPosition, setListPosition] = useState({ activeId: active?.artifactId, page: selectedPage });
  const listWindow = pageWindow(artifacts.length, listPosition.activeId === active?.artifactId ? listPosition.page : selectedPage, pageSize);
  const editor = useArtifactEditor({ projectId, canWrite, initialArtifact: active, onSaved: () => router.refresh() });
  const latestEditor = useRef(editor); latestEditor.current = editor;
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const id = active?.artifactId; if (!id) return;
    const controller = new AbortController(); let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/projects/" + projectId + "/artifacts/" + id, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("ARTIFACT_REFRESH_FAILED");
        const value = await response.json() as ArtifactView, current = latestEditor.current;
        if (stopped || current.artifact?.artifactId !== id) return;
        setRefreshError("");
        if (!current.hasUnsavedContent() && value.version > current.artifact.version) current.showArtifact(value);
      } catch { if (!stopped) setRefreshError("成果版本暂未刷新，当前编辑保留；保存仍会检查版本，请稍后重试。"); }
    };
    void refresh();
    const restored = () => { void refresh(); };
    window.addEventListener("pageshow", restored);
    return () => { stopped = true; controller.abort(); window.removeEventListener("pageshow", restored); };
  }, [projectId, active?.artifactId]);
  useEffect(() => { if (mounted && !embedded) dialog.current?.showModal(); }, [mounted, embedded]);
  if (!mounted) return null;
  const content = <>
    <ArtifactUnsavedDialog editor={editor} canWrite={canWrite} />
    <div className="artifact-window-layout"><aside><h2>项目成果</h2><nav aria-label="成果列表">{artifacts.slice(listWindow.start, listWindow.end).map(item => <Link key={item.artifactId} href={"/dashboard?project=" + projectId + "&node=artifact:" + item.artifactId} scroll={false} aria-current={editor.artifact?.artifactId === item.artifactId ? "page" : undefined}><FileText size={15}/><span>{editor.artifact?.artifactId === item.artifactId ? editor.artifact.title : item.title}<small>V{editor.artifact?.artifactId === item.artifactId ? editor.artifact.version : item.version}</small></span></Link>)}</nav><Pagination label="成果列表分页" {...listWindow} total={artifacts.length} onChange={page => setListPosition({ activeId: active?.artifactId, page })}/><p>保留在当前项目中</p></aside>
    <section className="artifact-window-content"><header><div><h2 title={editor.artifact?.title}>{editor.artifact?.title || "选择一份成果"}</h2>{editor.artifact ? <small>文本成果 · V{editor.artifact.version}</small> : null}</div><button type="button" aria-label="关闭成果" onClick={() => editor.protect(onClose)}><X size={19}/></button></header>
    <div className="artifact-window-body">{refreshError ? <p role="alert">{refreshError}</p> : null}{editor.artifact ? <ArtifactEditor editor={editor} canWrite={canWrite} /> : <p>从左侧选择已保存的成果。</p>}</div>
    {editor.artifact ? <footer><span>修改后保存会生成新版本，旧版本保留。</span><button type="button" disabled={editor.busy || !canWrite || Boolean(editor.artifact.locked)} onClick={() => editor.protect(() => onContinue(editor.selectedScope))}>{editor.selectedScope ? "通过 AI 修改选中内容" : "通过 AI 继续修改"}</button></footer> : null}</section></div>
  </>;
  if (embedded) return <section className="artifact-window is-embedded" aria-label="项目成果">{content}</section>;
  return createPortal(<dialog ref={dialog} className="artifact-window" aria-label="项目成果" onCancel={event => { event.preventDefault(); editor.protect(onClose); }} onClick={event => { if (event.target === event.currentTarget) editor.protect(onClose); }}>{content}</dialog>, document.body);
}
