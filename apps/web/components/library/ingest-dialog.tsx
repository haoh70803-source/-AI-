"use client";

import { Button } from "@content-center/ui";
import { AudioLines, FileText, FileUp, ImageIcon, Plus, UploadCloud, Video, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sourceUploadStatusLabel, uploadSourceFiles, type SourceUploadResult } from "@/lib/source-upload-client";

type Kind = "FILE" | "TEXT" | "URL" | "DOUYIN";
type UploadRow = SourceUploadResult & { clientId: string; file?: File };

function isTerminalUploadStatus(status: SourceUploadResult["processingStatus"]) {
  return status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";
}

function iconForFile(name: string): LucideIcon {
  const extension = name.toLowerCase().split(".").pop();
  if (["mp4", "mov"].includes(extension ?? "")) return Video;
  if (["mp3", "wav", "m4a"].includes(extension ?? "")) return AudioLines;
  if (["jpg", "jpeg", "png", "webp"].includes(extension ?? "")) return ImageIcon;
  return FileText;
}

function stageForJob(job: { status?: SourceUploadResult["processingStatus"]; currentStage?: SourceUploadResult["currentStage"] }): SourceUploadResult["stage"] {
  if (job.currentStage === "TRANSCRIBING") return "TRANSCRIBING";
  if (job.currentStage === "READING") return "READING";
  if (job.currentStage === "READY" || job.status === "SUCCEEDED") return "READY";
  if (job.currentStage === "FAILED" || job.status === "FAILED" || job.status === "CANCELLED") return "FAILED";
  return "UPLOADED";
}

