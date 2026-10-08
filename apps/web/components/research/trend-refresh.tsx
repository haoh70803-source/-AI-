"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TrendRefresh({ canWrite, platform, type, initialKeyword = "" }: { canWrite: boolean; platform: string; type: string; initialKeyword?: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [keyword, setKeyword] = useState(initialKeyword);
  const selectedType = ["HOT", "SURGING", "DARK_HORSE"].includes(type) ? type : "HOT";
  const unsupported = selectedType === "SURGING" && ["XIAOHONGSHU", "GLOBAL"].includes(platform) || selectedType === "DARK_HORSE" && ["DOUYIN", "GLOBAL"].includes(platform);
  async function refresh() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/discovery/trends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ window: "TODAY", platform: ["DOUYIN", "XIAOHONGSHU", "GLOBAL"].includes(platform) ? platform : "ALL", type: selectedType, ...(selectedType === "DARK_HORSE" ? { keyword: keyword.trim() } : {}), force: false }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "趋势更新失败，历史数据仍可查看。");
      setMessage(body.cached ? "已使用近期采集数据。" : "已保存最新榜单快照。"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "趋势更新失败，历史数据仍可查看。"); }
    finally { setBusy(false); }
  }
  return <div className="research-collection-action">{selectedType === "DARK_HORSE" ? <label>黑马关注主题<input value={keyword} onChange={event => setKeyword(event.target.value)} maxLength={200} placeholder="输入明确主题" disabled={!canWrite || busy} /></label> : null}<button type="button" disabled={!canWrite || busy || unsupported || selectedType === "DARK_HORSE" && !keyword.trim()} onClick={() => void refresh()}>{busy ? "正在更新…" : selectedType === "HOT" ? "更新今日热门榜" : selectedType === "SURGING" ? "更新今日上升榜" : "更新今日黑马榜"}</button>{message ? <p role="status">{message}</p> : null}<small>{unsupported ? "所选榜单类型不支持当前平台，请调整筛选。" : "点击后才请求 RedFox；当前按“今日”范围更新。"}</small></div>;
}
