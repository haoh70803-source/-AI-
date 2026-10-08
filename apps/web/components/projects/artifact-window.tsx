"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, FileText } from "lucide-react";
import type { ArtifactSummaryView, ArtifactView } from "@/lib/contracts/artifacts";
import { ArtifactEditor, ArtifactUnsavedDialog } from "./artifact-editor";
import { useArtifactEditor } from "./use-artifact-editor";
import "./artifact-window.css";
export function ArtifactWindow({ projectId, artifacts, active, canWrite, onClose, onContinue }: { projectId: string; artifacts: ArtifactSummaryView[]; active: ArtifactView | null; canWrite: boolean; onClose: () => void; onContinue: () => void }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  const [refreshError, setRefreshError] = useState("");
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
        if (!current.hasUnsavedContent() && value.version >= current.artifact.version) current.showArtifact(value);
      } catch { if (!stopped) setRefreshError("成果版本暂未刷新，当前编辑保留；保存仍会检查版本，请稍后重试。"); }
    };
    void refresh();
    const restored = () => { void refresh(); };
    window.addEventListener("pageshow", restored);
    return () => { stopped = true; controller.abort(); window.removeEventListener("pageshow", restored); };
  }, [projectId, active?.artifactId]);
  useEffect(() => { if (mounted) dialog.current?.showModal(); }, [mounted]);
  if (!mounted) return null;
  return createPortal(<dialog ref={dialog} className="artifact-window" aria-label="项目成果" onCancel={event => { event.preventDefault(); editor.protect(onClose); }} onClick={event => { if (event.target === event.currentTarget) editor.protect(onClose); }}>
    <ArtifactUnsavedDialog editor={editor} canWrite={canWrite} />
    <div className="artifact-window-layout"><aside><h2>项目成果</h2><nav aria-label="成果列表">{artifacts.map(item => <Link key={item.artifactId} href={"/dashboard?project=" + projectId + "&node=artifact:" + item.artifactId} scroll={false} aria-current={editor.artifact?.artifactId === item.artifactId ? "page" : undefined}><FileText size={15}/><span>{item.title}<small>V{item.version}</small></span></Link>)}</nav><p>保留在当前项目中</p></aside>
    <section className="artifact-window-content"><header><div><h2>{editor.artifact?.title || "选择一份成果"}</h2>{editor.artifact ? <small>文本成果 · V{editor.artifact.version}</small> : null}</div><button type="button" aria-label="关闭成果" onClick={() => editor.protect(onClose)}><X size={19}/></button></header>
    <div className="artifact-window-body">{refreshError ? <p role="alert">{refreshError}</p> : null}{editor.artifact ? <ArtifactEditor editor={editor} canWrite={canWrite} /> : <p>从左侧选择已保存的成果。</p>}</div>
    {editor.artifact ? <footer><span>修改后保存会生成新版本，旧版本保留。</span><button type="button" disabled={editor.busy || !canWrite} onClick={() => editor.protect(onContinue)}>通过 AI 继续修改</button></footer> : null}</section></div>
  </dialog>, document.body);
}
