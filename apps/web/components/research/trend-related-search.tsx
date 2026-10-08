"use client";
import Link from "next/link";
import { useState } from "react";
import { platformLabel } from "./research-labels";

type Related = { id: string; title: string; authorName: string | null; platform: string; publishedAt: string | null; originalUrl: string | null; sourceItemId: string | null };
export function TrendRelatedSearch({ stableKey, canWrite }: { stableKey: string; canWrite: boolean }) {
  const [items, setItems] = useState<Related[] | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [captured, setCaptured] = useState("");
  async function search() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/research/trends/${stableKey}/related`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "相关作品暂时无法获取。");
      setItems(body.items); setCaptured(body.capturedAt);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "相关作品暂时无法获取。"); }
    finally { setBusy(false); }
  }
  return <div><button type="button" disabled={!canWrite || busy} onClick={() => void search()}>{busy ? "正在查询…" : items ? "重新查询相关作品" : "主动查询相关作品"}</button><p className="research-caption">点击后才调用内容数据服务。搜索结果只是候选相关作品，不代表趋势样本或因果依据；不会自动收录。</p>
    {error ? <p className="research-error" role="alert">{error}</p> : null}
    {items ? <>{captured ? <p className="research-caption">本次查询时间 {new Date(captured).toLocaleString("zh-CN")} · 以下作者仅来自本次返回作品。</p> : null}{items.length ? <ul className="research-results-list">{items.map(item => <li key={`${item.platform}:${item.id}`}><small>{platformLabel[item.platform] || "其他平台"} · 作者 {item.authorName || "未提供"} · 发布 {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString("zh-CN") : "未知"}</small><h3>{item.title}</h3><p>{item.sourceItemId ? <Link href={`/library/${item.sourceItemId}`}>打开已收录资料 →</Link> : item.originalUrl ? <a href={item.originalUrl} target="_blank" rel="noopener noreferrer">查看原作品 →</a> : "暂无可用链接"}</p></li>)}</ul> : <p className="research-center-empty-inline">当前查询没有返回相关作品或作者。</p>}</> : <div className="research-center-empty"><h3>暂无已关联作品与作者记录</h3><p>榜单快照只有趋势与指标，没有自动包含代表作品或作者。</p></div>}
  </div>;
}