export function IngestDialog({ initialOpen = false }: { initialOpen?: boolean } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [dragging, setDragging] = useState(false);
  const [kind, setKind] = useState<Kind>("FILE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ sourceItemId: string } | null>(null);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [existingSourceId, setExistingSourceId] = useState<string | null>(null);
  const [pollKick, setPollKick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const uploadsRef = useRef<UploadRow[]>([]);
  const uploadJobKey = uploads.filter((item) => item.status === "QUEUED" && item.jobId).map((item) => item.jobId).join("|");

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    if (files.length > 10) {
      setOpen(true);
      setKind("FILE");
      setError("一次最多添加 10 个文件。");
      return;
    }
    setBusy(true);
    setError("");
    setOpen(true);
    setKind("FILE");
    const batchId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const initialRows: UploadRow[] = files.map((file, index) => ({ clientId: `${batchId}-${index}`, name: file.name, status: "QUEUED", stage: "UPLOADING", uploadProgress: 0, file }));
    uploadsRef.current = initialRows;
    setUploads(initialRows);
    try {
      const results = await uploadSourceFiles(files, (index, progress) => {
        setUploads((current) => current.map((item) => item.clientId === initialRows[index]?.clientId ? { ...item, uploadProgress: progress, stage: "UPLOADING" } : item));
      });
      const nextRows = results.map((item, index) => ({
        ...item,
        clientId: initialRows[index]?.clientId ?? `${batchId}-${index}`,
        file: initialRows[index]?.file,
        uploadProgress: item.status === "FAILED" ? initialRows[index]?.uploadProgress ?? 0 : 100,
        stage: item.status === "FAILED" ? "FAILED" as const : item.status === "READY" || item.status === "DUPLICATE" ? "READY" as const : "UPLOADED" as const,
        processingStatus: item.status === "QUEUED" ? "QUEUED" as const : item.processingStatus,
      }));
      uploadsRef.current = nextRows;
      setUploads(nextRows);
      if (nextRows.some((item) => item.status === "READY" || item.status === "DUPLICATE")) router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "上传失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => {
    if (!open || !uploadJobKey) return;
    let stopped = false;
    let timer: number | undefined;

    const poll = async () => {
      if (stopped) return;
      const pending = uploadsRef.current.filter((item) => item.status === "QUEUED" && item.jobId && !isTerminalUploadStatus(item.processingStatus));
      if (!pending.length) return;
      const updates = await Promise.all(pending.map(async (item) => {
        try {
          const response = await fetch(`/api/ingest-jobs/${item.jobId}`, { cache: "no-store" });
          if (!response.ok) return null;
          const job = await response.json() as { status?: SourceUploadResult["processingStatus"]; currentStage?: SourceUploadResult["currentStage"]; userSafeMessage?: string };
          return job.status ? { jobId: item.jobId!, ...job } : null;
        } catch {
          return null;
        }
      }));
      if (stopped) return;
      const reachedTerminal = updates.some((update) => update && isTerminalUploadStatus(update.status));
      setUploads((current) => {
        let changed = false;
        const next = current.map((item) => {
          const update = updates.find((candidate) => candidate?.jobId === item.jobId);
          if (!update) return item;
          const stage = stageForJob(update);
          const message = stage === "FAILED" ? update.userSafeMessage ?? "上传成功，但读取失败，请点击重试处理。" : item.message;
          if (item.processingStatus === update.status && item.currentStage === update.currentStage && item.stage === stage && item.message === message) return item;
          changed = true;
          return { ...item, processingStatus: update.status, currentStage: update.currentStage, stage, ...(message ? { message } : {}) };
        });
        return changed ? next : current;
      });
      if (reachedTerminal) router.refresh();
      if (!stopped && uploadsRef.current.some((item) => item.status === "QUEUED" && item.jobId && !isTerminalUploadStatus(item.processingStatus))) {
        timer = window.setTimeout(() => void poll(), 2_000);
      }
    };

    void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [open, pollKick, router, uploadJobKey]);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void handleFiles([...event.dataTransfer.files]);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  async function retryUpload(item: UploadRow) {
    if (!item.file) {
      fileInputRef.current?.click();
      return;
    }
    setBusy(true);
    setUploads((current) => current.map((row) => row.clientId === item.clientId ? { ...row, status: "QUEUED", stage: "UPLOADING", uploadProgress: 0, processingStatus: undefined, currentStage: undefined, jobId: undefined, message: undefined } : row));
    try {
      const [result] = await uploadSourceFiles([item.file], (progress) => {
        setUploads((current) => current.map((row) => row.clientId === item.clientId ? { ...row, uploadProgress: progress, stage: "UPLOADING" } : row));
      });
      if (!result) throw new Error("上传失败，请重试。");
      const next: UploadRow = {
        ...result,
        clientId: item.clientId,
        file: item.file,
        uploadProgress: result.status === "FAILED" ? 0 : 100,
        stage: result.status === "FAILED" ? "FAILED" as const : result.status === "READY" || result.status === "DUPLICATE" ? "READY" as const : "UPLOADED" as const,
        processingStatus: result.status === "QUEUED" ? "QUEUED" as const : result.processingStatus,
      };
      setUploads((current) => current.map((row) => row.clientId === item.clientId ? next : row));
      setPollKick((value) => value + 1);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function retryProcessing(item: UploadRow) {
    if (!item.jobId) return;
    setUploads((current) => current.map((row) => row.clientId === item.clientId ? { ...row, stage: "READING", processingStatus: "QUEUED", currentStage: "QUEUED", message: undefined } : row));
    try {
      const response = await fetch(`/api/ingest-jobs/${item.jobId}/retry`, { method: "POST" });
      if (!response.ok) throw new Error("重试处理暂时失败，请稍后再试。");
      const body = await response.json().catch(() => ({})) as { jobId?: string };
      if (body.jobId) setUploads((current) => current.map((row) => row.clientId === item.clientId ? { ...row, jobId: body.jobId } : row));
      setPollKick((value) => value + 1);
    } catch (cause) {
      setUploads((current) => current.map((row) => row.clientId === item.clientId ? { ...row, stage: "FAILED", processingStatus: "FAILED", message: cause instanceof Error ? cause.message : "重试处理暂时失败，请稍后再试。" } : row));
    }
  }

  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    setExistingSourceId(null);
    let payload: Record<string, unknown> = kind === "TEXT"
      ? { kind, title: formData.get("title"), text: formData.get("text"), notes: formData.get("notes") }
      : kind === "URL"
        ? { kind, url: formData.get("url") }
        : { kind, shareText: formData.get("shareText") };
    if (kind === "DOUYIN") {
      const input = String(formData.get("shareText") ?? "");
      const urls = input.match(/https?:\/\/[^\s<>"，。；]+/g) ?? [];
      if (urls.length !== 1) { setError("请输入一个明确的视频分享链接或视频文件直链。"); setBusy(false); return; }
      try {
        const url = new URL(urls[0]!);
        const platformLink = /(^|\.)(douyin\.com|iesdouyin\.com|xiaohongshu\.com|xhslink\.com)$/i.test(url.hostname);
        payload = { kind: platformLink ? "REDFOX" : "MEDIA_URL", url: url.toString(), autoTranscribe: formData.get("autoTranscribe") === "on" };
      } catch { setError("视频链接格式不正确。"); setBusy(false); return; }
    }
    try {
    const response = await fetch("/api/source-items", { signal: AbortSignal.timeout(30_000), method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.message || body.error || "收录失败，请检查输入。");
      if (["DUPLICATE_SOURCE", "DUPLICATE_URL"].includes(body.error) && typeof body.sourceItemId === "string") setExistingSourceId(body.sourceItemId);
      setBusy(false);
      return;
    }
    setCreated({ sourceItemId: body.sourceItemId });
    setBusy(false);
    router.refresh();
    } catch { setError("请求未完成，请稍后重试。"); } finally { setBusy(false); }
  }

  function close() {
    setOpen(false);
    setCreated(null);
    setUploads([]);
    uploadsRef.current = [];
    setError("");
    setExistingSourceId(null);
    setKind("FILE");
  }

  const tabs: Array<{ value: Kind; label: string }> = [
    { value: "FILE", label: "上传文件" },
    { value: "TEXT", label: "粘贴文字" },
    { value: "URL", label: "网页链接" },
    { value: "DOUYIN", label: "视频链接" },
  ];
  const finished = uploads.length > 0 && uploads.every((item) => item.status === "FAILED" || item.status === "DUPLICATE" || item.status === "READY" || item.processingStatus === "SUCCEEDED" || item.processingStatus === "FAILED" || item.processingStatus === "CANCELLED");
  const readyCount = uploads.filter((item) => item.status === "READY" || item.status === "DUPLICATE" || item.processingStatus === "SUCCEEDED").length;
  const failedCount = uploads.filter((item) => item.status === "FAILED" || item.processingStatus === "FAILED" || item.processingStatus === "CANCELLED").length;

  return (
    <>
      {dragging ? <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-[color:var(--accent)]/15 p-6"><div className="rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--surface)] px-12 py-10 text-center shadow-2xl"><UploadCloud className="mx-auto mb-3 text-[var(--accent)]" size={40} /><strong className="block text-lg">添加资料</strong><span className="mt-1 block text-sm text-[var(--text-secondary)]">松开鼠标即可添加 · 支持视频、录音、PDF、Word、TXT、Markdown、图片</span></div></div> : null}
      <Button onClick={() => setOpen(true)}><Plus size={16} /> 添加资料</Button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="ingest-title" className="w-full max-w-2xl rounded-2xl border bg-[var(--surface)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="ingest-title" className="text-xl font-semibold">添加资料</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">系统会自动读取内容，处理期间可以离开此页面。</p></div>
              <button aria-label="关闭" onClick={close} className="rounded-lg p-2 hover:bg-[var(--surface-elevated)]"><X size={18} /></button>
            </div>
            {created ? (
              <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5"><p className="font-medium text-blue-900">处理中</p><p className="mt-1 text-sm text-blue-800">内容已提交，页面会自动更新处理状态。</p><Link className="mt-4 inline-block text-sm font-medium text-[var(--accent)] underline" href={`/library/${created.sourceItemId}`} onClick={close}>查看资料</Link></div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-4 gap-2 rounded-xl bg-[var(--surface-elevated)] p-1">{tabs.map(({ value, label }) => <button key={value} type="button" onClick={() => { setKind(value); setError(""); }} className={`rounded-lg px-2 py-2 text-sm ${kind === value ? "bg-[var(--surface)] font-medium shadow-sm" : "text-[var(--text-secondary)]"}`}>{label}</button>)}</div>
                {kind === "FILE" ? <div className="mt-5 grid gap-4"><button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)] text-sm hover:border-[var(--accent)] disabled:opacity-60"><FileUp size={24} /><strong>{busy ? "正在上传…" : "选择文件"}</strong><span className="text-xs text-[var(--text-secondary)]">支持视频、录音、PDF、Word、TXT、Markdown、图片</span></button><input ref={fileInputRef} className="hidden" type="file" multiple accept=".mp4,.mov,.mp3,.wav,.m4a,.pdf,.docx,.txt,.md,.markdown,.jpg,.jpeg,.png,.webp" onChange={(event) => { const files = event.target.files ? [...event.target.files] : []; event.currentTarget.value = ""; void handleFiles(files); }} />{uploads.length ? <div className="grid gap-2" aria-live="polite">{uploads.map((item) => { const Icon = iconForFile(item.name); const failed = item.status === "FAILED" || item.stage === "FAILED" || item.processingStatus === "FAILED" || item.processingStatus === "CANCELLED"; const statusText = item.status === "FAILED" ? item.message ?? sourceUploadStatusLabel(item) : item.stage === "FAILED" ? item.message ?? sourceUploadStatusLabel(item) : sourceUploadStatusLabel(item); return <div key={item.clientId} className="grid gap-2 rounded-xl border p-3 text-sm"><div className="flex items-center gap-3"><Icon size={18} className="shrink-0 text-[var(--text-secondary)]" /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className={failed ? "text-[var(--danger)]" : item.stage === "READY" ? "text-[var(--success)]" : "text-[var(--accent)]"}>{statusText}</span></div><progress className="h-1.5 w-full accent-[var(--accent)]" value={item.uploadProgress ?? (item.stage === "UPLOADING" ? 0 : 100)} max={100} aria-label={`${item.name}上传进度`} />{failed ? <button type="button" className="justify-self-start text-xs font-medium text-[var(--accent)] underline" onClick={() => item.status === "FAILED" ? void retryUpload(item) : void retryProcessing(item)}>{item.status === "FAILED" ? "重试上传" : "重试处理"}</button> : null}</div>; })}</div> : null}{finished ? <p role="status" className="rounded-xl bg-[var(--surface-elevated)] p-3 text-sm text-[var(--success)]">已完成 {readyCount} 份资料{failedCount ? `，${failedCount} 份处理失败` : ""}。</p> : null}<p className="text-xs text-[var(--text-secondary)]">也可以直接把文件拖到资料页，松开后立即开始添加。</p></div> : <form action={submit} className="mt-5 grid gap-4">{kind === "TEXT" ? <><label className="grid gap-1.5 text-sm">标题（可选）<input name="title" maxLength={200} className="h-10 rounded-[var(--radius)] border bg-transparent px-3" /></label><label className="grid gap-1.5 text-sm">正文<textarea name="text" required rows={9} className="rounded-[var(--radius)] border bg-transparent p-3 leading-6" /></label><label className="grid gap-1.5 text-sm">备注（可选）<textarea name="notes" rows={2} className="rounded-[var(--radius)] border bg-transparent p-3 leading-6" /></label></> : kind === "URL" ? <label className="grid gap-1.5 text-sm">网页链接<input name="url" type="url" required placeholder="https://example.com/article" className="h-10 rounded-[var(--radius)] border bg-transparent px-3" /></label> : <label className="grid gap-1.5 text-sm">视频分享链接或视频文件直链<textarea name="shareText" required rows={5} maxLength={10000} placeholder={'3.21 复制打开抖音，看看这个作品…\nhttps://v.douyin.com/xxxx/'} className="rounded-[var(--radius)] border bg-transparent p-3 leading-6" /><span className="text-xs text-[var(--text-secondary)]">支持抖音、小红书作品分享链接，或可公开下载的视频文件地址。分享链接需配置解析服务。</span></label>}{kind === "DOUYIN" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoTranscribe" defaultChecked />获取视频后自动生成文字稿<span className="text-xs text-[var(--text-secondary)]">优先云端识别，本地识别兜底</span></label> : null}{error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}{existingSourceId ? <> <Link href={`/library/${existingSourceId}`} onClick={close} className="underline">查看已有资料</Link></> : null}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={close}>取消</Button><Button type="submit" disabled={busy}>{busy ? "提交中…" : kind === "DOUYIN" ? "添加并处理视频" : "添加资料"}</Button></div></form>}
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
