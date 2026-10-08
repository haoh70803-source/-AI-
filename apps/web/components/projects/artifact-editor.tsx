"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArtifactEditorState } from "./use-artifact-editor";
import "./artifact-window.css";
export function ArtifactEditor({ editor, canWrite }: { editor: ArtifactEditorState; canWrite: boolean }) {
  return <div ref={editor.editorRef} className="artifact-editor research-creation-editor">
    {editor.artifact ? <h4>编辑成果 · 第 {editor.artifact.version} 版</h4> : <h4>待保存成果</h4>}
    {editor.dirty ? <p role="status">有未保存内容；离开前请保存。</p> : null}
    <label>成果名称<input aria-label="成果名称" value={editor.title} onChange={event => editor.editTitle(event.target.value)} maxLength={200} disabled={editor.busy || !canWrite} /></label>
    <label>成果正文<textarea aria-label="成果正文" value={editor.body} onChange={event => editor.editBody(event.target.value)} maxLength={1_000_000} disabled={editor.busy || !canWrite} /></label>
    <div className="artifact-editor-actions"><button type="button" disabled={editor.busy || !canWrite || !editor.dirty} onClick={() => void editor.save()}>{editor.artifact ? "保存修改" : "保存为成果"}</button>{editor.artifact ? <><button type="button" disabled={editor.busy} onClick={editor.download}>导出已保存版本</button><small>导出内容：已保存 V{editor.artifact.version}</small></> : null}</div>
    <details className="artifact-editor-preview"><summary>预览当前编辑内容</summary><article className="assistant-markdown" data-testid="generic-artifact-view"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt || "图片引用"}</span> }}>{editor.body}</ReactMarkdown></article></details>
    {editor.status ? <p role="status">{editor.status}</p> : null}{editor.error ? <p role="alert">{editor.error}</p> : null}
  </div>;
}
export function ArtifactUnsavedDialog({ editor, canWrite }: { editor: ArtifactEditorState; canWrite: boolean }) {
  return editor.pendingAction ? <dialog ref={editor.dialogRef} aria-label="处理未保存内容" className="research-unsaved-dialog artifact-unsaved-dialog" onCancel={event => { event.preventDefault(); event.stopPropagation(); editor.cancelAction(); }}><p>当前内容尚未保存。先保存再继续，或取消操作保留编辑。</p><button type="button" disabled={editor.busy || !canWrite} onClick={() => void editor.resolveAction(true)}>保存并继续</button><button type="button" disabled={editor.busy} onClick={() => void editor.resolveAction(false)}>放弃修改并继续</button><button type="button" disabled={editor.busy} onClick={editor.cancelAction}>取消，保留编辑</button>{editor.error ? <p role="alert">{editor.error}</p> : null}</dialog> : null;
}
