"use client";

import { Badge, Button, Card } from "@content-center/ui";
import type { ExternalAccount, ExternalContent } from "@content-center/providers";
import { ArrowRight, BookOpenCheck, BookmarkPlus, ExternalLink, FileText, Lightbulb, Loader2, PanelRightOpen, PenLine, Plus, Search, Sparkles, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TodayRecommendations, type RecommendationBatchView } from "./today-recommendations";

type PublicContent = Omit<ExternalContent, "rawProviderMetadata"> & { sourceItemId?: string | null };
type PublicAccount = Omit<ExternalAccount, "rawProviderMetadata">;
type IdeaSummary = { id: string; title: string; status: string; projectId?: string | null; updatedAt: string; referenceCount: number; sourceCount: number };
type BenchmarkSummary = { id: string; name: string; platform: string; avatarUrl: string | null; bio: string | null; lastSyncedAt: string | null; latestContent: { title: string; observedAt: string } | null };
type RecentSource = { id: string; title: string | null; author: string | null; thumbnailUrl: string | null; sourcePlatform: string; sourceType: string; status: string; createdAt: string };
type ActionNotice = { message: string; href: string; actionLabel: string };
type ResearchKind = "IDEA" | "BENCHMARK" | "SOURCE";
type ResearchItem = { id: string; kind: ResearchKind; title: string; summary: string; status: string; date: string | null; href: string; action: string };

function externalContentPayload(item: PublicContent) {
  const payload = { ...item };
  delete payload.sourceItemId;
  return payload;
}

const platformLabel: Record<string, string> = { DOUYIN: "抖音", XIAOHONGSHU: "小红书" };
function shortDate(value: string | null) { return value ? new Date(value).toLocaleDateString("zh-CN") : null; }
function visibleResearchStatus(status: string) { return ["进行中", "待继续", "失败"].includes(status) ? status : null; }

async function jsonRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "操作未完成，请稍后重试。"), { code: body.error, status: response.status, body });
  return body;
}

