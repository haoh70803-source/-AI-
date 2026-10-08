"use client";

import { Download } from "lucide-react";
import { useState } from "react";

export function SourceAssetDownloadButton({ sourceId, assetId, label = "下载原视频" }: { sourceId: string; assetId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/source-items/${sourceId}/assets/${assetId}/access?disposition=attachment`);
      const data = await response.json().catch(() => ({})) as { url?: string; message?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.message || data.error || "下载链接生成失败。");
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "下载失败。");
    } finally {
      setBusy(false);
    }
  }

  return <span className="inline-flex items-center gap-2"><button type="button" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-[var(--surface-elevated)] disabled:cursor-not-allowed disabled:opacity-60" disabled={busy} onClick={download}><Download size={15} />{busy ? "准备下载…" : label}</button>{error ? <span role="alert" className="text-xs text-[var(--danger)]">{error}</span> : null}</span>;
}
