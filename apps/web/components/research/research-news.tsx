"use client";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@content-center/ui";
import { Bookmark, Clock3, ExternalLink, RefreshCw, Search, X, Pause, Play, SlidersHorizontal } from "lucide-react";
import { DEFAULT_CATEGORIES, NEWS_CATEGORIES, safePublicLink, singaporeDay, type DailyReport } from "@/server/research/news/contracts";
import type { newsReadModel } from "@/server/research/news/service";
type Model = Awaited<ReturnType<typeof newsReadModel>>;
type Detail = { title: string; summary?: string | null; source: { name: string }; links: { aihot: string | null; original: string | null }; id?: string; publishedAt?: string | null; originalTitle?: string | null };
const time = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Singapore", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "尚未同步";
function NewsText({ children }: { children: string }) {
  return <div className="research-news-markdown"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} urlTransform={value => safePublicLink(value) || ""} components={{
    a: ({ href, children }) => safePublicLink(href) ? <a href={safePublicLink(href)!} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
    img: ({ alt }) => <span>{alt || "图片说明"}</span>,
  }}>{children}</ReactMarkdown></div>;
}
export function ResearchNews({ initial }: { initial: Model }) {
  const [model, setModel] = useState(initial), [mode, setMode] = useState<"news" | "daily">("news");
  const [range, setRange] = useState("today"), [category, setCategory] = useState("default"), [source, setSource] = useState(""), [query, setQuery] = useState(""), [view, setView] = useState("all");
  const [edition, setEdition] = useState(initial.dailies[0]?.date || ""), [report, setReport] = useState<DailyReport | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState(""), [sort, setSort] = useState("newest"), [urlReady, setUrlReady] = useState(false), [filtersOpen, setFiltersOpen] = useState(false);
  const filterDialog = useRef<HTMLDialogElement>(null), filterButton = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const scrollReturn = useRef<{ windowY: number; ancestors: { element: HTMLElement; top: number }[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLElement | null>(null), pending = useRef(false), live = useRef(true);
  useEffect(() => {
    const read = () => {
      const params = new URL(window.location.href).searchParams;
      const q = (params.get("q") || "").slice(0, 200); setQuery(q); setDraft(q);
      const c = params.get("category") || "default"; setCategory(c === "all" || c === "default" || c in NEWS_CATEGORIES ? c : "default");
      setSource((params.get("source") || "").slice(0, 500));
      const r = params.get("range") || "today"; setRange(["today", "24h", "7d", "unknown", "history"].includes(r) || /^\d{4}-\d{2}-\d{2}$/.test(r) ? r : "today");
      const v = params.get("view") || "all"; setView(["all", "unread", "favorites", "later"].includes(v) ? v : "all");
      setSort(params.get("sort") === "oldest" ? "oldest" : "newest");
      setMode(params.get("mode") === "daily" ? "daily" : "news");
      const e = params.get("edition"); if (e && initial.dailies.some(item => item.date === e)) setEdition(e);
      setUrlReady(true);
    };
    read(); window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [initial.dailies]);
  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    const values = { q: query, category: category === "default" ? "" : category, source, range: range === "today" ? "" : range, view: view === "all" ? "" : view, sort: sort === "newest" ? "" : sort, mode: mode === "news" ? "" : mode, edition: mode === "daily" ? edition : "" };
    for (const [key, value] of Object.entries(values)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
    window.history.replaceState(window.history.state, "", url);
  }, [urlReady, query, category, source, range, view, sort, mode, edition]);
  useEffect(() => {
    if (!filtersOpen || !filterDialog.current) return;
    filterDialog.current.showModal();
    const before = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [filtersOpen]);
  useEffect(() => {
    live.current = true; const controller = new AbortController();
    const refresh = () => { setNow(Date.now()); void fetch("/api/research/news", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw Error("无法读取资讯状态，请检查登录或稍后重试。");
      const value = await response.json() as Model; if (live.current) { setModel(value); setError(""); }
    }).catch(cause => { if (live.current && !controller.signal.aborted) setError(cause.message); }); };
    const timer = setInterval(refresh, 60000);
    return () => { live.current = false; controller.abort(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!detail || !dialog.current) return;
    dialog.current.showModal();
    const before = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [detail]);
  const pref = (id: string, kind = "NEWS") => model.preferences.find(item => item.id === id && item.kind === kind);
  const act = async (body: object) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const response = await fetch("/api/research/news", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json(); if (!response.ok) throw Error(value.error?.message || "操作暂未完成。");
      if (live.current) { if (value.report) setReport(value.report); else setModel(value); }
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : "操作暂未完成。"); }
    finally { pending.current = false; if (live.current) setBusy(false); }
  };
  const preference = async (id: string, kind: "NEWS" | "NEWS_LATER", action: string) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const response = await fetch("/api/research/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, key: id, action }) });
      const value = await response.json(); if (!response.ok) throw Error(value.error?.message || "阅读状态未保存，请重试。");
      if (live.current) setModel(current => ({ ...current, preferences: [...current.preferences.filter(row => row.id !== id || row.kind !== kind), { kind, id, followed: value.followed, read: !!value.viewedAt }] }));
    } catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : "阅读状态未保存。"); }
    finally { pending.current = false; if (live.current) setBusy(false); }
  };
  const open = (item: Detail, element: HTMLElement) => {
    opener.current = element;
    const ancestors: { element: HTMLElement; top: number }[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.scrollHeight > parent.clientHeight) ancestors.push({ element: parent, top: parent.scrollTop });
    scrollReturn.current = { windowY: window.scrollY, ancestors };
    setDetail(item); if (item.id && !pref(item.id)?.read) void preference(item.id, "NEWS", "VIEW"); };
  const close = () => {
    dialog.current?.close(); setDetail(null);
    requestAnimationFrame(() => {
      const saved = scrollReturn.current;
      saved?.ancestors.forEach(({ element, top }) => { element.scrollTop = top; });
      if (saved) window.scrollTo({ top: saved.windowY, behavior: "instant" });
      (opener.current?.isConnected ? opener.current : list.current)?.focus({ preventScroll: true });
    });
  };
  const closeFilters = () => { filterDialog.current?.close(); setFiltersOpen(false); requestAnimationFrame(() => filterButton.current?.focus({ preventScroll: true })); };
  const today = singaporeDay(now);
  const sources = useMemo(() => [...new Set(model.items.map(item => item.source.name))].sort((a, b) => a.localeCompare(b)), [model.items]);
  const dates = useMemo(() => [...new Set(model.items.filter(item => item.publishedAt).map(item => singaporeDay(item.publishedAt!)))].sort().reverse(), [model.items]);
  const items = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return model.items.filter(item => {
      if (category === "default" ? !DEFAULT_CATEGORIES.includes(item.category) : category !== "all" && item.category !== category) return false;
      if (source && item.source.name !== source) return false;
      if (view === "favorites" && !model.preferences.some(row => row.id === item.id && row.kind === "NEWS" && row.followed)) return false;
      if (view === "later" && !model.preferences.some(row => row.id === item.id && row.kind === "NEWS_LATER" && row.followed)) return false;
      if (view === "unread" && model.preferences.some(row => row.id === item.id && row.kind === "NEWS" && row.read)) return false;
      const publication = item.publishedAt ? Date.parse(item.publishedAt) : null;
      if (range === "unknown" ? publication !== null : range === "24h" ? publication === null || publication < now - 86400000 : range === "7d" ? publication !== null && publication < now - 7 * 86400000 : range !== "history" && (publication === null || singaporeDay(publication) !== (range === "today" ? today : range))) return false;
      return !search || [item.title, item.originalTitle, item.summary, item.source.name].filter(Boolean).join(" ").toLocaleLowerCase().includes(search);
    }).sort((a, b) => {
      if (!a.publishedAt) return b.publishedAt ? 1 : b.discoveredAt.localeCompare(a.discoveredAt);
      if (!b.publishedAt) return -1;
      return sort === "oldest" ? a.publishedAt.localeCompare(b.publishedAt) : b.publishedAt.localeCompare(a.publishedAt);
    });
  }, [model, category, source, view, range, query, now, today, sort]);
  const groups = useMemo(() => {
    const grouped = new Map<string, typeof items>();
    for (const item of items) {
      const date = item.publishedAt ? singaporeDay(item.publishedAt) : "日期待确认";
      const group = grouped.get(date) || []; group.push(item); grouped.set(date, group);
    }
    return [...grouped.entries()];
  }, [items]);
  const activeReport = model.reports[edition] || (report?.date === edition ? report : null);
  const clear = () => { setDraft(""); setSort("newest"); setQuery(""); setSource(""); setCategory("default"); setView("all"); setRange("7d"); };
  const editions = useMemo(() => [...model.dailies].sort((a, b) => b.date.localeCompare(a.date)), [model.dailies]);
  const editionPosition = editions.findIndex(item => item.date === edition);
  const months = [...new Set(editions.map(item => item.date.slice(0, 7)))];
  const dailySections = activeReport ? [...activeReport.sections, { label: "快讯", items: activeReport.flashes }].filter(section => section.items.length > 0) : [];
  const chooseEdition = (date: string) => { if (window.location.hash.startsWith("#daily-")) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); setEdition(date); setReport(null); if (!model.reports[date] && !model.status.paused && model.status.enabled) void act({ action: "DAILY", date }); };
  const monthControls = () => months.map(month => <details key={month}><summary>{month} · {editions.filter(item => item.date.startsWith(month)).length} 期</summary><div className="research-news-history-dates">{editions.filter(item => item.date.startsWith(month)).map(item => <button key={item.date} aria-current={edition === item.date ? "date" : undefined} onClick={() => chooseEdition(item.date)}>{item.date}</button>)}</div></details>);
  const categoryControls = () => <>
    <select aria-label="资讯类别" value={category} onChange={event => setCategory(event.target.value)}><option value="default">模型 · 产品 · 行业</option><option value="all">全部精选类别</option>{Object.entries(NEWS_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    <select aria-label="资讯来源" value={source} onChange={event => setSource(event.target.value)}><option value="">所有来源</option>{sources.map(name => <option key={name}>{name}</option>)}</select>
    <select aria-label="资讯排序" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">最新在前</option><option value="oldest">最早在前</option></select>
  </>;
  const links = (item: Detail) => <div className="research-news-links">{safePublicLink(item.links.original) ? <a href={safePublicLink(item.links.original)!} target="_blank" rel="noopener noreferrer">原始来源 <ExternalLink size={13} /></a> : null}{safePublicLink(item.links.aihot) ? <a href={safePublicLink(item.links.aihot)!} target="_blank" rel="noopener noreferrer">AIHOT 收录 <ExternalLink size={13} /></a> : null}</div>;
  return <article className="research-news-page" data-testid="research-news">
    <header className="research-page-heading"><div><span className="research-eyebrow">研究 / 资讯</span><h1>读资讯，找到下一步</h1><p>模型、产品与行业的新进展。阅读公开摘要，保留自己的收藏与稍后读。</p></div><Link href="/research/new" className="research-button research-primary">开始研究</Link></header>
    <div className="research-news-topline"><nav className="research-news-tabs" aria-label="资讯阅读模式"><button aria-current={mode === "news" ? "page" : undefined} onClick={() => setMode("news")}>精选资讯</button><button aria-current={mode === "daily" ? "page" : undefined} onClick={() => setMode("daily")}>每日早报</button></nav><div className="research-news-sync"><span className={"research-status" + (model.status.error ? " is-warning" : model.status.lastSuccess ? " is-complete" : "")}>{model.status.paused ? "同步已暂停" : !model.status.enabled ? "同步尚未启用" : model.status.error ? "同步待重试" : "每小时同步"} · {time(model.status.lastSuccess)}</span><Button variant="ghost" disabled={busy || !model.status.enabled} onClick={() => void act({ action: "SYNC" })} aria-label="检查资讯更新"><RefreshCw size={15} /></Button><Button variant="ghost" disabled={busy || !model.status.enabled} onClick={() => void act({ action: "PAUSE", paused: !model.status.paused })}>{model.status.paused ? <Play size={14} /> : <Pause size={14} />}{model.status.paused ? "继续" : "暂停"}</Button></div></div>
    {error ? <p className="research-error" role="alert">{error}</p> : null}
    {model.status.error ? <p className="research-news-warning" role="status">更新暂未完成，正在显示上次成功同步的内容。下次检查：{time(new Date(model.status.nextAttempt).toISOString())}。{model.status.error === "RATE_LIMITED" ? "上游限流，请等待冷却结束。" : ""}</p> : null}
    {mode === "news" ? <>
      <div className="research-news-filters"><form className="research-news-search-form" role="search" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); }}><label className="research-news-search"><Search size={16} /><Input type="search" aria-label="搜索资讯或来源公司关键词" placeholder="搜索资讯或来源公司关键词" maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} /></label><Button type="submit" variant="secondary">搜索</Button></form><div className="research-news-desktop-filters">{categoryControls()}</div><Button className="research-news-filter-toggle" variant="secondary" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={event => { filterButton.current = event.currentTarget; setFiltersOpen(true); }}><SlidersHorizontal size={15} />筛选</Button></div>
      <div className="research-news-chips" aria-label="当前筛选条件">
        {query ? <Button variant="ghost" onClick={() => { setQuery(""); setDraft(""); }} aria-label="清除关键词">{query} <X size={13} /></Button> : null}
        {category !== "default" ? <Button variant="ghost" onClick={() => setCategory("default")} aria-label="清除类别">{category === "all" ? "全部类别" : NEWS_CATEGORIES[category as keyof typeof NEWS_CATEGORIES]} <X size={13} /></Button> : null}
        {source ? <Button variant="ghost" onClick={() => setSource("")} aria-label="清除来源">{source} <X size={13} /></Button> : null}
      </div>
      <dialog className="research-news-dialog research-news-filter-dialog" ref={filterDialog} aria-labelledby="research-news-filter-title" onCancel={event => { event.preventDefault(); closeFilters(); }} onClick={event => { if (event.target === event.currentTarget) closeFilters(); }}>
        {filtersOpen ? <div><header><h2 id="research-news-filter-title">筛选资讯</h2><Button variant="ghost" onClick={closeFilters} aria-label="关闭筛选"><X size={20} /></Button></header><div className="research-news-drawer-controls">{categoryControls()}</div><Button variant="secondary" onClick={closeFilters}>查看结果</Button></div> : null}
      </dialog>
      <div className="research-news-filterline"><nav className="research-news-tabs" aria-label="资讯日期">{[["today", "今天"], ["24h", "近 24 小时"], ["7d", "近 7 天"], ["unknown", "日期待确认"]].map(([key, label]) => <button key={key} aria-current={range === key ? "page" : undefined} onClick={() => setRange(key!)}>{label}</button>)}</nav><select aria-label="历史资讯日期" value={["today", "24h", "7d", "unknown"].includes(range) ? "" : range} onChange={event => event.target.value && setRange(event.target.value)}><option value="">按日期阅读</option><option value="history">全部本机留存</option>{dates.map(date => <option key={date}>{date}</option>)}</select><select aria-label="个人阅读状态" value={view} onChange={event => setView(event.target.value)}><option value="all">全部资讯</option><option value="unread">未读</option><option value="favorites">我的收藏</option><option value="later">稍后读</option></select></div>
      <div className="research-news-count"><p>{items.length} 条 · 更新：{time(model.status.lastSuccess)} · 日期按新加坡时间 UTC+8</p><button onClick={clear}>清除筛选</button></div>
      <div className="research-news-list" ref={list} tabIndex={-1} aria-label="资讯结果">{groups.map(([date, grouped]) => <section className="research-news-date-group" key={date} aria-label={date}><h2>{date}</h2>{grouped.map(item => <section className="research-news-item" id={"news-" + encodeURIComponent(item.id)} key={item.id}><div className="research-news-time-track" aria-hidden="true">{item.publishedAt ? time(item.publishedAt).slice(-5) : "待确认"}</div><div className="research-news-item-body"><div className="research-news-meta"><span className="research-news-category">{NEWS_CATEGORIES[item.category as keyof typeof NEWS_CATEGORIES] || "未分类"}</span><span>{item.source.name}</span><time dateTime={item.publishedAt || undefined}>{item.publishedAt ? time(item.publishedAt) : "发布日期待确认"}</time>{pref(item.id)?.read ? <span>已读</span> : null}</div><button className="research-news-title" onClick={event => open(item, event.currentTarget)}>{item.title}</button><p className="research-news-summary">{item.summary || "此条暂未提供摘要，可打开原始来源阅读。"}</p><div className="research-news-item-footer">{links(item)}<div className="research-news-actions"><Button variant="ghost" aria-pressed={!!pref(item.id)?.followed} disabled={busy} onClick={() => void preference(item.id, "NEWS", pref(item.id)?.followed ? "UNFOLLOW" : "FOLLOW")}><Bookmark size={14} />{pref(item.id)?.followed ? "已收藏" : "收藏"}</Button><Button variant="ghost" aria-pressed={!!pref(item.id, "NEWS_LATER")?.followed} disabled={busy} onClick={() => void preference(item.id, "NEWS_LATER", pref(item.id, "NEWS_LATER")?.followed ? "UNFOLLOW" : "FOLLOW")}><Clock3 size={14} />{pref(item.id, "NEWS_LATER")?.followed ? "已稍后读" : "稍后读"}</Button></div></div></div></section>)}</section>)}</div>
      {!items.length ? <section className="research-center-empty"><h2>{!model.items.length ? "资讯正在准备中" : "没有符合筛选的资讯"}</h2><p>{!model.items.length ? "首次同步完成后会显示真实公开资讯。已有资料和研究仍可从导航打开。" : "可以放宽日期、来源或关键词；未确认发布日期的资讯单独列出。"}</p><Button variant="secondary" onClick={clear}>查看近 7 天</Button></section> : null}
      {model.removed.some(id => model.preferences.some(row => row.id === id && row.followed)) ? <p className="research-caption">部分已收藏资讯已由来源撤回，本文不再展示。你的个人阅读记录仍保留。</p> : null}
      <p className="research-news-footnote">AIHOT 公开精选与来源摘要；观点和事实以原始来源为准。近 7 天是阅读窗口，本机已经同步的历史另行保留；日期待确认的条目不计入今日资讯。</p>
    </> : <section className="research-news-daily"><div className="research-news-edition"><label>选择日刊 <select aria-label="官方日刊日期" value={edition} onChange={event => chooseEdition(event.target.value)}>{!editions.length ? <option value="">尚未同步日刊</option> : editions.map(item => <option key={item.date}>{item.date}</option>)}</select></label><div className="research-news-edition-navigation"><Button variant="secondary" disabled={busy || editionPosition < 0 || editionPosition >= editions.length - 1} onClick={() => chooseEdition(editions[editionPosition + 1]!.date)}>上一期</Button><Button variant="secondary" disabled={busy || editionPosition <= 0} onClick={() => chooseEdition(editions[editionPosition - 1]!.date)}>下一期</Button></div>{activeReport && safePublicLink(activeReport.links.aihot) ? <a href={safePublicLink(activeReport.links.aihot)!} target="_blank" rel="noopener noreferrer">官方日刊 <ExternalLink size={14} /></a> : null}</div>
      <div className="research-news-daily-layout"><aside className="research-news-history-aside" aria-label="日刊历史"><h3>历史日刊 · {editions.length} 期</h3>{monthControls()}</aside><div className="research-news-daily-body"><div className="research-news-recent-dates" aria-label="最近日刊">{editions.slice(0, 5).map(item => <button key={item.date} aria-current={edition === item.date ? "date" : undefined} onClick={() => chooseEdition(item.date)}>{item.date.slice(5)}</button>)}</div><details className="research-news-history"><summary>历史日刊 · {editions.length} 期</summary>{monthControls()}</details>
      {activeReport ? <><header><span className="research-eyebrow">{activeReport.date} · 每日早报</span><p className="research-caption">官方生成：{time(activeReport.generatedAt)}</p><h2>{activeReport.lead?.title || "今日精选"}</h2>{activeReport.lead?.leadParagraph ? <NewsText>{activeReport.lead.leadParagraph}</NewsText> : null}<p className="research-caption">{dailySections.reduce((total, section) => total + section.items.length, 0)} 条 · {dailySections.length} 个栏目</p><small>官方收录窗口：{time(activeReport.windowStart)} — {time(activeReport.windowEnd)}（UTC+8），与自然日筛选不同。</small></header>{dailySections.length ? <nav className="research-news-daily-toc" aria-label="日刊目录">{dailySections.map((section, index) => <a key={index} href={"#daily-" + activeReport.date + "-" + index}>{section.label} · {section.items.length}</a>)}</nav> : <p role="status">本期暂无条目，日期和官方统计窗口保留如上。</p>}{dailySections.map((section, index) => section.items.length ? <section key={index} id={"daily-" + activeReport.date + "-" + index} className="research-news-daily-section"><h3>{section.label}</h3>{section.items.map((item, number) => <section className="research-news-item" key={number}><div className="research-news-meta">{item.source.name}</div><button className="research-news-title" onClick={event => { const known = item.links.aihot ? model.items.find(news => news.links.aihot === item.links.aihot) : undefined; open(known ? { ...item, id: known.id, publishedAt: known.publishedAt } : { ...item, publishedAt: null }, event.currentTarget); }}>{item.title}</button>{item.summary ? <NewsText>{item.summary}</NewsText> : null}{links(item)}</section>)}</section> : null)}</> : <section className="research-center-empty" aria-busy={busy}><h2>{edition || "官方日刊"} · {busy ? "正在读取" : "该期尚未读取"}</h2><p>官方统计窗口待本期正文读取后显示；不会按日期推测。</p><p>只展示官方索引中的真实期次，不用旧资料或自然日资讯拼造早报。</p>{edition ? <Button disabled={busy || model.status.paused || !model.status.enabled} variant="secondary" onClick={() => void act({ action: "DAILY", date: edition })}>读取这一期</Button> : null}</section>}
    </div></div></section>}
    <dialog className="research-news-dialog" ref={dialog} aria-labelledby="research-news-detail-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      {detail ? <div><header><span>{detail.source.name}</span><Button variant="ghost" onClick={close} aria-label="关闭资讯详情"><X size={20} /></Button></header><h2 id="research-news-detail-title">{detail.title}</h2>{detail.originalTitle && detail.originalTitle !== detail.title ? <p className="research-news-original">{detail.originalTitle}</p> : null}<small>{detail.publishedAt ? "发布 " + time(detail.publishedAt) : "未提供可确认的独立发布日期"}</small><div className="research-news-detail-summary"><NewsText>{detail.summary || "此条未提供公开摘要，请打开原始来源。"}</NewsText></div>{links(detail)}{detail.id ? <div className="research-news-actions"><Button variant="secondary" disabled={busy} onClick={() => void preference(detail.id!, "NEWS", pref(detail.id!)?.followed ? "UNFOLLOW" : "FOLLOW")}>{pref(detail.id)?.followed ? "取消收藏" : "收藏这条资讯"}</Button><Button variant="secondary" disabled={busy} onClick={() => void preference(detail.id!, "NEWS_LATER", pref(detail.id!, "NEWS_LATER")?.followed ? "UNFOLLOW" : "FOLLOW")}>{pref(detail.id, "NEWS_LATER")?.followed ? "移出稍后读" : "稍后读"}</Button></div> : null}<p className="research-news-footnote">公开摘要由 AIHOT 提供。完整报道请读原始来源，工作台不复制原文全文。</p>{error ? <p role="alert" className="research-error">{error}</p> : null}</div> : null}
    </dialog>
  </article>;
}
