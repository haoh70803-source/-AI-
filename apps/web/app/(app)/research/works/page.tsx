import Link from "next/link";
import {isLocalReviewOffline} from "@content-center/providers";
import "@/components/research/benchmark-workbench.css";
import { requireWorkspace } from "@/server/access";
import { researchWorkInbox } from "@/server/research/read-model";
import { WorkQueueActions } from "@/components/research/benchmark-workbench-actions";
import { platformLabel, researchSourceLabel } from "@/components/research/research-labels";
type Params = { q?: string; platform?: string; accountId?: string; view?: string; days?: string };
const date = (value: Date | null) => value ? value.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "未提供";
export default async function ResearchWorks({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, { workspace, session } = await requireWorkspace();
  const view = ["all", "unread", "favorites", "read", "dismissed"].includes(params.view || "") ? params.view! : "unread";
  const result = await researchWorkInbox({ workspaceId: workspace.id, userId: session.user.id }, { ...params, days: params.days || "7", view });
  const href = (nextView: string) => "/research/works?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string,string] => Boolean(entry[1]))), view: nextView }).toString();
  return <article className="research-result-page research-source-inbox">
    <header className="research-page-heading"><div><span className="research-eyebrow">老师 / 对标 · 已保存作品</span><h1>老师 / 对标新作 · {result.unreadCount} 条未读</h1><p>查看已有同步记录，选择阅读、研究或明确采用。此页不触发采集，也不生成稿件。</p></div><Link className="research-button" href="/research/benchmarks">管理老师与对标</Link></header>
    <nav className="research-source-tabs" aria-label="作品列表"><Link aria-current={view === "all" ? "page" : undefined} href={href("all")}>全部作品</Link><Link aria-current={view === "unread" ? "page" : undefined} href={href("unread")}>未读新作</Link><Link aria-current={view === "favorites" ? "page" : undefined} href={href("favorites")}>我的收藏</Link><Link aria-current={view === "read" ? "page" : undefined} href={href("read")}>看过 · 回看</Link><Link aria-current={view === "dismissed" ? "page" : undefined} href={href("dismissed")}>已忽略 · 可恢复</Link><Link href="/research">日报 / 来源</Link></nav>
    <form action="/research/works" className="research-source-search"><input type="hidden" name="view" value={view}/><input name="q" type="search" aria-label="搜索作品" defaultValue={params.q} maxLength={100} placeholder="搜索已保存标题"/>
      <select name="accountId" aria-label="老师或对标" defaultValue={params.accountId || ""}><option value="">全部老师 / 对标</option>{result.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
      <select name="platform" aria-label="作品平台" defaultValue={params.platform || ""}><option value="">全部平台</option>{["DOUYIN","XIAOHONGSHU","BILIBILI","YOUTUBE","TIKTOK"].map(platform => <option key={platform} value={platform}>{platformLabel[platform] || platform}</option>)}</select>
      <select name="days" aria-label="发布时间范围" defaultValue={params.days || "7"}><option value="3">近 3 天发布</option><option value="7">近 7 天发布</option><option value="30">近 30 天发布</option></select><button className="research-button" type="submit">筛选</button>
    </form>
    <details className="teacher-data-notes"><summary>数据范围与阅读状态</summary><p className="research-caption">当前筛选 {result.items.length} 条结果，最多读取 100 条匹配记录；状态仅本人可见。日期筛选依据实际发布时间，未知日期不计入近几天。指标缺失显示“未提供”，不推测爆款倍数。</p></details>
    <div className="research-source-list">{result.items.map(item => <section id={"work-" + item.id} key={item.id} className="research-source-card">
      <div className="research-source-meta"><span>{item.benchmarkAccount.name} · {platformLabel[item.platform] || item.platform}</span><span>{item.read ? "已读" : "未读"}</span></div>
      <h2><Link href={"/research/benchmarks/" + item.benchmarkAccountId + "/works/" + item.id + "?returnTo=" + encodeURIComponent(href(view) + "#work-" + item.id)}>{researchSourceLabel(item.title, "VIDEO")}</Link></h2>
      <p className="research-caption">发布：{date(item.publishedAt)}</p>
      {item.benchmarkAccount.researchNotes ? <p>研究用途：{item.benchmarkAccount.researchNotes}</p> : null}
      <p>{Object.entries(item.counts).filter(([,value])=>value!==null).map(([key,value])=><span key={key} style={{marginRight:16}}>{({likes:"赞",comments:"评",favorites:"藏",shares:"转"} as Record<string,string>)[key]} {value?.toLocaleString("zh-CN")}</span>)}</p>
      {item.metricsObservedAt ? <p className="research-caption">指标观察于 {date(item.metricsObservedAt)}，不同平台不直接比较。</p> : null}
      <div className="research-source-links"><Link href={"/research/benchmarks/" + item.benchmarkAccountId + "/works/" + item.id + "?returnTo=" + encodeURIComponent(href(view) + "#work-" + item.id)}>查看作品与研究 →</Link>
        {item.sourceItemId ? <Link href={"/research/sources/" + item.sourceItemId}>{item.readable ? "读原文 / 摘录 / 入选题" : "查看已存来源"}</Link> : <span>未保存可读原文</span>}
        {item.reportId ? <Link href={"/research/results/run/" + item.reportId}>打开我的已有研究</Link> : <span>尚无本人完成的研究</span>}
        {item.url && /^https?:\/\//i.test(item.url) ? <a href={item.url} target="_blank" rel="noopener noreferrer">去看原作</a> : null}
      </div>
      {item.topics.length ? <details><summary>已有候选选题 · {item.topics.length} 项，先查看以免重复采用</summary>{item.topics.map(topic => <p key={topic.id}><Link href={"/discovery/ideas/" + topic.id}>{topic.title}</Link></p>)}</details> : null}
      <WorkQueueActions id={item.id} accountId={item.benchmarkAccountId} read={item.read} dismissed={item.dismissed} reportId={item.reportId} returnTo={href(view) + "#work-" + item.id} analysisAvailable={!isLocalReviewOffline()}/>
    </section>)}</div><p className="research-caption"><Link href={href("read")}>看过 {result.readCount} 条 · 回看 →</Link> · <Link href={href("dismissed")}>忽略 {result.dismissedCount} 条 · 恢复建议 →</Link>（当前日期与账号范围，最多 100 条）</p>
    {!result.items.length ? <section className="research-source-empty"><h2>本批没有匹配的作品</h2><p>调整日期、账号或搜索条件，或查看老师 / 对标中已有同步记录。未启用后台采集。</p><Link href="/research/benchmarks?period=all#works">查看历史作品榜 →</Link></section> : null}
  </article>;
}
