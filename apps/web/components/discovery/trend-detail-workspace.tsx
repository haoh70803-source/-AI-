"use client";

import type { ExternalContent } from "@content-center/providers";
import { Badge, Button, Card } from "@content-center/ui";
import { ArrowLeft, ArrowRight, BookmarkPlus, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TrendOpportunityView } from "./trend-card";

type Opportunity = TrendOpportunityView & {
  previousRank: number | null;
  windowStart: string;
  windowEnd: string;
  rankHistory: Array<{ rank: number; observedAt: string }>;
  supportingSnapshotIds: string[];
};
type PublicContent = Omit<ExternalContent, "rawProviderMetadata"> & { sourceItemId?: string | null };
type Candidate = { title: string; angle: string; targetAudience: string; coreConflict: string; whyNow: string; differenceFromSources: string; supportingReferences: string[]; riskNotes: string[]; recommendedFormat: string | null; selectedIndex: number };
type IdeaSummary = { id: string; title: string; status: string };

const platformLabel: Record<string, string> = { DOUYIN: "抖音", XIAOHONGSHU: "小红书", GLOBAL: "全网", CROSS_PLATFORM: "多平台" };
const stateLabel: Record<string, string> = { FIRST_SEEN: "新出现", RISING: "正在上升", PERSISTING: "持续热门", DARK_HORSE: "黑马" };

