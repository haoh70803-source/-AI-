"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SourceWorkspaceModel } from "@/server/material-detail/read-model";

export function SourceUnderstanding({ model, onComplete }: { model: SourceWorkspaceModel; onComplete: () => void }) {
  const value = model.workspace.understanding;
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  if (!value) return null;
  const pdf = model.workspace.capabilities.includes("understandPages");
  const active = busy || value.status === "RUNNING";
  const label = pdf ? "理解 PDF 页面" : "理解图片";
  async function start() {
    if (pending.current || active) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/source-items/${model.actions.sourceId}/understanding`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "理解失败，请重试。");
      onComplete();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "请求未完成，请检查处理状态后重试。"); }
    finally { pending.current = false; setBusy(false); router.refresh(); }
  }
  return <section className="source-understanding" aria-label="资料理解" aria-busy={active}>
    <div><strong>{active ? "正在读取画面…" : value.status === "COMPLETED" ? "理解已完成" : value.status === "FAILED" ? "理解失败，可重试" : "将画面读成文字"}</strong>
      <details><summary>处理范围与费用</summary><p>{pdf ? "主动读取页面文字、表格和图表。每次最多 4 页、每页最长边 1600 像素、页面图片总量最多 12 MB；超限请先拆分文件。" : "主动读取图片中的文字、表格和画面内容。"}仅点击后调用模型，可能产生 API 费用。</p>{value.model ? <small>结果模型：{value.provider} / {value.model}</small> : null}</details>
      {value.text ? <small>AI 读取结果可能有误，请对照原件核对。{value.status === "FAILED" ? "仍可阅读上次成功的结果。" : ""}</small> : null}
      {error || value.error ? <p role="alert">{error || value.error}</p> : null}
      {!value.available ? <p role="status">{value.unavailableReason || "当前未配置可用的视觉模型。"}</p> : null}
    </div>
    {model.actions.canManageProjects && model.actions.status !== "ARCHIVED" ? <button type="button" disabled={!interactive || active || !value.available || model.actions.status !== "READY"} onClick={() => void start()}>{active ? "处理中…" : value.status === "FAILED" ? "重试理解" : value.text ? "重新理解" : label}</button> : null}
  </section>;
}
