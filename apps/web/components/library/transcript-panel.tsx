"use client";

import { Badge, Button, Card } from "@content-center/ui";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TranscriptionActions } from "./transcription-actions";

export function TranscriptPanel({ sourceId, status, method, quality, processingTime, updatedAt, fullText, canEdit, canTranscribe, configured, busy, failed = false, preview = false, message, compact = false }: {
  sourceId: string; status: string; method: string; quality: string; processingTime: string; updatedAt?: string; fullText?: string; canEdit: boolean; canTranscribe: boolean; configured: boolean; busy: boolean; failed?: boolean; preview?: boolean; message?: string; compact?: boolean;
}) {
  const router = useRouter();
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fullText ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  async function save() {
    setSaving(true); setNotice("");
    try {
      const response = await fetch(`/api/source-items/${sourceId}/transcript`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullText: draft }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "保存失败");
      setEditing(false); setNotice("文字稿已保存，内容理解结果可能需要更新。"); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  }
  const failureReason = message?.replace(/^转写失败[:：]?\s*/u, "");
  const body = editing ? <textarea aria-label="编辑文字稿" value={draft} onChange={(event) => setDraft(event.target.value)} className="h-full min-h-[24rem] w-full resize-none bg-transparent p-4 text-sm leading-7 outline-none" />
    : fullText ? <p className="whitespace-pre-wrap p-4 text-sm leading-7">{fullText}</p>
      : busy ? <div className="transcript-processing-state"><span className="transcript-processing-icon" /><div><h3>{status || "正在生成文字稿"}</h3><p>正在处理当前资料。你仍然可以查看原始内容，完成后文字会自动显示在这里。</p></div><div className="transcript-skeleton"><i /><i /><i /><i /><i /></div></div>
        : failed ? <div className="transcript-empty-state is-failed"><h3>这次转写没有完成</h3><p>可以重新尝试，原始资料和已有研究结果不会受到影响。</p>{failureReason ? <details><summary>查看原因</summary><p>{failureReason}</p></details> : null}</div>
          : !configured ? <div className="transcript-empty-state"><h3>当前暂时无法生成文字稿</h3><p>转写服务尚未准备好。原始资料仍可查看，服务恢复后可以从这里继续。</p></div>
            : <div className="transcript-empty-state"><h3>还没有文字稿</h3><p>生成文字稿后，可以继续看懂内容、提炼值得学的东西或找选题。</p></div>;
  return <Card id="transcript-panel" className="source-transcript-card p-5" data-testid="transcript-panel">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">文字稿</h2><div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)] ${compact ? "transcript-meta-compact" : ""}`}><span>状态：{preview ? `状态预览 · ${status}` : status}</span><span>方式：{method}</span><span>质量：{quality}</span><span>耗时：{processingTime}</span>{updatedAt ? <span>更新：{updatedAt}</span> : null}</div></div>{compact ? null : <Badge>{preview ? `状态预览 · ${status}` : status}</Badge>}</div>
    {message && fullText ? <p className="mt-4 text-sm text-[var(--text-secondary)]">{message}</p> : null}
    <div data-testid="transcript-scroll-region" className="source-transcript-scroll mt-4 overflow-y-auto rounded-xl border bg-[var(--surface-elevated)]">{body}</div>
    <div className="source-transcript-actions mt-4 flex flex-wrap gap-2">
      {editing ? <><Button disabled={saving || !draft.trim()} onClick={save}>保存文字稿</Button><Button variant="secondary" disabled={saving} onClick={() => { setEditing(false); setDraft(fullText ?? ""); }}>取消</Button></> : <>{fullText ? <Button variant="secondary" onClick={() => navigator.clipboard.writeText(fullText).then(() => setNotice("全文已复制"), () => setNotice("复制失败，请手动选择文本。"))}>复制全文</Button> : null}{fullText && canEdit ? <Button variant="secondary" onClick={() => setEditing(true)}>编辑</Button> : null}{fullText ? <Button variant="secondary" onClick={() => setReading(true)}>展开阅读</Button> : null}</>}
      <TranscriptionActions sourceId={sourceId} canTranscribe={canTranscribe} configured={configured} hasTranscript={Boolean(fullText)} retry={failed} busy={busy} />
    </div>
    {notice ? <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">{notice}</p> : null}
    {reading ? <div className="fixed inset-0 z-50 bg-black/35 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label="文字稿全文"><div className="mx-auto flex h-full max-w-3xl flex-col rounded-2xl bg-[var(--surface)] shadow-2xl"><header className="flex items-center justify-between border-b p-4"><h2 className="font-semibold">文字稿全文</h2><button aria-label="关闭全文阅读" className="rounded-full p-2" onClick={() => setReading(false)}><X size={18} /></button></header><article className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-8">{fullText}</article></div></div> : null}
  </Card>;
}