function contentPayload(item: PublicContent) { const value = { ...item }; delete value.sourceItemId; return value; }
async function request(url: string, init: RequestInit) { const response = await fetch(url, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw Object.assign(new Error(body.message || "操作未完成。"), { code: body.error }); return body; }

export function TrendDetailWorkspace({ initialOpportunity, initialIdeas, canWrite, aiConfigured, mockMode }: { initialOpportunity: Opportunity; initialIdeas: IdeaSummary[]; canWrite: boolean; aiConfigured: boolean; mockMode: boolean }) {
  const router = useRouter();
  const [related, setRelated] = useState<PublicContent[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [runId, setRunId] = useState("");
  const [ideas] = useState(initialIdeas);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function loadRelated() {
    setBusy("related"); setError("");
    try {
      const body = await request(`/api/discovery/trends/${encodeURIComponent(initialOpportunity.deterministicKey)}/related`, { method: "POST" });
      setRelated(body.items);
      setSelected(body.items.slice(0, 5).map((item: PublicContent) => `${item.platform}:${item.externalId}`));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "相关内容读取失败。"); }
    finally { setBusy(""); }
  }

  async function generate() {
    setBusy("generate"); setError("");
    try {
      const supportingContents = (related ?? []).filter((item) => selected.includes(`${item.platform}:${item.externalId}`)).slice(0, 5).map(contentPayload);
      const body = await request(`/api/discovery/trends/${encodeURIComponent(initialOpportunity.deterministicKey)}/topics`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supportingContents }) });
      setRunId(body.runId); setCandidates(body.candidates);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "选题建议生成失败。"); }
    finally { setBusy(""); }
  }

  async function saveCandidate(candidate: Candidate) {
    setBusy(`candidate:${candidate.selectedIndex}`); setError("");
    try {
      const body = await request(`/api/discovery/trends/${encodeURIComponent(initialOpportunity.deterministicKey)}/ideas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "CANDIDATE", runId, selectedIndex: candidate.selectedIndex }) });
      router.push(`/discovery/ideas/${body.ideaId}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存选题失败。"); setBusy(""); }
  }

  async function saveManual() {
    setBusy("manual"); setError("");
    try {
      const body = await request(`/api/discovery/trends/${encodeURIComponent(initialOpportunity.deterministicKey)}/ideas`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "MANUAL", title: initialOpportunity.title }) });
      router.push(`/discovery/ideas/${body.ideaId}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存选题失败。"); setBusy(""); }
  }

  function toggle(item: PublicContent) {
    const key = `${item.platform}:${item.externalId}`;
    setSelected((current) => current.includes(key) ? current.filter((value) => value !== key) : current.length < 5 ? [...current, key] : current);
  }

  return <>
    <Link href="/discovery/trends" className="mb-5 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><ArrowLeft size={16} /> 返回趋势机会</Link>
    <Card className="p-5 sm:p-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div className="max-w-3xl"><div className="flex flex-wrap gap-2"><Badge>{stateLabel[initialOpportunity.state]}</Badge><Badge>{platformLabel[initialOpportunity.platform]}</Badge></div><h1 className="mt-4 text-3xl font-semibold tracking-tight">{initialOpportunity.title}</h1><p className="mt-3 text-sm text-[var(--text-secondary)]">为什么值得关注：来自真实榜单位置、历次榜单记录和已加载的关联内容，不包含爆款预测。</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!canWrite || busy !== ""} onClick={() => void saveManual()}>{busy === "manual" ? <Loader2 size={15} className="animate-spin" /> : <BookmarkPlus size={15} />} 加入选题</Button><Button disabled={!canWrite || !aiConfigured || busy !== ""} onClick={() => void generate()}>{busy === "generate" ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} 生成选题</Button></div></div>
      <div className="mt-6 grid gap-3 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-[var(--text-secondary)]">当前状态</p><p className="mt-1 font-medium">{stateLabel[initialOpportunity.state]}</p></div><div><p className="text-xs text-[var(--text-secondary)]">当前排名</p><p className="mt-1 font-medium">{initialOpportunity.rank === null ? "暂无可靠排名" : `#${initialOpportunity.rank}`}</p></div><div><p className="text-xs text-[var(--text-secondary)]">排名变化</p><p className="mt-1 font-medium">{initialOpportunity.rankDelta !== null && initialOpportunity.rankDelta > 0 ? `上升 ${initialOpportunity.rankDelta} 位` : initialOpportunity.previousRank === null ? "首次记录，暂无变化参考" : "未观察到上升"}</p></div><div><p className="text-xs text-[var(--text-secondary)]">关联选题</p><p className="mt-1 font-medium">{ideas.length} 个</p></div></div>
    </Card>
    {mockMode ? <p className="mt-4 rounded-xl border bg-[var(--surface-elevated)] p-3 text-sm">MOCK MODE：AI 候选选题会明确标记为模拟结果。</p> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[var(--danger)]">{error}</p> : null}
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <section><h2 className="text-lg font-semibold">真实依据</h2><Card className="mt-3 p-5"><div className="grid gap-3 text-sm"><p>{platformLabel[initialOpportunity.platform]} · {stateLabel[initialOpportunity.state]}</p>{initialOpportunity.rank !== null ? <p>当前榜单排名 #{initialOpportunity.rank}</p> : null}{initialOpportunity.previousRank !== null ? <p>前次记录排名 #{initialOpportunity.previousRank}</p> : <p className="text-[var(--text-secondary)]">这是当前时间窗内的首次观察，不显示假上涨。</p>}{initialOpportunity.supportingPlatforms.length > 1 ? <p>多个平台都出现了相同的明确关键词。</p> : null}{initialOpportunity.metrics.likes !== null ? <p>可用点赞数据 {initialOpportunity.metrics.likes.toLocaleString("zh-CN")}</p> : null}</div>{initialOpportunity.rankHistory.length ? <div className="mt-4 border-t pt-4"><p className="text-xs font-medium">排名记录</p><div className="mt-2 flex flex-wrap gap-2">{initialOpportunity.rankHistory.map((item) => <span key={`${item.observedAt}:${item.rank}`} className="rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-xs">#{item.rank} · {new Date(item.observedAt).toLocaleString("zh-CN")}</span>)}</div></div> : null}</Card>{ideas.length ? <div className="mt-5"><h3 className="text-sm font-semibold">已有选题</h3><div className="mt-2 grid gap-2">{ideas.map((idea) => <Link key={idea.id} href={`/discovery/ideas/${idea.id}`} className="flex items-center justify-between rounded-xl border bg-[var(--surface)] p-3 text-sm"><span>{idea.title}</span><ArrowRight size={14} /></Link>)}</div></div> : null}</section>
      <section><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">相关内容</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">只有点击后才会搜索；结果默认不进入资料库。</p></div><Button variant="secondary" disabled={!canWrite || busy !== ""} onClick={() => void loadRelated()}>{busy === "related" ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} {related === null ? "查看相关内容" : "搜索更多"}</Button></div>{related === null ? <Card className="mt-3 p-8 text-center text-sm text-[var(--text-secondary)]">尚未请求相关内容。你可以只根据榜单依据手工加入选题。</Card> : related.length ? <div className="mt-3 grid gap-3">{related.slice(0, 8).map((item) => { const key = `${item.platform}:${item.externalId}`; const checked = selected.includes(key); return <Card key={key} className="flex gap-3 p-3"><input type="checkbox" aria-label={`选择 ${item.title || "相关内容"}`} checked={checked} disabled={!checked && selected.length >= 5} onChange={() => toggle(item)} className="mt-1" />{item.coverUrl ? <img src={item.coverUrl} alt="" className="h-20 w-28 rounded-xl object-cover" /> : <div className="h-20 w-28 shrink-0 rounded-xl bg-[var(--surface-elevated)]" />}<div className="min-w-0 flex-1"><div className="flex gap-2"><Badge>{platformLabel[item.platform]}</Badge>{item.sourceItemId ? <Badge>已收录</Badge> : null}</div><p className="mt-2 line-clamp-2 text-sm font-medium">{item.title || item.description || "未命名内容"}</p><a href={item.originalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent)]">原始内容 <ExternalLink size={12} /></a></div></Card>; })}</div> : <Card className="mt-3 p-8 text-center text-sm text-[var(--text-secondary)]">暂未找到相关内容。</Card>}</section>
    </div>
    <section className="mt-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">选题建议</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">AI 只提出角度，不负责证明趋势，也不会自动保存。</p></div>{candidates ? <Button variant="secondary" disabled={!canWrite || !aiConfigured || busy !== ""} onClick={() => void generate()}><Sparkles size={14} /> 换一批（再次使用 AI）</Button> : null}</div>{!aiConfigured ? <Card className="mt-3 p-5 text-sm text-[var(--text-secondary)]">AI 创作服务尚未配置。趋势查看、相关内容和手工选题不受影响。</Card> : candidates ? <div className="mt-4 grid gap-4 lg:grid-cols-2">{candidates.map((candidate, index) => <Card key={`${candidate.selectedIndex}:${candidate.title}`} className="p-5"><p className="text-xs font-medium text-[var(--text-secondary)]">{String(index + 1).padStart(2, "0")}</p><h3 className="mt-2 text-lg font-semibold">{candidate.title}</h3><div className="mt-4 grid gap-3 text-sm"><div><p className="text-xs text-[var(--text-secondary)]">切入角度</p><p className="mt-1 leading-6">{candidate.angle}</p></div><div><p className="text-xs text-[var(--text-secondary)]">为什么现在值得做</p><p className="mt-1 leading-6">{candidate.whyNow}</p></div><div><p className="text-xs text-[var(--text-secondary)]">差异化</p><p className="mt-1 leading-6">{candidate.differenceFromSources}</p></div>{candidate.riskNotes.length ? <div><p className="text-xs text-[var(--text-secondary)]">待核实风险</p><ul className="mt-1 list-disc space-y-1 pl-5">{candidate.riskNotes.map((note) => <li key={note}>{note}</li>)}</ul></div> : null}</div><Button className="mt-5" disabled={busy !== ""} onClick={() => void saveCandidate(candidate)}>{busy === `candidate:${candidate.selectedIndex}` ? <Loader2 size={14} className="animate-spin" /> : <BookmarkPlus size={14} />} 加入我的选题</Button></Card>)}</div> : <Card className="mt-3 p-8 text-center"><p className="text-sm text-[var(--text-secondary)]">可直接使用趋势依据生成 3–5 个候选角度；如先选择相关内容，建议会更具体。</p><Button className="mt-4" disabled={!canWrite || busy !== ""} onClick={() => void generate()}><Sparkles size={15} /> 生成选题</Button></Card>}</section>
  </>;
}
