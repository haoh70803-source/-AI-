"use client";

import { Badge, Button, Card } from "@content-center/ui";
import { Archive, ArrowLeft, ArrowRight, BookmarkPlus, ExternalLink, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Reference = {
  id: string; platform: string; externalId: string; title: string; url: string; authorName: string | null; coverUrl: string | null;
  metadataSnapshot: unknown; sourceItemId: string | null; trendSnapshotId: string | null;
  trendSnapshot: { platform: string; trendType: string; rank: number | null; metrics: unknown; observedAt: string } | null;
};
type Idea = { id: string; title: string; description: string | null; aiRationale: unknown; status: string; projectId: string | null; references: Reference[] };
const statusLabel: Record<string, string> = { INBOX: "待判断", READY: "准备做", IN_PROGRESS: "创作中", DONE: "已完成", ARCHIVED: "已归档" };
const platformLabel: Record<string, string> = { DOUYIN: "抖音", XIAOHONGSHU: "小红书", OTHER: "全网" };

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || "操作失败。"), { code: body.error });
  return body;
}

function contentFrom(reference: Reference) {
  const metadata = reference.metadataSnapshot && typeof reference.metadataSnapshot === "object" && !Array.isArray(reference.metadataSnapshot) ? reference.metadataSnapshot as Record<string, unknown> : {};
  return { externalId: reference.externalId, platform: reference.platform, contentType: ["VIDEO","IMAGE","ARTICLE","UNKNOWN"].includes(String(metadata.contentType)) ? metadata.contentType : "UNKNOWN", title: reference.title, description: null, authorId: null, authorName: reference.authorName, authorAvatarUrl: null, coverUrl: reference.coverUrl, originalUrl: reference.url, publishedAt: typeof metadata.publishedAt === "string" ? metadata.publishedAt : null, metrics: { views: null, likes: null, comments: null, shares: null, favorites: null }, durationMs: null, sourceProvider: "REDFOX" };
}

