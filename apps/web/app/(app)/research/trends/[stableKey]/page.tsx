import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/access";
import { ResearchError } from "@/server/research/access";
import { researchTrendDetail } from "@/server/research/trends";
import { researchObjectPreference } from "@/server/research/preferences";
import { topicOpportunityV2View } from "@/server/research/topic-opportunity-v2-service";
import { TopicOpportunityV2Panel } from "@/components/research/topic-opportunity-v2-panel";
import { ResearchObjectActions } from "@/components/research/research-object-actions";
import { TrendRelatedSearch } from "@/components/research/trend-related-search";
import { platformLabel, trendTypeLabel } from "@/components/research/research-labels";

import { TrendHistoryChart } from "@/components/research/trend-history-chart";

export default async function ResearchTrendDetail({ params, searchParams }: { params: Promise<{ stableKey: string }>; searchParams: Promise<{ page?: string }> }) {
  const { workspace, session, role } = await requireWorkspace(); const { stableKey } = await params; const query = await searchParams;
  let data: Awaited<ReturnType<typeof researchTrendDetail>>;
  try { data = await researchTrendDetail({ workspaceId: workspace.id, userId: session.user.id }, stableKey, Number(query.page) || 1); }
  catch (error) { if (error instanceof ResearchError && error.status === 404) notFound(); throw error; }
  const [preference, opportunity] = await Promise.all([
    researchObjectPreference({ workspaceId: workspace.id, userId: session.user.id }, "TREND", stableKey),
    topicOpportunityV2View({ workspaceId: workspace.id, userId: session.user.id }, stableKey),
  ]);
  const date = (value: Date) => value.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  return <div>
    <nav className="research-breadcrumb" aria-label="面包屑"><Link href="/research">研究</Link><span>/</span><Link href="/research/trends">趋势</Link><span>/</span><span>变化与记录</span></nav>
    <header className="research-page-heading"><div><span className="research-eyebrow">{platformLabel[data.platform]} · {trendTypeLabel[data.trendType]}</span><h1>{data.title}</h1><p>最近观察 {date(data.latest.observedAt)} · {data.state === "RISING" ? "排名较前次上升" : data.state === "FIRST_SEEN" ? "首次记录到这个话题" : "已有保存的观察记录"}</p></div><div className="research-header-actions"><Link className="research-button research-primary" href="#topic-v2">结合我的项目找选题 →</Link><ResearchObjectActions kind="TREND" objectKey={stableKey} followed={Boolean(preference?.followedAt)} showFollow /></div></header>
    <section className="research-section" id="topic-v2"><header><h2>从趋势到选题机会</h2><span>结合已保存的趋势与自己的资料，判断哪些方向值得准备</span></header><TopicOpportunityV2Panel stableKey={stableKey} view={opportunity} canWrite={role !== "VIEWER"} /></section>
    <details className="research-disclosure"><summary>查看排名变化与历史快照（共 {data.count} 次保存观察）</summary><figure className="research-trend-figure"><header><div><h2>排名与快照历史</h2><span className="research-caption">共 {data.count} 次观察 · 排名越小越靠前</span></div><div className="research-trend-rank"><strong>{data.latest.rank ?? "—"}</strong><span>最近排名</span><small>{data.rankDelta === null ? "暂无前次对照" : data.rankDelta > 0 ? `较前次上升 ${data.rankDelta} 位` : data.rankDelta < 0 ? `较前次下降 ${-data.rankDelta} 位` : "与前次持平"}</small></div></header><TrendHistoryChart snapshots={data.snapshots} /><figcaption>图中仅呈现当前页已保存的 {data.snapshots.length} 次观察；空缺不会补零。即使不在今天榜单中，历史仍可查看。</figcaption></figure></details>
    <details className="research-disclosure"><summary>查看每次观察的原始数据</summary><div className="research-table-scroll"><table aria-label="趋势原始数据"><thead><tr><th>观察时间</th><th>来源窗口</th><th className="is-number">排名</th><th className="is-number">内容数</th><th className="is-number">点赞</th><th className="is-number">评论</th></tr></thead><tbody>{data.snapshots.map(snapshot => <tr key={snapshot.id}><td className="is-muted">{date(snapshot.observedAt)}</td><td className="is-muted">{date(snapshot.windowStart)} — {date(snapshot.windowEnd)}</td><td className="is-number">{snapshot.rank ?? "—"}</td><td className="is-number">{snapshot.metrics.contentCount ?? "—"}</td><td className="is-number">{snapshot.metrics.likes ?? "—"}</td><td className="is-number">{snapshot.metrics.comments ?? "—"}</td></tr>)}</tbody></table></div></details>
    {data.pages > 1 ? <nav className="research-pagination" aria-label="历史快照分页">{data.page > 1 ? <Link href={`/research/trends/${stableKey}?page=${data.page - 1}`}>较新观察</Link> : null}<span>第 {data.page} / {data.pages} 页</span>{data.page < data.pages ? <Link href={`/research/trends/${stableKey}?page=${data.page + 1}`}>更早观察</Link> : null}</nav> : null}
    <section className="research-section"><header><h2>看看相关作品</h2><span>主动查找，不自动收录</span></header><TrendRelatedSearch stableKey={stableKey} canWrite={role !== "VIEWER"} /></section>
    <section className="research-section"><header><h2>关于这个趋势，已经保存的结论</h2><Link href={`/research/results?trendKey=${encodeURIComponent(stableKey)}`}>全部成果 →</Link></header>{data.savedRuns.length ? <ul className="research-list">{data.savedRuns.map(run => <li key={run.id}><Link href={`/research/results/run/${run.id}`}><strong>{run.resultTitle || run.question}</strong><small>{run.savedAt?.toLocaleDateString("zh-CN")}</small></Link></li>)}</ul> : <p className="research-center-empty-inline">还没有保存结论。可以从右上方发起研究，先弄清这个话题与受众有什么关系。</p>}</section>
    <details className="research-disclosure"><summary>数据从哪里来？</summary><p className="research-caption">来源 {data.identity.provider} · {platformLabel[data.platform]} · {trendTypeLabel[data.trendType]}。首次观察 {date(data.firstObservedAt)}，不等于事件发生时间。最近来源窗口 {date(data.latest.windowStart)} — {date(data.latest.windowEnd)}。不同平台的指标不可直接比较。</p></details>
  </div>;
}
