"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkResearchView } from "@/server/research/work-research-service";

const stageLabel: Record<string, string> = { QUEUED: "等待深度拆解", READING: "核对作品证据", ANALYZING: "逐段研究内容", COMPLETED: "拆解完成", FAILED: "本次拆解未完成" };

export function WorkResearchControls({ accountId, workId, view, canWrite, externalAvailable = true }: { accountId: string; workId: string; view: WorkResearchView; canWrite: boolean; externalAvailable?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const router = useRouter(); const [active, setActive] = useState(view.active); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [stage, setStage] = useState("");
  const pending = useRef(false); const requestKey = useRef<string | null>(null);
  useEffect(() => setActive(view.active), [view.active]);
  useEffect(() => {
    if (!active) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>; let controller: AbortController | null = null; let failures = 0;
    const started = Date.now();
    const poll = async () => {
      controller = new AbortController(); const timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const response = await fetch(`/api/research/sessions/${active.sessionId}/runs/${active.id}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json(); if (!response.ok) throw new Error(result.message || "状态不可用");
        if (disposed) return; failures = 0; setStage(stageLabel[result.stage] || "正在研究");
        if (!["QUEUED", "RUNNING"].includes(result.status)) {
          disposed = true; setActive(null); setMessage(result.status === "COMPLETED" ? "深度拆解已保存为新的研究版本。" : result.errorMessage || "本次拆解未完成，已有研究仍保留。"); router.refresh(); return;
        }
      } catch { if (!disposed && ++failures >= 5) { disposed = true; setMessage("状态暂时无法连接，稍后刷新页面查看结果。"); } }
      finally { clearTimeout(timeout); if (!disposed && Date.now() - started < 16 * 60_000) timer = setTimeout(poll, 3500); else if (!disposed) { disposed = true; setMessage("研究仍可能在后台继续，请稍后刷新查看。"); } }
    };
    void poll(); return () => { disposed = true; controller?.abort(); clearTimeout(timer); };
  }, [active?.id, active?.sessionId, router]);
  async function start(force: boolean) {
    if (pending.current || !canWrite || !externalAvailable || !view.current.contentText) return;
    pending.current = true; setBusy(true); setMessage(""); requestKey.current ||= crypto.randomUUID();
    try {
      const response = await fetch(`/api/research/benchmarks/${accountId}/works/${workId}/analysis`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestKey: requestKey.current, force }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "无法开始拆解。");
      requestKey.current = null;
      if (result.unchanged) { setMessage(`证据没有变化，沿用第 ${result.version} 版。`); router.refresh(); }
      else { setActive({ id: result.runId, sessionId: result.sessionId, status: result.status, stage: result.status }); setStage(stageLabel[result.status] || "准备研究"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "暂时无法拆解这条作品。"); }
    finally { pending.current = false; setBusy(false); }
  }
  async function save() {
    if (!view.latest || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/research/sessions/${view.latest.sessionId}/runs/${view.latest.id}`, { method: "POST" });
      const result = await response.json(); if (!response.ok) throw new Error(result.message || "保存失败");
      setMessage("已保存为可引用的研究成果。"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }
  async function collect() {
    if (pending.current || !canWrite || !externalAvailable || view.current.sourceItemId) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/research/benchmarks/${accountId}/works/${workId}/collect`, { method: "POST" });
      const result = await response.json(); if (!response.ok || typeof result.sourceItemId !== "string") throw new Error(result.message || "作品收录未完成。");
      // Material owns the next step. A full same-origin navigation keeps the
      // destination reliable even while the dev server is rebuilding routes.
      window.location.assign(`/library/${result.sourceItemId}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "作品收录未完成，请重试。"); }
    finally { pending.current = false; setBusy(false); }
  }
  const current = view.latest?.currentEvidence && view.latest.schemaVersion === "work-research-v2";
  return <div className="work-research-controls" data-ready={ready} inert={!ready}><div className="work-research-actions">
    <button type="button" className="dossier-primary" disabled={!canWrite || !externalAvailable || !view.current.contentText || busy || Boolean(active) || Boolean(current)} onClick={() => void start(false)}>{!externalAvailable && !current ? "AI 拆解待授权接入" : active ? stage || "正在研究" : view.latest ? current ? "当前拆解已是最新" : view.latest.schemaVersion !== "work-research-v2" ? "升级为新版作品研究" : "依据新证据更新拆解" : "开始深度拆解"}</button>
    {!view.current.contentText && !view.current.sourceItemId && view.current.url && canWrite ? <button type="button" className="dossier-primary" disabled={busy || !externalAvailable} onClick={() => void collect()}>{!externalAvailable ? "原件采集待授权接入" : busy ? "正在收录…" : "收录作品并去资料页"}</button> : null}
    {!view.current.contentText && view.current.sourceItemId ? <Link href={`/library/${view.current.sourceItemId}`}>去资料页开始转录 / 读取 →</Link> : null}
    {!view.current.contentText && !view.current.sourceItemId && !view.current.url ? <Link href="/library">到资料库上传原件 →</Link> : null}
    {view.latest && current && canWrite && externalAvailable ? <button type="button" disabled={busy || Boolean(active)} onClick={() => void start(true)}>重新拆解这条作品</button> : null}
    <button type="button" disabled={busy} onClick={() => router.refresh()}>检查证据</button>
    {view.latest ? view.latest.saved ? <Link href={`/research/results/run/${view.latest.id}#share-result`}>加入项目 / 交给 Agent →</Link> : <button type="button" disabled={!canWrite || busy} onClick={() => void save()}>保存为研究成果</button> : null}
    {view.latest ? <a href={`/api/research/benchmarks/${accountId}/works/${workId}/analysis/${view.latest.id}/export`}>导出研究报告 · Markdown</a> : null}
  </div><p className="dossier-footnote">{!externalAvailable ? "当前仅可阅读已保存内容，新采集、转录及 AI 拆解尚待授权接入。" : "点击后才调用 AI；"}正文、时间码或资料版本变化时形成新版本。重新拆解会在相同证据上主动运行一次模型。</p>
    {!view.current.contentText ? <p className="dossier-footnote">这条作品目前只有标题和指标。先收录原件，到资料页主动开始转录或补充正文；文字就绪后回到这里点“开始深度拆解”。收录不会自动调用转录或研究模型。</p> : null}
    {message ? <p role="status">{message}</p> : view.failure && !current ? <p role="status">{view.failure}</p> : null}
  </div>;
}

export function WorkOriginalMedia({ accountId, workId, sourceItemId, originalUrl }: { accountId: string; workId: string; sourceItemId: string; originalUrl: string | null }) {
  const [error, setError] = useState("");
  const media = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const seek = (event: Event) => { const detail = (event as CustomEvent<{ accountId: string; workId: string; startMs: number }>).detail; const video = media.current; if (!video || detail?.accountId !== accountId || detail.workId !== workId || !Number.isFinite(detail.startMs) || detail.startMs < 0 || video.readyState < 1) return; video.currentTime = Math.min(detail.startMs / 1000, Number.isFinite(video.duration) ? video.duration : detail.startMs / 1000); video.scrollIntoView({ block: "center", behavior: "smooth" }); video.focus(); };
    window.addEventListener("research:seek-work", seek); return () => window.removeEventListener("research:seek-work", seek);
  }, [accountId, workId]);
  return error ? <div className="work-media-unavailable"><p>原片当前无法从存储中读取。已保存的文字稿仍可用于研究。</p><div className="work-research-links">{originalUrl ? <a href={originalUrl} target="_blank" rel="noopener noreferrer">打开原作品 ↗</a> : null}<Link href={`/library/${sourceItemId}`}>到资料页查看 →</Link><button type="button" onClick={() => setError("")}>重试预览</button></div></div> : <div><video ref={media} controls preload="metadata" playsInline
    src={`/api/research/benchmarks/${accountId}/works/${workId}/media`} className="work-original-video" aria-label="研究作品原视频"
    onError={() => setError("原视频暂时无法在这里播放；可到资料页查看原件。")}
    onLoadedMetadata={() => setError("")} />
  </div>;
}