export function IdeaWorkspace({ initialIdea, canWrite }: { initialIdea: Idea; canWrite: boolean }) {
  const router = useRouter();
  const [idea, setIdea] = useState(initialIdea);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const sourceCount = idea.references.filter((item) => item.sourceItemId).length;
  const trendReferences = idea.references.filter((item) => item.trendSnapshotId);
  const contentReferences = idea.references.filter((item) => !item.trendSnapshotId);
  const aiRationale = idea.aiRationale && typeof idea.aiRationale === "object" && !Array.isArray(idea.aiRationale) ? idea.aiRationale as Record<string, unknown> : null;

  async function update(data: Record<string, unknown>) {
    setBusy("update"); setError("");
    try { const body = await request(`/api/discovery/ideas/${idea.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); setIdea((current) => ({ ...current, ...body.idea })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "更新失败。"); }
    finally { setBusy(""); }
  }

  async function collect(reference: Reference) {
    setBusy(reference.id); setError("");
    try { const body = await request("/api/discovery/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: contentFrom(reference) }) }); setIdea((current) => ({ ...current, references: current.references.map((item) => item.id === reference.id ? { ...item, sourceItemId: body.sourceItemId } : item) })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "收录失败。"); }
    finally { setBusy(""); }
  }

  async function start(collectMissing = false) {
    setBusy("start"); setError("");
    try { const body = await request(`/api/discovery/ideas/${idea.id}/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ collectMissing }) }); router.push(`/dashboard?project=${body.projectId}`); }
    catch (reason) {
      const problem = reason as Error & { code?: string };
      if (problem.code === "IDEA_REFERENCES_REQUIRE_COLLECTION" && window.confirm("开始创作前需要收录未入库的参考内容。是否确认收录并继续？")) { setBusy(""); await start(true); return; }
      setError(problem.message); setBusy("");
    }
  }

  return <>
    <div className="mb-5"><Link href="/discovery" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"><ArrowLeft size={16} /> 返回研究</Link></div>
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><Badge>{statusLabel[idea.status]}</Badge><h1 className="mt-3 text-2xl font-semibold">{idea.title}</h1>{idea.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{idea.description}</p> : null}<p className="mt-4 text-xs text-[var(--text-secondary)]">参考依据 {idea.references.length} · 已收录资料 {sourceCount}</p></div><div className="flex flex-wrap gap-2">{idea.projectId ? <Button asChild><Link href={`/dashboard?project=${idea.projectId}`}>回到工作台 <ArrowRight size={15} /></Link></Button> : <Button disabled={!canWrite || Boolean(busy)} onClick={() => void start(false)}>{busy === "start" ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} 加入当前创作</Button>}<Button variant="secondary" asChild><Link href="/discovery"><Search size={15} /> 继续研究</Link></Button>{idea.status !== "ARCHIVED" ? <Button variant="secondary" disabled={!canWrite || Boolean(busy)} onClick={() => void update({ status: "ARCHIVED" })}><Archive size={15} /> 归档</Button> : null}</div></div>
      {canWrite && !idea.projectId ? <div className="mt-5 flex items-center gap-2 border-t pt-4 text-sm"><span className="text-[var(--text-secondary)]">状态</span><select value={idea.status} onChange={(event) => void update({ status: event.target.value })} disabled={Boolean(busy)} className="h-9 rounded-lg border bg-[var(--surface)] px-3"><option value="INBOX">待判断</option><option value="READY">准备做</option><option value="IN_PROGRESS">创作中</option><option value="DONE">已完成</option></select></div> : null}
    </Card>
    {error ? <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-[var(--danger)]">{error}</p> : null}
    {trendReferences.length || aiRationale ? <section className="mt-6"><h2 className="text-lg font-semibold">为什么做这个选题</h2><div className="mt-4 grid gap-4 lg:grid-cols-2"><Card className="p-5"><h3 className="text-sm font-semibold">真实依据</h3>{trendReferences.length ? <div className="mt-3 grid gap-3">{trendReferences.map((reference) => <Link key={reference.id} href={reference.url} className="rounded-xl bg-[var(--surface-elevated)] p-3"><div className="flex gap-2"><Badge>趋势</Badge><span className="text-xs text-[var(--text-secondary)]">{reference.trendSnapshot?.platform === "GLOBAL" ? "全网" : platformLabel[reference.trendSnapshot?.platform || reference.platform]}</span></div><p className="mt-2 text-sm font-medium">{reference.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{reference.trendSnapshot?.rank === null || reference.trendSnapshot?.rank === undefined ? "暂无可靠排名" : `榜单 #${reference.trendSnapshot.rank}`}</p></Link>)}</div> : <p className="mt-3 text-sm text-[var(--text-secondary)]">没有已保存的趋势依据。</p>}</Card><Card className="p-5"><h3 className="text-sm font-semibold">AI 建议</h3>{aiRationale ? <div className="mt-3 grid gap-3 text-sm"><p>{typeof aiRationale.angle === "string" ? aiRationale.angle : "暂无角度说明"}</p>{typeof aiRationale.whyNow === "string" ? <p><span className="text-[var(--text-secondary)]">为什么现在：</span>{aiRationale.whyNow}</p> : null}{typeof aiRationale.differenceFromSources === "string" ? <p><span className="text-[var(--text-secondary)]">差异化：</span>{aiRationale.differenceFromSources}</p> : null}</div> : <p className="mt-3 text-sm text-[var(--text-secondary)]">该选题由人工从趋势创建，没有 AI 建议。</p>}</Card></div></section> : null}
    <section className="mt-6"><h2 className="text-lg font-semibold">相关作品</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">未收录的作品只保存参考信息，不会下载视频或图片。</p>{contentReferences.length ? <div className="mt-4 grid gap-4 md:grid-cols-2">{contentReferences.map((reference) => <Card key={reference.id} className="flex gap-4 p-4">{reference.coverUrl ? <img src={reference.coverUrl} alt="" className="h-24 w-32 rounded-xl object-cover" /> : <div className="h-24 w-32 shrink-0 rounded-xl bg-[var(--surface-elevated)]" />}<div className="min-w-0 flex-1"><div className="flex gap-2"><Badge>{platformLabel[reference.platform]}</Badge>{reference.sourceItemId ? <Badge className="text-[var(--success)]">已收录</Badge> : <Badge>仅参考</Badge>}</div><h3 className="mt-2 line-clamp-2 text-sm font-semibold">{reference.title}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{reference.authorName || "未知作者"}</p><div className="mt-3 flex flex-wrap gap-2"><a href={reference.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--accent)]">原始内容 <ExternalLink size={12} /></a>{reference.sourceItemId ? <Link href={`/library/${reference.sourceItemId}`} className="text-xs text-[var(--accent)]">查看资料</Link> : <button disabled={!canWrite || Boolean(busy)} onClick={() => void collect(reference)} className="inline-flex items-center gap-1 text-xs text-[var(--accent)]">{busy === reference.id ? <Loader2 size={12} className="animate-spin" /> : <BookmarkPlus size={12} />} 收录资料</button>}</div></div></Card>)}</div> : <Card className="mt-4 p-8 text-center text-sm text-[var(--text-secondary)]">该选题没有保存相关作品，可继续研究并补充。</Card>}</section>
  </>;
}
