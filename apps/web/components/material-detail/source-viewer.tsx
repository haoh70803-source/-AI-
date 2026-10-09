"use client";

import { AudioLines, Expand, FileText, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { SourceWorkspaceModel } from "@/server/material-detail/read-model";

export function SourceViewer({ model, mediaRef, onMediaReady }: {
  model: SourceWorkspaceModel;
  mediaRef: RefObject<HTMLMediaElement | null>;
  onMediaReady?: (ready: boolean) => void;
}) {
  const { preview, header } = model.detail;
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const pdf = model.workspace.mimeType === "application/pdf";
  const url = preview.type === "DOCUMENT" ? preview.documentUrl : preview.mediaUrl || (preview.type === "IMAGE" ? preview.coverUrl : null);

  useEffect(() => {
    const element = mediaRef.current;
    if (!element || !["VIDEO", "AUDIO"].includes(preview.type)) { onMediaReady?.(false); return; }
    // Metadata may finish loading before hydration attaches the React handler.
    const synchronize = () => onMediaReady?.(element.readyState >= 1 && !element.error);
    synchronize();
    element.addEventListener("loadedmetadata", synchronize);
    element.addEventListener("error", synchronize);
    return () => { element.removeEventListener("loadedmetadata", synchronize); element.removeEventListener("error", synchronize); };
  }, [url, failed, mediaRef, onMediaReady, preview.type]);

  useEffect(() => {
    const element = imageViewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [url, failed]);

  const fittedScale = natural.width && natural.height && viewport.width && viewport.height
    ? Math.min(viewport.width / natural.width, viewport.height / natural.height, 1) : 1;
  const scale = (fit ? fittedScale : 1) * zoom;
  const imageWidth = natural.width * scale;
  const imageHeight = natural.height * scale;
  const plainText = ["TEXT", "URL"].includes(preview.type) || preview.type === "DOCUMENT" && !pdf ? model.detail.transcript.text : null;
  const unavailable = failed || !url;
  function resetFit() { setFit(true); setZoom(1); }

  if (preview.type === "AUDIO" && url && !failed) return <section className="source-audio-player" aria-label="原始资料预览">
    <span className="source-audio-icon"><AudioLines size={23} /></span>
    <div><strong>原始音频</strong><audio ref={(element) => { mediaRef.current = element; }} controls preload="metadata" src={url}
      onLoadedMetadata={() => onMediaReady?.(true)} onError={() => { setFailed(true); onMediaReady?.(false); }} /></div>
  </section>;

  return <section className="source-viewer" aria-label="原始资料预览">
    <header className="source-viewer-tools">
      <div className="source-viewer-heading"><FileText size={15} /><strong>原件</strong><span>{model.workspace.sizeLabel || header.typeLabel}</span></div>
      <div className="source-viewer-controls">
        {preview.type === "IMAGE" && !unavailable ? <>
          <button type="button" onClick={resetFit} aria-pressed={fit && zoom === 1} title="完整显示图片"><Expand size={14} /><span>适应窗口</span></button>
          <button type="button" onClick={() => { setFit(false); setZoom(1); }} aria-pressed={!fit && zoom === 1}>原始尺寸</button>
        </> : null}
        <button type="button" aria-label="全屏预览" title="全屏预览" onClick={() => {
          void frameRef.current?.requestFullscreen().catch(() => setNotice("当前浏览器不支持全屏，可下载原件查看。"));
        }}><Maximize2 size={15} /></button>
      </div>
    </header>
    <div ref={frameRef} className={`source-viewer-stage type-${preview.type.toLowerCase()} ${unavailable ? "is-unavailable" : ""}`}>
      {plainText ? <article className="source-document-text" aria-label="原文预览"><pre>{plainText}</pre></article> : unavailable ? <div className="source-viewer-fallback"><FileText size={30} /><strong>{failed ? "预览暂时无法加载" : model.workspace.busy ? model.workspace.processingLabel : model.actions.status === "FAILED" ? "资料获取失败" : (["VIDEO", "AUDIO"].includes(preview.type) ? "未保存原音视频文件" : "原件预览不可用")}</strong>
        <p>{model.workspace.busy ? "正在获取原文件，文件保存完成后才能播放和转写。" : model.workspace.processingError || preview.unavailableReason || "当前没有已保存的原文件，请查看资料处理状态。"}</p>{url ? <a href={url} target="_blank" rel="noreferrer">打开原文件</a> : null}</div>
        : preview.type === "IMAGE" ? <div ref={imageViewportRef} className="source-image-scroll">
          <div className="source-image-canvas" style={{ width: Math.max(imageWidth, viewport.width), height: Math.max(imageHeight, viewport.height) }}>
            <img src={url} alt={header.title} draggable={false} style={natural.width ? { width: imageWidth, height: imageHeight } : { maxWidth: "100%", maxHeight: "100%" }}
              onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailed(true)} />
          </div>
        </div>
        : preview.type === "VIDEO" ? <video ref={(element) => { mediaRef.current = element; }} src={url} poster={preview.coverUrl || undefined} controls preload="metadata" playsInline
          onLoadedMetadata={() => onMediaReady?.(true)} onError={() => { setFailed(true); onMediaReady?.(false); }} />
        : preview.type === "DOCUMENT" && pdf ? <PdfPagePreview sourceId={header.id} assetId={model.workspace.assetId!} originalUrl={url} />
        : <div className="source-viewer-fallback"><FileText size={30} /><strong>{header.title}</strong><p>此格式暂不支持内嵌预览。</p><a href={url} target="_blank" rel="noreferrer">打开或下载原文件</a></div>}
    </div>
    <footer className="source-viewer-footer">
      <span>{preview.type === "IMAGE" ? "完整保留原图比例" : header.typeLabel + "原件"}</span>
      {preview.type === "IMAGE" && !unavailable ? <div className="source-zoom-controls">
        <button type="button" aria-label="缩小图片" disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .25))}><ZoomOut size={15} /></button>
        <span aria-label="图片缩放比例">{Math.round(scale * 100)}%</span>
        <button type="button" aria-label="放大图片" disabled={zoom >= 4} onClick={() => setZoom(Math.min(4, zoom + .25))}><ZoomIn size={15} /></button>
      </div> : null}
      {preview.type === "VIDEO" && !unavailable ? <label>倍速 <select aria-label="播放速度" defaultValue="1" onChange={(event) => { if (mediaRef.current) mediaRef.current.playbackRate = Number(event.target.value); }}>{[.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label> : null}
      {notice ? <span role="status">{notice}</span> : null}
    </footer>
  </section>;
}

function PdfPagePreview({ sourceId, assetId, originalUrl }: { sourceId: string; assetId: string; originalUrl: string }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = "";
    setLoading(true); setError(""); setImage("");
    void fetch(`/api/source-items/${sourceId}/assets/${assetId}/preview?page=${page}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("PDF 预览未能加载，请重试或下载原件查看。"); const blob = await response.blob(); if (controller.signal.aborted) return; setTotal(Number(response.headers.get("x-pdf-pages"))); objectUrl = URL.createObjectURL(blob); setImage(objectUrl); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "预览失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [sourceId, assetId, page]);
  return <div className="source-pdf-preview">
    <nav aria-label="PDF 翻页"><button type="button" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>第 {page} 页{total ? ` / 共 ${total} 页` : ""}</span><button type="button" disabled={loading || !total || page >= total} onClick={() => setPage(p => p + 1)}>下一页</button><a href={originalUrl} target="_blank" rel="noreferrer">打开原文件</a></nav>
    <div className="source-pdf-pages">{loading ? <p role="status">正在加载 PDF 第 {page} 页…</p> : error ? <p role="alert">{error}</p> : image ? <img src={image} alt={`PDF 第 ${page} 页`} /> : null}</div>
  </div>;
}
