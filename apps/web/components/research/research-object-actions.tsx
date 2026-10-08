"use client";
import { useEffect, useState } from "react";

export function ResearchObjectActions({ kind, objectKey, followed = false, showFollow = false }: { kind: "TREND" | "BENCHMARK"; objectKey: string; followed?: boolean; showFollow?: boolean }) {
  const [isFollowed, setFollowed] = useState(followed); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/research/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, key: objectKey, action: "VIEW" }), signal: controller.signal }).catch(() => undefined);
    return () => controller.abort();
  }, [kind, objectKey]);
  async function toggle() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/research/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, key: objectKey, action: isFollowed ? "UNFOLLOW" : "FOLLOW" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "关注状态没有保存。");
      setFollowed(body.followed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "关注状态没有保存。"); }
    finally { setBusy(false); }
  }
  return showFollow ? <div className="research-object-actions"><button type="button" disabled={busy} aria-pressed={isFollowed} onClick={() => void toggle()}>{busy ? "正在保存…" : isFollowed ? "已关注 · 取消关注" : "关注趋势"}</button>{error ? <p role="alert" className="research-error">{error}</p> : null}</div> : null;
}
