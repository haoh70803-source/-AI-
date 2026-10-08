"use client";

import { Button, Card } from "@content-center/ui";
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TrendCard, type TrendOpportunityView } from "./trend-card";

type WindowValue = "TODAY" | "SEVEN_DAYS";
type PlatformValue = "ALL" | "DOUYIN" | "XIAOHONGSHU" | "GLOBAL";
type TypeValue = "HOT" | "SURGING" | "DARK_HORSE";

const platformLabel: Record<PlatformValue, string> = { ALL: "全部", DOUYIN: "抖音", XIAOHONGSHU: "小红书", GLOBAL: "全网" };
const typeLabel: Record<TypeValue, string> = { SURGING: "正在上升", HOT: "热门", DARK_HORSE: "黑马" };

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "趋势操作未完成。"), { code: body.error });
  return body;
}

export function TrendWorkspace({ initialItems, configured, aiConfigured, mockMode, canWrite, supportedFilters }: {
  initialItems: TrendOpportunityView[];
  configured: boolean;
  aiConfigured: boolean;
  mockMode: boolean;
  canWrite: boolean;
  supportedFilters: Record<TypeValue, readonly PlatformValue[]>;
}) {
  const [items, setItems] = useState(initialItems);
  const [windowValue, setWindowValue] = useState<WindowValue>("TODAY");
  const [platform, setPlatform] = useState<PlatformValue>("ALL");
  const [type, setType] = useState<TypeValue>("HOT");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const availableTypes = (Object.keys(typeLabel) as TypeValue[]).filter((value) => supportedFilters[value].includes(platform));

  async function load(next: { window?: WindowValue; platform?: PlatformValue; type?: TypeValue }) {
    const values = { window: next.window ?? windowValue, platform: next.platform ?? platform, type: next.type ?? type };
    setBusy("load"); setError("");
    try {
      const body = await request(`/api/discovery/trends?window=${values.window}&platform=${values.platform}&type=${values.type}`);
      setItems(body.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "趋势读取失败。"); }
    finally { setBusy(""); }
  }

  async function refresh() {
    setBusy("refresh"); setError("");
    try {
      const body = await request("/api/discovery/trends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ window: windowValue, platform, type, keyword: type === "DARK_HORSE" ? keyword : undefined, force: items.length > 0 }) });
      setItems(body.items);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "趋势刷新失败。"); }
    finally { setBusy(""); }
  }

  async function addIdea(item: TrendOpportunityView) {
    setBusy(`idea:${item.deterministicKey}`); setError("");
    try {
      await request(`/api/discovery/trends/${encodeURIComponent(item.deterministicKey)}/ideas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "MANUAL", title: item.title }) });
      setItems((current) => current.map((value) => value.deterministicKey === item.deterministicKey ? { ...value, ideaCount: value.ideaCount + 1 } : value));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "加入选题失败。"); }
    finally { setBusy(""); }
  }

  function choosePlatform(next: PlatformValue) {
    const nextType = supportedFilters[type].includes(next) ? type : "HOT";
    setPlatform(next); setType(nextType); void load({ platform: next, type: nextType });
  }

  return <>
    <Link href="/discovery" className="mb-5 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><ArrowLeft size={16} /> 返回研究</Link>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h1 className="text-3xl font-semibold tracking-tight">趋势机会</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">看看最近哪些内容正在升温</p></div><Button disabled={!configured || !canWrite || busy !== "" || (type === "DARK_HORSE" && !keyword.trim())} onClick={() => void refresh()}>{busy === "refresh" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {items.length ? "刷新" : "加载趋势"}</Button></header>
    {mockMode ? <p className="mt-4 rounded-xl border bg-[var(--surface-elevated)] p-3 text-sm">MOCK MODE：当前环境会明确返回模拟 AI 结果。</p> : null}
    <Card className="mt-6 p-5">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-sm text-[var(--text-secondary)]">时间</span>{(["TODAY", "SEVEN_DAYS"] as const).map((value) => <button key={value} onClick={() => { setWindowValue(value); void load({ window: value }); }} className={`rounded-full px-3 py-1.5 text-sm ${windowValue === value ? "bg-[var(--text-primary)] text-white" : "bg-[var(--surface-elevated)]"}`}>{value === "TODAY" ? "今天" : "近 7 天"}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-sm text-[var(--text-secondary)]">平台</span>{(["ALL", "DOUYIN", "XIAOHONGSHU", "GLOBAL"] as const).map((value) => <button key={value} onClick={() => choosePlatform(value)} className={`rounded-full px-3 py-1.5 text-sm ${platform === value ? "bg-[var(--text-primary)] text-white" : "bg-[var(--surface-elevated)]"}`}>{platformLabel[value]}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-sm text-[var(--text-secondary)]">类型</span>{availableTypes.map((value) => <button key={value} onClick={() => { setType(value); void load({ type: value }); }} className={`rounded-full px-3 py-1.5 text-sm ${type === value ? "bg-[var(--text-primary)] text-white" : "bg-[var(--surface-elevated)]"}`}>{typeLabel[value]}</button>)}</div>
        {type === "DARK_HORSE" ? <label className="grid max-w-md gap-2 text-sm"><span>关注主题</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} maxLength={200} placeholder="例如：AI 办公" className="h-11 rounded-xl border bg-transparent px-3" /><span className="text-xs text-[var(--text-secondary)]">黑马榜接口需要明确主题；系统不会替你猜测或伪造关键词。</span></label> : null}
      </div>
    </Card>
    {!configured ? <Card className="mt-5 p-5"><p className="font-medium">趋势数据服务尚未配置</p><p className="mt-2 text-sm text-[var(--text-secondary)]">已有趋势记录仍可查看；管理员配置内容数据服务后才能主动加载新趋势。</p></Card> : !canWrite ? <Card className="mt-5 p-5 text-sm text-[var(--text-secondary)]">当前为只读权限，可以查看已有趋势记录，但不能触发付费刷新或生成选题。</Card> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[var(--danger)]">{error}</p> : null}
    {busy === "load" ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1,2,3].map((value) => <div key={value} className="h-56 animate-pulse rounded-2xl border bg-[var(--surface)]" />)}</div> : items.length ? <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <TrendCard key={item.deterministicKey} item={item} actions={<><Button variant="secondary" asChild><Link href={`/discovery/trends/${encodeURIComponent(item.deterministicKey)}`}>查看依据</Link></Button>{canWrite && aiConfigured ? <Button variant="secondary" asChild><Link href={`/discovery/trends/${encodeURIComponent(item.deterministicKey)}?generate=1`}><Sparkles size={14} /> 生成选题</Link></Button> : <Button variant="secondary" disabled><Sparkles size={14} /> 生成选题</Button>}<Button disabled={!canWrite || busy !== ""} onClick={() => void addIdea(item)}>{busy === `idea:${item.deterministicKey}` ? <Loader2 size={14} className="animate-spin" /> : null} 加入选题</Button></>} />)}</div> : <Card className="mt-6 p-10 text-center"><h2 className="font-semibold">当前没有趋势记录</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">{configured && canWrite ? "点击“加载趋势”后才会请求真实数据，不会在切换筛选时自动付费。" : "等待有权限的成员加载真实趋势数据。"}</p></Card>}
    {!aiConfigured ? <p className="mt-4 text-sm text-[var(--text-secondary)]">AI 创作服务尚未配置；趋势查看、相关内容和手工加入选题仍可使用。</p> : null}
    <div className="mt-6 flex justify-end"><Link href="/discovery" className="inline-flex items-center gap-1 text-sm text-[var(--accent)]">返回研究 <ArrowRight size={14} /></Link></div>
  </>;
}