function Metric({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return <span>{label} {value.toLocaleString("zh-CN")}</span>;
}

function ContentCard({ item, canWrite, onPreview, onCollect, onIdea, onCreate, busyAction }: {
  item: PublicContent;
  canWrite: boolean;
  onPreview: () => void;
  onCollect: () => void;
  onIdea: () => void;
  onCreate: () => void;
  busyAction: string | null;
}) {
  const key = `${item.platform}:${item.externalId}`;
  const busy = busyAction?.startsWith(key);
  return (
    <Card data-testid={`content-card-${item.platform}-${item.externalId}`} className="discovery-result-card overflow-hidden">
      <div className="discovery-result-media aspect-[16/9] bg-[var(--surface-elevated)]">
        {item.coverUrl ? <img src={item.coverUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-sm text-[var(--text-secondary)]">{platformLabel[item.platform]}{item.contentType === "VIDEO" ? "视频" : "内容"}</div>}
      </div>
      <div className="discovery-result-body p-4">
        <div className="flex flex-wrap gap-2"><Badge>{platformLabel[item.platform]}</Badge><Badge>{item.contentType === "VIDEO" ? "视频" : item.contentType === "IMAGE" ? "图文" : "内容"}</Badge>{item.sourceItemId ? <Badge className="text-[var(--success)]">✓ 已收录</Badge> : null}</div>
        <h3 className="mt-3 line-clamp-2 min-h-12 font-semibold leading-6">{item.title || item.description || "未命名内容"}</h3>
        <p className="mt-2 truncate text-xs text-[var(--text-secondary)]">{item.authorName || "未知作者"}{item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString("zh-CN")}` : ""}</p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
          <Metric label="赞" value={item.metrics.likes} /><Metric label="评论" value={item.metrics.comments} /><Metric label="收藏" value={item.metrics.favorites} /><Metric label="分享" value={item.metrics.shares} /><Metric label="播放" value={item.metrics.views} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          <Button disabled={!canWrite || busy} onClick={onIdea}><Sparkles size={14} /> 加入选题</Button>
          {item.sourceItemId ? <Button variant="secondary" asChild><Link href={`/library/${item.sourceItemId}`}>查看资料</Link></Button> : <Button variant="secondary" disabled={!canWrite || busy} onClick={onCollect}>{busyAction === `${key}:collect` ? <Loader2 size={14} className="animate-spin" /> : <BookmarkPlus size={14} />} 收录资料</Button>}
          <Button variant="ghost" onClick={onPreview}>预览</Button>
          <Button variant="ghost" disabled={!canWrite || busy} onClick={onCreate}>{busyAction === `${key}:project` ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} 开始创作</Button>
        </div>
      </div>
    </Card>
  );
}

function Modal({ title, onClose, children, width = "max-w-2xl" }: { title: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"><section role="dialog" aria-modal="true" className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border bg-[var(--surface)] p-5 shadow-2xl ${width}`}><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">{title}</h2><button aria-label="关闭" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--surface-elevated)]"><X size={18} /></button></div>{children}</section></div>;
}

function NextActionNotice({ notice, onClose }: { notice: ActionNotice; onClose: () => void }) {
  return <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-[var(--surface)] p-4 shadow-2xl"><p className="min-w-0 flex-1 text-sm">{notice.message}</p><Link href={notice.href} className="shrink-0 text-sm font-medium text-[var(--accent)]">{notice.actionLabel}</Link><button onClick={onClose} aria-label="关闭通知" className="shrink-0 rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]"><X size={16} /></button></div>;
}

export function DiscoveryWorkspace({ configured, canWrite, canManageBenchmarks, initialBenchmarks, initialIdeas, recentSources, initialRecommendationBatch }: {
  configured: boolean;
  canWrite: boolean;
  canManageBenchmarks: boolean;
  initialBenchmarks: BenchmarkSummary[];
  initialIdeas: IdeaSummary[];
  recentSources: RecentSource[];
  initialRecommendationBatch: RecommendationBatchView | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<"ALL" | "DOUYIN" | "XIAOHONGSHU">("ALL");
  const [sort, setSort] = useState<"RECOMMENDED" | "LATEST" | "POPULAR">("RECOMMENDED");
  const [results, setResults] = useState<PublicContent[] | null>(null);
  const [accountResults, setAccountResults] = useState<PublicAccount[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublicContent | null>(null);
  const [ideaTarget, setIdeaTarget] = useState<PublicContent | null>(null);
  const [quickCollect, setQuickCollect] = useState(false);
  const [benchmarkDialog, setBenchmarkDialog] = useState(false);
  const [ideas, setIdeas] = useState(initialIdeas);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [researchFilter, setResearchFilter] = useState<"ALL" | ResearchKind>("ALL");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const hasResults = results !== null || accountResults !== null;
  const recentResearch = useMemo<ResearchItem[]>(() => [
    ...ideas.map((item) => ({ id: item.id, kind: "IDEA" as const, title: item.title, summary: `${item.referenceCount} 条参考 · ${item.sourceCount} 条已收录资料`, status: item.status === "DONE" ? "已完成" : item.status === "IN_PROGRESS" ? "进行中" : item.status === "READY" ? "已整理" : "待继续", date: item.updatedAt, href: item.projectId ? `/dashboard?project=${item.projectId}` : `/discovery/ideas/${item.id}`, action: item.projectId ? "用于创作" : "继续研究" })),
    ...initialBenchmarks.map((item) => ({ id: item.id, kind: "BENCHMARK" as const, title: item.name, summary: item.bio || item.latestContent?.title || "查看已保存的代表内容与研究结果。", status: item.lastSyncedAt ? "已整理" : "待继续", date: item.lastSyncedAt || item.latestContent?.observedAt || null, href: `/discovery/benchmarks/${item.id}`, action: "查看研究" })),
    ...recentSources.map((item) => ({ id: item.id, kind: "SOURCE" as const, title: item.title || `${platformLabel[item.sourcePlatform] || "平台"}内容`, summary: `${platformLabel[item.sourcePlatform] || "外部参考"} · ${item.sourceType === "VIDEO" ? "视频" : item.sourceType === "IMAGE" ? "图文" : "资料"}${item.author ? ` · ${item.author}` : ""}`, status: item.status === "READY" ? "已整理" : item.status === "FAILED" ? "失败" : "进行中", date: item.createdAt, href: `/library/${item.id}`, action: "进入研究" })),
  ].sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime()), [ideas, initialBenchmarks, recentSources]);
  const filteredResearch = recentResearch.filter((item) => researchFilter === "ALL" || item.kind === researchFilter).slice(0, 8);

  useEffect(() => {
    if (window.localStorage.getItem("research-assistant-open") === "false") setAssistantOpen(false);
  }, []);

  function toggleAssistant(open: boolean) {
    setAssistantOpen(open);
    window.localStorage.setItem("research-assistant-open", String(open));
  }

  function focusResearch() {
    searchRef.current?.focus();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    searchRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
  }

  async function searchContent(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim() || !configured || !canWrite) return;
    setSearching(true); setError("");
    try {
      const body = await jsonRequest("/api/discovery/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, platform, sort, kind: "AUTO" }) });
      if (body.resultType === "ACCOUNT") {
        setAccountResults(body.items);
        setResults(null);
      } else {
        setResults(body.items);
        setAccountResults(null);
      }
    } catch (reason) {
      setResults([]); setAccountResults(null); setError(reason instanceof Error ? reason.message : "搜索失败。");
    } finally { setSearching(false); }
  }

  async function collect(item: PublicContent) {
    const key = `${item.platform}:${item.externalId}`; setBusyAction(`${key}:collect`); setError("");
    try {
      const body = await jsonRequest("/api/discovery/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: externalContentPayload(item) }) });
      setResults((current) => current?.map((candidate) => candidate.externalId === item.externalId && candidate.platform === item.platform ? { ...candidate, sourceItemId: body.sourceItemId } : candidate) ?? current);
      setNotice({ message: body.created ? "资料已收录，正在后台处理。" : "该资料已在资料库中。", href: `/library/${body.sourceItemId}`, actionLabel: "查看资料" });
      return body.sourceItemId as string;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "收录失败。"); return null; }
    finally { setBusyAction(null); }
  }

  async function createProject(item: PublicContent) {
    const key = `${item.platform}:${item.externalId}`; setBusyAction(`${key}:project`); setError("");
    try {
      const body = await jsonRequest("/api/discovery/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: externalContentPayload(item) }) });
      router.push(`/dashboard?project=${body.projectId}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "开始创作失败。"); setBusyAction(null); }
  }

  async function addMainBenchmark(account: PublicAccount) {
    const key = `${account.platform}:${account.externalId}`;
    setBusyAction(`${key}:benchmark`); setError("");
    try {
      await jsonRequest("/api/discovery/benchmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account }) });
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "添加对标失败。"); }
    finally { setBusyAction(null); }
  }

  const resultTitle = useMemo(() => query.trim() ? `“${query.trim()}”的相关内容` : "搜索结果", [query]);

  return <div className={`research-workbench-shell ${assistantOpen ? "" : "assistant-closed"}`}>
    <div className="research-main">
      {!hasResults && !searching ? <>
        <header className="research-hero"><h1>研究</h1><p>围绕话题、博主、案例与资料，快速收集并整理可用于创作的判断。</p></header>
        <section className="research-launch" aria-labelledby="discovery-launch-title">
          <div><h2 id="discovery-launch-title">你想研究什么？</h2><p>可以输入选题、博主、案例或链接</p></div>
          <form id="discovery-search" onSubmit={searchContent}><label><Search size={19} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} disabled={!configured || !canWrite} aria-label="搜索内容" placeholder="你想研究什么？可以输入选题、博主、案例或链接" /><button type="submit" aria-label="开始搜索" disabled={searching || !query.trim() || !configured || !canWrite}>{searching ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}</button></label></form>
          <div className="research-launch-actions"><button type="button" disabled={!configured || !canWrite} onClick={focusResearch}><Lightbulb size={16} />研究话题</button><button type="button" disabled={!configured || !canManageBenchmarks} onClick={() => setBenchmarkDialog(true)}><UserRound size={16} />研究博主</button><button type="button" disabled={!configured || !canWrite} onClick={() => setQuickCollect(true)}><FileText size={16} />导入资料</button><Link href="/library/methods"><BookOpenCheck size={16} />创作方法参考</Link></div>
          <details className="research-search-options"><summary>搜索范围</summary><div className="discovery-filter-row"><div><span>平台</span>{(["ALL", "DOUYIN", "XIAOHONGSHU"] as const).map((value) => <button key={value} aria-pressed={platform === value} onClick={() => setPlatform(value)}>{value === "ALL" ? "全部" : platformLabel[value]}</button>)}</div><div><span>排序</span>{(["RECOMMENDED", "LATEST", "POPULAR"] as const).map((value) => <button key={value} aria-pressed={sort === value} onClick={() => setSort(value)}>{value === "RECOMMENDED" ? "推荐" : value === "LATEST" ? "最新" : "热门"}</button>)}</div></div></details>
          {!configured ? <div className="discovery-service-note"><p>内容搜索暂时不可用，仍可查看已有研究、资料和方法。</p>{canManageBenchmarks ? <Link href="/settings/integrations">前往设置 <ArrowRight size={15} /></Link> : null}</div> : !canWrite ? <p className="discovery-service-note">当前为只读权限，可查看已有研究记录。</p> : null}
        </section>

        <section className="research-quick" aria-labelledby="research-quick-title"><header><h2 id="research-quick-title">快速研究入口</h2></header><div><Link href="/discovery/trends"><span><Lightbulb size={20} /></span><strong>热点选题拆解</strong><p>从真实趋势记录中查看值得继续研究的内容方向。</p><ArrowRight size={16} /></Link><button type="button" disabled={!configured || !canManageBenchmarks} onClick={() => setBenchmarkDialog(true)}><span><UserRound size={20} /></span><strong>对标账号分析</strong><p>搜索并保存优质账号，继续查看代表内容与研究结果。</p><ArrowRight size={16} /></button><Link href="/library?view=RESEARCH"><span><FileText size={20} /></span><strong>案例结构提炼</strong><p>从已有资料中选择一条，进入单资料研究。</p><ArrowRight size={16} /></Link><Link href="/library?view=CREATION"><span><PenLine size={20} /></span><strong>资料整理为创作依据</strong><p>查看已经整理好、可以进入创作的资料。</p><ArrowRight size={16} /></Link></div></section>

        <section id="recent-research" className="research-recent" aria-labelledby="research-recent-title"><header><h2 id="research-recent-title">最近研究</h2><nav aria-label="最近研究类型">{([ ["ALL", "全部"], ["IDEA", "话题研究"], ["BENCHMARK", "博主研究"], ["SOURCE", "内容研究"] ] as const).map(([value, label]) => <button key={value} aria-pressed={researchFilter === value} onClick={() => setResearchFilter(value)}>{label}</button>)}</nav></header>{filteredResearch.length ? <div className="research-recent-grid">{filteredResearch.map((item) => { const Icon = item.kind === "IDEA" ? Lightbulb : item.kind === "BENCHMARK" ? UserRound : FileText; const status = visibleResearchStatus(item.status); return <Link key={`${item.kind}:${item.id}`} href={item.href} className={`research-recent-card is-${item.kind.toLowerCase()}`}><header><span><Icon size={17} /></span><em>{item.kind === "IDEA" ? "话题" : item.kind === "BENCHMARK" ? "博主" : "内容"}</em>{status ? <b>{status}</b> : null}</header><h3>{item.title}</h3><p>{item.summary}</p><footer><time>{shortDate(item.date)}</time><span>{item.action}<ArrowRight size={14} /></span></footer></Link>; })}</div> : <div className="research-empty"><span><Search size={22} /></span><h3>{recentResearch.length ? "暂时没有最近研究" : "还没有研究记录"}</h3><p>{recentResearch.length ? "可以切换到其他类型查看。" : "从一个话题、博主、视频或资料开始。"}</p></div>}</section>

        <details className="research-more"><summary>更多研究线索</summary><TodayRecommendations initialBatch={initialRecommendationBatch} canWrite={canWrite} /></details>
      </> : null}

      {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {searching ? <section className="discovery-search-results"><div className="h-6 w-52 animate-pulse rounded bg-[var(--surface-elevated)]" /><div className="discovery-result-grid">{[1,2,3].map((value) => <div key={value} className="h-80 animate-pulse rounded-2xl border bg-[var(--surface)]" />)}</div></section> : null}
      {!searching && results !== null ? <section className="discovery-search-results"><div className="discovery-section-heading"><h2>{resultTitle}</h2><button onClick={() => { setResults(null); setAccountResults(null); }}>返回研究首页</button></div>{results.length ? <div className="discovery-result-grid">{results.map((item) => <ContentCard key={`${item.platform}:${item.externalId}`} item={item} canWrite={canWrite} busyAction={busyAction} onPreview={() => setPreview(item)} onCollect={() => void collect(item)} onIdea={() => setIdeaTarget(item)} onCreate={() => void createProject(item)} />)}</div> : <Card className="mt-4 grid min-h-48 place-items-center p-8 text-center"><div><h3 className="font-semibold">没有找到相关研究</h3><p className="mt-2 text-sm text-[var(--text-secondary)]">换一个关键词或平台后再试。</p><button className="mt-4 text-sm font-medium text-[var(--accent)]" onClick={() => { setResults(null); setAccountResults(null); setQuery(""); }}>清除搜索</button></div></Card>}</section> : null}
      {!searching && accountResults !== null ? <section className="discovery-search-results"><div className="discovery-section-heading"><h2>识别到的账号</h2><button onClick={() => { setResults(null); setAccountResults(null); }}>返回研究首页</button></div>{accountResults.length ? <div className="discovery-account-result-grid">{accountResults.map((account) => { const key = `${account.platform}:${account.externalId}`; return <Card key={key} className="p-5"><div className="flex items-center gap-4">{account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--surface-elevated)] font-semibold">{account.name.slice(0, 1)}</div>}<div className="min-w-0 flex-1"><Badge>{platformLabel[account.platform]}</Badge><h3 className="mt-2 truncate font-semibold">{account.name}</h3>{account.bio ? <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{account.bio}</p> : null}</div>{canManageBenchmarks ? <Button variant="secondary" disabled={Boolean(busyAction)} onClick={() => void addMainBenchmark(account)}>{busyAction === `${key}:benchmark` ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}加入我的对标</Button> : null}</div></Card>; })}</div> : <Card className="mt-4 p-8 text-center text-sm text-[var(--text-secondary)]">没有找到相关研究。</Card>}</section> : null}
    </div>

    <aside className="research-assistant" aria-hidden={!assistantOpen} inert={!assistantOpen}><header><div><span><Sparkles size={18} /></span><strong>鑫小助</strong><i>在线</i><button type="button" aria-label="收起鑫小助" onClick={() => toggleAssistant(false)}><X size={17} /></button></div><p>你的研究搭档，帮你找资料、理思路、提方法</p></header><div className="research-assistant-actions"><button type="button" disabled={!configured || !canWrite} onClick={focusResearch}><Search size={18} /><span><strong>研究一个话题</strong><small>搜索内容或博主</small></span><ArrowRight size={15} /></button><button type="button" disabled={!recentResearch.some((item) => item.kind === "BENCHMARK")} onClick={() => { setResearchFilter("BENCHMARK"); document.getElementById("recent-research")?.scrollIntoView({ behavior: "smooth" }); }}><UserRound size={18} /><span><strong>查看对标账号</strong><small>回到已有博主研究</small></span><ArrowRight size={15} /></button><Link href="/library?view=RESEARCH"><FileText size={18} /><span><strong>从资料继续研究</strong><small>看懂资料并提炼重点</small></span><ArrowRight size={15} /></Link><Link href="/library/methods"><BookOpenCheck size={18} /><span><strong>查看已保存的创作方法</strong><small>复用已有研究成果</small></span><ArrowRight size={15} /></Link></div><div className="research-assistant-preview"><p>自由对话将在后续接入</p><small>当前可以使用上方与研究相关的真实入口。</small></div></aside>
    {!assistantOpen ? <button type="button" className="research-assistant-open" onClick={() => toggleAssistant(true)}><PanelRightOpen size={18} />鑫小助</button> : null}

    {preview ? <Modal title="内容预览" onClose={() => setPreview(null)}>{preview.coverUrl ? <img src={preview.coverUrl} alt="" className="mt-5 max-h-80 w-full rounded-xl object-cover" /> : null}<div className="mt-5 flex gap-2"><Badge>{platformLabel[preview.platform]}</Badge><Badge>{preview.contentType === "VIDEO" ? "视频" : "图文"}</Badge></div><h3 className="mt-3 text-xl font-semibold">{preview.title || "未命名内容"}</h3><p className="mt-2 text-sm text-[var(--text-secondary)]">{preview.authorName || "未知作者"}</p>{preview.description ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{preview.description}</p> : <p className="mt-4 text-sm text-[var(--text-secondary)]">该内容暂无可用摘要。</p>}<a href={preview.originalUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--accent)]">查看原始内容 <ExternalLink size={14} /></a><div className="mt-5 flex flex-wrap gap-2 border-t pt-4">{preview.sourceItemId ? <Button asChild><Link href={`/library/${preview.sourceItemId}`}>查看资料</Link></Button> : <Button disabled={!canWrite} onClick={() => void collect(preview).then((sourceId) => { if (sourceId) setPreview(null); })}>收录资料</Button>}<Button variant="secondary" disabled={!canWrite} onClick={() => { setIdeaTarget(preview); setPreview(null); }}>加入选题</Button><Button variant="secondary" disabled={!canWrite} onClick={() => void createProject(preview)}>开始创作</Button></div></Modal> : null}
    {ideaTarget ? <IdeaDialog content={ideaTarget} ideas={ideas} onClose={() => setIdeaTarget(null)} onSaved={(idea, created) => { if (created) setIdeas((current) => [idea, ...current]); setIdeaTarget(null); setNotice({ message: `已加入选题「${idea.title}」。`, href: `/discovery/ideas/${idea.id}`, actionLabel: "查看选题" }); }} /> : null}
    {quickCollect ? <QuickCollectDialog onClose={() => setQuickCollect(false)} onDone={(sourceId) => { setQuickCollect(false); router.push(`/library/${sourceId}`); }} /> : null}
    {benchmarkDialog ? <BenchmarkDialog onClose={() => setBenchmarkDialog(false)} onDone={() => { setBenchmarkDialog(false); router.refresh(); }} /> : null}
    {notice ? <NextActionNotice notice={notice} onClose={() => setNotice(null)} /> : null}
  </div>;
}

function QuickCollectDialog({ onClose, onDone }: { onClose: () => void; onDone: (sourceId: string) => void }) {
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const body = await jsonRequest("/api/source-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "REDFOX", url }) }); onDone(body.sourceItemId); } catch (reason) { const value = reason as Error & { code?: string; body?: { sourceItemId?: string } }; if (value.code === "DUPLICATE_SOURCE" && value.body?.sourceItemId) { onDone(value.body.sourceItemId); return; } setError(value.code === "INVALID_REDFOX_URL" ? "当前暂不支持该平台的自动收录。" : value.message); } finally { setBusy(false); } }
  return <Modal title="快速收录" onClose={onClose}><form onSubmit={submit} className="mt-5 grid gap-4"><label className="grid gap-2 text-sm">粘贴内容链接<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." className="h-11 rounded-xl border bg-transparent px-3" /><span className="text-xs text-[var(--text-secondary)]">当前支持抖音和小红书作品链接。</span></label>{error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy}>{busy ? "收录中…" : "收录资料"}</Button></div></form></Modal>;
}

function IdeaDialog({ content, ideas, onClose, onSaved }: { content: PublicContent; ideas: IdeaSummary[]; onClose: () => void; onSaved: (idea: IdeaSummary, created: boolean) => void }) {
  const [mode, setMode] = useState<"NEW" | "EXISTING">("NEW"); const [title, setTitle] = useState(content.title || ""); const [ideaId, setIdeaId] = useState(ideas[0]?.id || ""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { if (mode === "NEW") { const body = await jsonRequest("/api/discovery/ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, reference: externalContentPayload(content) }) }); onSaved({ id: body.idea.id, title: body.idea.title, status: body.idea.status, updatedAt: body.idea.updatedAt, referenceCount: 1, sourceCount: content.sourceItemId ? 1 : 0 }, true); } else { await jsonRequest(`/api/discovery/ideas/${ideaId}/references`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference: externalContentPayload(content) }) }); const selected = ideas.find((idea) => idea.id === ideaId); if (selected) onSaved(selected, false); else onClose(); } } catch (reason) { setError(reason instanceof Error ? reason.message : "加入选题失败。"); } finally { setBusy(false); } }
  return <Modal title="加入选题" onClose={onClose}><div className="mt-5 flex rounded-xl bg-[var(--surface-elevated)] p-1"><button onClick={() => setMode("NEW")} className={`flex-1 rounded-lg px-3 py-2 text-sm ${mode === "NEW" ? "bg-[var(--surface)] font-medium shadow-sm" : "text-[var(--text-secondary)]"}`}>新建选题</button><button disabled={!ideas.length} onClick={() => setMode("EXISTING")} className={`flex-1 rounded-lg px-3 py-2 text-sm disabled:opacity-40 ${mode === "EXISTING" ? "bg-[var(--surface)] font-medium shadow-sm" : "text-[var(--text-secondary)]"}`}>加入已有选题</button></div><form onSubmit={submit} className="mt-5 grid gap-4">{mode === "NEW" ? <label className="grid gap-2 text-sm">选题标题<input required maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} className="h-11 rounded-xl border bg-transparent px-3" /></label> : <label className="grid gap-2 text-sm">选择选题<select value={ideaId} onChange={(event) => setIdeaId(event.target.value)} className="h-11 rounded-xl border bg-[var(--surface)] px-3">{ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}</select></label>}<p className="text-xs leading-5 text-[var(--text-secondary)]">加入选题只保存参考信息，不会下载视频或启动转写。</p>{error ? <p role="alert" className="text-sm text-[var(--danger)]">{error}</p> : null}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy || (mode === "EXISTING" && !ideaId)}>{busy ? "保存中…" : "确认"}</Button></div></form></Modal>;
}

function BenchmarkDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState(""); const [platform, setPlatform] = useState<"ALL" | "DOUYIN" | "XIAOHONGSHU">("ALL"); const [items, setItems] = useState<PublicAccount[]>([]); const [busy, setBusy] = useState(false); const [adding, setAdding] = useState(""); const [error, setError] = useState("");
  async function search(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const body = await jsonRequest("/api/discovery/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, platform, sort: "RECOMMENDED", kind: "ACCOUNT" }) }); setItems(body.items); } catch (reason) { setError(reason instanceof Error ? reason.message : "账号搜索失败。"); } finally { setBusy(false); } }
  async function add(account: PublicAccount) { setAdding(`${account.platform}:${account.externalId}`); setError(""); try { await jsonRequest("/api/discovery/benchmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account }) }); onDone(); } catch (reason) { setError(reason instanceof Error ? reason.message : "添加失败。"); setAdding(""); } }
  return <Modal title="添加对标账号" onClose={onClose}><form onSubmit={search} className="mt-5 grid gap-3"><div className="flex gap-2"><input required value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入账号名称或主页链接" className="h-11 min-w-0 flex-1 rounded-xl border bg-transparent px-3" /><Button disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} 搜索</Button></div><div className="flex gap-2">{(["ALL", "DOUYIN", "XIAOHONGSHU"] as const).map((value) => <button type="button" key={value} onClick={() => setPlatform(value)} className={`rounded-full px-3 py-1.5 text-sm ${platform === value ? "bg-[var(--text-primary)] text-white" : "bg-[var(--surface-elevated)]"}`}>{value === "ALL" ? "全部" : platformLabel[value]}</button>)}</div></form>{error ? <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p> : null}<div className="mt-5 grid gap-3">{items.map((item) => <div key={`${item.platform}:${item.externalId}`} className="flex items-center gap-3 rounded-xl border p-3">{item.avatarUrl ? <img src={item.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="h-11 w-11 rounded-full bg-[var(--surface-elevated)]" />}<div className="min-w-0 flex-1"><p className="truncate font-medium">{item.name}</p><p className="text-xs text-[var(--text-secondary)]">{platformLabel[item.platform]}{item.followers !== null ? ` · ${item.followers.toLocaleString("zh-CN")} 粉丝` : ""}</p></div><Button variant="secondary" disabled={Boolean(adding)} onClick={() => void add(item)}>{adding === `${item.platform}:${item.externalId}` ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} 添加</Button></div>)}{!busy && query && items.length === 0 ? <p className="py-8 text-center text-sm text-[var(--text-secondary)]">没有找到匹配账号。</p> : null}</div></Modal>;
}
