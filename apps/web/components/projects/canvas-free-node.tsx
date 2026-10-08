"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FileText, ImageIcon, Link2, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { createContext, memo, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { employeeSourceMeta } from "@/lib/content-labels";
import type { CanvasObjectDTO } from "@/lib/contracts/canvas";

export type CanvasSaveState = "idle" | "dirty" | "saving" | "saved" | "save_failed" | "conflict";
export type FreeCanvasNodeData = {
  object: CanvasObjectDTO;
  editable: boolean;
  editing: boolean;
  saveState: CanvasSaveState;
};
export type FreeCanvasNode = Node<FreeCanvasNodeData, "free">;

type FreeNodeActions = {
  changeText: (objectId: string, value: { title: string; textContent: string }) => void;
  deleteObject: (objectId: string) => void;
  startEditing: (objectId: string) => void;
  stopEditing: (objectId: string) => void;
  retrySave: (objectId: string) => void;
};

const FreeNodeActionsContext = createContext<FreeNodeActions | null>(null);

export function FreeNodeActionsProvider({ actions, children }: { actions: FreeNodeActions; children: ReactNode }) {
  return <FreeNodeActionsContext.Provider value={actions}>{children}</FreeNodeActionsContext.Provider>;
}

function saveLabel(state: CanvasSaveState) {
  if (state === "dirty" || state === "saving") return "保存中…";
  if (state === "save_failed") return "保存失败";
  if (state === "conflict") return "内容有冲突";
  if (state === "saved") return "已保存";
  return "";
}

function CanvasImage({ object }: { object: CanvasObjectDTO }) {
  const reference = object.materialReference;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const asset = reference?.sourceAsset;
    if (!reference || !asset || asset.status !== "STORED") return;
    const controller = new AbortController();
    fetch(`/api/source-items/${reference.sourceItem.id}/assets/${asset.id}/access?disposition=inline`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || typeof result.url !== "string") throw new Error("IMAGE_ACCESS_FAILED");
        setUrl(result.url);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, [reference]);
  if (url) return <img src={url} alt={object.title || reference?.sourceTitleSnapshot || "资料图片"} />;
  return <div className="canvas-image-placeholder"><ImageIcon size={22} /><span>{failed ? "图片暂时无法预览" : reference?.sourceAsset?.status === "STORED" ? "正在加载图片" : "图片尚未保存完成"}</span></div>;
}

function FreeCanvasNodeView({ data, selected }: NodeProps<FreeCanvasNode>) {
  const actions = useContext(FreeNodeActionsContext);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { object, editable, editing, saveState } = data;
  const reference = object.materialReference;
  const sourceMeta = reference ? [employeeSourceMeta(reference.sourceItem.sourceType, reference.sourceItem.sourcePlatform), reference.sourceItem.status === "ARCHIVED" ? "来源已归档" : null].filter(Boolean).join(" · ") : "";

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  if (!actions) return null;
  const onEditorKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
      event.preventDefault();
      actions.stopEditing(object.id);
    }
  };

  return <article
    className={`free-canvas-node is-${object.objectType.toLowerCase().replaceAll("_", "-")} ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""} ${editable ? "" : "is-readonly"}`}
    onDoubleClick={() => { if (editable && object.objectType === "TEXT") actions.startEditing(object.id); }}
  >
    <Handle type="target" position={Position.Left} isConnectable={false} className="canvas-system-handle" />
    <Handle type="source" position={Position.Right} isConnectable={false} className="canvas-system-handle" />
    <header>
      <span aria-hidden="true">{object.objectType === "TEXT" ? <FileText size={17} /> : object.objectType === "IMAGE_REFERENCE" ? <ImageIcon size={17} /> : <Link2 size={17} />}</span>
      {editing ? <input className="nodrag nowheel" aria-label="文本标题" value={object.title ?? ""} maxLength={200} placeholder="未命名文本" onKeyDown={onEditorKeyDown} onChange={(event) => actions.changeText(object.id, { title: event.target.value, textContent: object.textContent ?? "" })} /> : <strong>{object.title || (object.objectType === "TEXT" ? "未命名文本" : reference?.sourceTitleSnapshot || "未命名资料")}</strong>}
      <small>{object.objectType === "TEXT" ? "文本" : object.objectType === "IMAGE_REFERENCE" ? "图片" : "资料"}</small>
      {editable ? <button className="nodrag canvas-node-delete" type="button" title="删除" aria-label={`删除 ${object.title || "当前节点"}`} onClick={() => actions.deleteObject(object.id)}><Trash2 size={15} /></button> : null}
    </header>

    {object.objectType === "TEXT" ? editing ? <textarea
      ref={textareaRef}
      className="nodrag nowheel"
      aria-label="文本内容"
      value={object.textContent ?? ""}
      placeholder="直接在这里输入内容…"
      onKeyDown={onEditorKeyDown}
      onChange={(event) => actions.changeText(object.id, { title: object.title ?? "", textContent: event.target.value })}
    /> : <button type="button" className="free-canvas-text nodrag" aria-label={`编辑 ${object.title || "未命名文本"}`} disabled={!editable} onClick={() => actions.startEditing(object.id)}>{object.textContent?.trim() || "点击开始输入内容"}</button> : null}

    {object.objectType === "MATERIAL_REFERENCE" && reference ? <div className="canvas-material-content">
      <div className="canvas-material-heading"><strong>{reference.sourceTitleSnapshot || "项目资料"}</strong><span>{sourceMeta}</span></div>
      <p>{reference.excerpt || reference.sourceItem.description || "这是一条来自资料库的真实引用。"}</p>
      <small>可继续使用</small>
    </div> : null}

    {object.objectType === "IMAGE_REFERENCE" ? <CanvasImage object={object} /> : null}

    {object.generatedFrom.length ? <div className="canvas-generated-origin">{object.generatedFrom.some(({ sourceDeleted }) => sourceDeleted) ? "部分来源已删除" : `基于 ${object.generatedFrom.length} 项内容生成`}</div> : null}

    <footer>
      <span className={`canvas-save-state is-${saveState}`} aria-live="polite">{saveLabel(saveState)}</span>
      {saveState === "save_failed" || saveState === "conflict" ? <button className="nodrag" type="button" onClick={() => actions.retrySave(object.id)}><RotateCcw size={13} />重试</button> : null}
      {reference ? <Link className="nodrag" href={`/library/${reference.sourceItem.id}`}>打开资料</Link> : null}
    </footer>

  </article>;
}

export const CanvasFreeNode = memo(FreeCanvasNodeView);
