"use client";

import Link from "next/link";
import { useState } from "react";
import type { researchBenchmarkDetail, researchBenchmarkList } from "@/server/research/benchmarks";
import { collectionStatusLabel, platformLabel } from "./research-labels";

type Accounts = Awaited<ReturnType<typeof researchBenchmarkList>>["items"];
type Works = Awaited<ReturnType<typeof researchBenchmarkDetail>>["works"];
const date = (value: string | Date | null) => value ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }) : "未知";
const count = (value: number | null) => value === null ? "—" : value.toLocaleString("zh-CN");

export function BenchmarkAccountTable({ items }: { items: Accounts }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<"cards" | "table">("cards");
  return <form action="/research" method="get">
    <input type="hidden" name="entry" value="BENCHMARK" />
    <div className="research-view-toggle" role="group" aria-label="账号展示方式"><button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>卡片</button><button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>数据表</button></div>
    {view === "cards" ? <div className="research-account-cards">{items.map(item => <article key={item.id} className={selected.includes(item.id) ? "is-selected" : ""}><header><Link href={`/research/benchmarks/${item.id}`}><span className="research-account-avatar">{item.name.slice(0,1)}</span><span><h2>{item.name}</h2><small>{platformLabel[item.platform] || "其他平台"} · {item.researchCategory || "未分类"}</small></span></Link><input type="checkbox" name="accounts" value={item.id} aria-label={`选择 ${item.name} 研究`} checked={selected.includes(item.id)} disabled={selected.length >= 3 && !selected.includes(item.id)} onChange={event => setSelected(values => event.target.checked ? [...values,item.id] : values.filter(id => id !== item.id))}/></header><div className="research-card-metrics"><div><strong>{count(item._count.contentSnapshots)}</strong><span>已发现作品</span></div><div><strong>{count(item.materialCount)}</strong><span>已收录资料</span></div></div><footer><span>{item.collectionRuns[0] ? collectionStatusLabel[item.collectionRuns[0].status] || "待确认" : "尚未采集"}</span><small>{item.lastSyncedAt ? date(item.lastSyncedAt) : "尚未更新"}</small><Link href={`/research/benchmarks/${item.id}`}>查看账号 →</Link></footer></article>)}</div> : <>
    <div className="research-table-scroll"><table aria-label="对标账号库"><thead><tr><th><span className="sr-only">选择账号</span></th><th>账号</th><th>分类</th><th className="is-number">已发现作品</th><th className="is-number">已收录资料</th><th>最近采集</th><th>最近更新</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.id} className={selected.includes(item.id) ? "research-row-selected" : undefined}>
        <td><input type="checkbox" name="accounts" value={item.id} checked={selected.includes(item.id)} disabled={selected.length >= 3 && !selected.includes(item.id)} onChange={event => setSelected(values => event.target.checked ? [...values, item.id] : values.filter(id => id !== item.id))} aria-label={`选择 ${item.name} 研究`} /></td>
        <td><Link className="research-table-identity" href={`/research/benchmarks/${item.id}`}><span className="research-account-avatar" aria-hidden>{item.name.slice(0, 1)}</span><span><strong className="research-cell-title">{item.name}</strong><small>{platformLabel[item.platform] || "其他平台"}</small></span></Link></td>
        <td className="is-muted">{item.researchCategory || "未分类"}</td><td className="is-number">{count(item._count.contentSnapshots)}</td><td className="is-number">{count(item.materialCount)}</td>
        <td><span className={`research-status ${item.collectionRuns[0]?.status === "COMPLETED" ? "is-complete" : ""}`}>{item.collectionRuns[0] ? collectionStatusLabel[item.collectionRuns[0].status] || "待确认" : "尚未采集"}</span></td><td className="is-muted">{item.lastSyncedAt ? date(item.lastSyncedAt) : "尚未更新"}</td>
      </tr>)}</tbody></table></div>
    </>}
    {selected.length ? <div className="research-selection-bar" role="status"><span>已选 {selected.length} / 3 个账号</span><button type="button" onClick={() => setSelected([])}>取消选择</button><button type="submit" className="research-primary">{selected.length > 1 ? "比较选中账号" : "研究选中账号"} →</button></div> : <p className="research-caption" style={{ marginTop: 12 }}>选择账号即可开始研究；选择 2–3 个账号，可在同一次研究中比较。</p>}
  </form>;
}

type SortKey = "publishedAt" | "likes" | "comments" | "favorites" | "shares";
export function BenchmarkWorksTable({ works }: { works: Works }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("publishedAt");
  const [descending, setDescending] = useState(true);
  const value = (work: Works[number], key: SortKey) => key === "publishedAt" ? (work.publishedAt ? new Date(work.publishedAt).getTime() : null) : work.counts[key];
  const rows = works.filter(work => work.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => {
    const av = value(a, sort); const bv = value(b, sort);
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    return (av - bv) * (descending ? -1 : 1);
  });
  const column = (key: SortKey, label: string) => <th className={key === "publishedAt" ? undefined : "is-number"} aria-sort={sort === key ? descending ? "descending" : "ascending" : "none"}><button type="button" onClick={() => { if (sort === key) setDescending(!descending); else { setSort(key); setDescending(true); } }}>{label}{sort === key ? descending ? " ↓" : " ↑" : " ↕"}</button></th>;
  return <><div className="research-row-control"><input type="search" aria-label="筛选当前页作品" value={query} onChange={event => setQuery(event.target.value)} placeholder="在当前页查找作品…" /><small>当前页 {rows.length} / {works.length} 条</small></div>
    <div className="research-table-scroll"><table aria-label="账号作品"><thead><tr>{column("publishedAt", "发布时间")}<th>作品 / 时长</th><th>资料</th>{column("likes", "点赞")}{column("comments", "评论")}{column("favorites", "收藏")}{column("shares", "分享")}</tr></thead><tbody>{rows.map(work => <tr key={work.id}><td className="is-muted">{date(work.publishedAt)}</td><td>{/^https:\/\//i.test(work.url) ? <a className="research-cell-title" href={work.url} target="_blank" rel="noopener noreferrer">{work.title} ↗</a> : <span className="research-cell-title">{work.title}</span>}<small className="research-cell-subtitle">{work.durationMs === null ? "时长未知" : `${Math.round(work.durationMs / 1000)} 秒`} · 观察于 {date(work.latestObservedAt || work.observedAt)}</small></td><td>{work.sourceItemId ? <Link className="research-material-link" href={`/library/${work.sourceItemId}`}>打开资料 ↗</Link> : <small>未收录</small>}</td>{(["likes", "comments", "favorites", "shares"] as const).map(metric => <td className="is-number" key={metric}>{count(work.counts[metric])}</td>)}</tr>)}</tbody></table></div>
    {!rows.length ? <p className="research-center-empty-inline">当前页没有匹配作品。调整关键词，或清空搜索后查看。</p> : null}
    <p className="research-caption" style={{ marginTop: 12 }}>排序与搜索仅作用于当前页。— 表示来源未提供；已收录不代表已完成转录，正文状态可在资料中查看。</p>
  </>;
}
