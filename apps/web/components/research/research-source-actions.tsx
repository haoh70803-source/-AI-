"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function ResearchSourceActions({ id, read, followed, kind = "MATERIAL" }: { id: string; read: boolean; followed: boolean; kind?: "MATERIAL" | "WORK" }) {
  const router = useRouter(), lock = useRef(false), controller = useRef<AbortController | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { setReady(true); lock.current = false; setBusy(false); setError(""); return () => controller.current?.abort(); }, [id]);
  async function act(action: "VIEW" | "UNREAD" | "FOLLOW" | "UNFOLLOW") {
    if (lock.current) return;
    const aborter = new AbortController(); controller.current = aborter; lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/research/preferences", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, key: id, action }), signal: aborter.signal });
      const body = await response.json();
      if (!response.ok) throw Error(body.message || "状态未保存，请重试。");
      if (!aborter.signal.aborted) router.refresh();
    } catch (cause) { if (!aborter.signal.aborted) setError(cause instanceof Error ? cause.message : "状态未保存。"); }
    finally { if (!aborter.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  return <div className="research-source-actions" data-ready={ready} inert={!ready}>
    <button type="button" className="research-button" disabled={busy} onClick={() => void act(read ? "UNREAD" : "VIEW")}>{read ? "标为未读" : "标记已读"}</button>
    <button type="button" className="research-button" disabled={busy} aria-pressed={followed} onClick={() => void act(followed ? "UNFOLLOW" : "FOLLOW")}>{followed ? "已收藏 · 取消" : kind === "WORK" ? "收藏作品" : "收藏来源"}</button>
    {error ? <p role="alert" className="research-error">{error}</p> : null}
  </div>;
}
