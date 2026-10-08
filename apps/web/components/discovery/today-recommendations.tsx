"use client";

import { Badge, Button, Card } from "@content-center/ui";
import { ArrowRight, Check, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type RecommendationBatchView = {
  id: string;
  mode: "DETERMINISTIC" | "AI_ASSISTED";
  generatedAt: string;
  expiresAt: string;
  creatorProfileId: string | null;
  items: Array<{ id: string; position: number; title: string; coreQuestion: string; angle: string; whyRecommended: string; whyNow: string; creatorFit: string; differenceFromRecentContent: string; suggestedNextStep: string; riskNotes: unknown; recommendedFormat: string | null; status: "NEW" | "SAVED" | "STARTED" | "DISMISSED"; contentIdeaId: string | null; projectId: string | null }>;
};

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init); const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "操作未完成，请稍后重试。");
  return body;
}

export function TodayRecommendations({ initialBatch, canWrite }: { initialBatch: RecommendationBatchView | null; canWrite: boolean }) {
  const router = useRouter();
  const [batch, setBatch] = useState(initialBatch); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function generate() { setBusy("generate"); setError(""); try { const body = await request("/api/discovery/recommendations", { method: "POST" }); setBatch(body.batch); } catch (reason) { setError(reason instanceof Error ? reason.message : "生成失败。"); } finally { setBusy(""); } }
  async function act(id: string, action: "DISMISS" | "SAVE_IDEA" | "START_RESEARCH") { setBusy(`${id}:${action}`); setError(""); try { const body = await request(`/api/discovery/recommendations/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }); setBatch((current) => current ? { ...current, items: current.items.map((item) => item.id === id ? { ...item, status: action === "DISMISS" ? "DISMISSED" : "SAVED", contentIdeaId: body.ideaId ?? item.contentIdeaId } : item) } : current); if (action === "START_RESEARCH" && body.ideaId) router.push(`/discovery/ideas/${body.ideaId}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败。"); } finally { setBusy(""); } }
  const visible = batch?.items.filter((item) => item.status !== "DISMISSED").slice(0, 3) ?? [];
  const ai = batch?.mode === "AI_ASSISTED";
  return <section className="discovery-section discovery-today" data-testid="today-recommendations">
    <div className="discovery-section-heading"><div><div className="flex items-center gap-2"><h2><Sparkles size={19} />今日值得看</h2>{ai ? <Badge>AI 辅助</Badge> : null}</div><p>从已有同行内容和资料里，挑出今天值得关注的方向。</p></div>{canWrite ? <Button variant="ghost" onClick={() => void generate()} disabled={busy === "generate"}>{busy === "generate" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}{batch ? "换一批" : "生成今日线索"}</Button> : null}</div>
    {error ? <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</p> : null}
    {!batch ? <div className="discovery-today-empty"><span><Sparkles size={20} /></span><div><h3>还没有今日内容线索</h3><p>可以先搜索内容或收录资料，系统再帮助你整理值得继续看的方向。</p>{!canWrite ? <small>当前为只读权限。</small> : null}</div></div> : visible.length ? <div className="discovery-today-grid">{visible.map((item) => <Card key={item.id} className="discovery-today-card"><div className="flex items-start justify-between gap-3"><Badge>{item.recommendedFormat || "内容方向"}</Badge>{canWrite && item.status === "NEW" ? <button aria-label="忽略该线索" disabled={Boolean(busy)} onClick={() => void act(item.id, "DISMISS")} className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]"><X size={15} /></button> : null}</div><h3>{item.title}</h3><p>{item.coreQuestion}</p><dl><div><dt>为什么值得关注</dt><dd>{item.whyRecommended}</dd></div><div><dt>为什么是现在</dt><dd>{item.whyNow}</dd></div><div><dt>与你相关</dt><dd>{item.creatorFit}</dd></div></dl><footer><Button variant="secondary" asChild><Link href={`/discovery/recommendations/${item.id}`}>查看依据 <ArrowRight size={14} /></Link></Button>{canWrite && item.status === "NEW" ? <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, "SAVE_IDEA")}><Check size={14} />加入选题</Button> : null}{canWrite && item.status === "NEW" ? <Button disabled={Boolean(busy)} onClick={() => void act(item.id, "START_RESEARCH")}><Sparkles size={14} />开始研究</Button> : null}{item.contentIdeaId ? <Button asChild><Link href={`/discovery/ideas/${item.contentIdeaId}`}>查看选题</Link></Button> : null}</footer></Card>)}</div> : <div className="discovery-today-empty"><span><Sparkles size={20} /></span><div><h3>本批线索已经处理完成</h3><p>可以明确点击“换一批”，继续查看新的研究方向。</p></div></div>}
    {batch && !batch.creatorProfileId ? <p className="mt-3 text-xs text-[var(--text-secondary)]">未使用个性化档案。<Link href="/settings/creator-profile" className="text-[var(--accent)]">完善创作者档案</Link>后可提供更多人工判断依据。</p> : null}
  </section>;
}
