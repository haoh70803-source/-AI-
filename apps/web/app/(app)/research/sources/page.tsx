import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/access";
import { researchSourceInbox } from "@/server/research/read-model";
import { ResearchSourceActions } from "@/components/research/research-source-actions";
import { platformLabel, researchSourceLabel } from "@/components/research/research-labels";
type Params = { q?: string; view?: string; cursor?: string; days?: string; projectId?: string; entry?: string; accounts?: string | string[]; trend?: string; material?: string };
export default async function ResearchDaily({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  if (params.entry || params.accounts || params.material || params.trend || params.projectId) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
    redirect("/research/new?" + query.toString());
  }
  const { workspace, session } = await requireWorkspace();
  const view = ["unread", "favorites"].includes(params.view || "") ? params.view : "all";
  const { items, nextCursor } = await researchSourceInbox({ workspaceId: workspace.id, userId: session.user.id }, { ...params, view });
  const link = (nextView: string, cursor?: string) => "/research/sources?" + new URLSearchParams({ view: nextView, ...(params.q ? { q: params.q } : {}), ...(params.days ? { days: params.days } : {}), ...(cursor ? { cursor } : {}) }).toString();
  return <article className="research-result-page research-source-inbox">
    <header className="research-page-heading"><div><span className="research-eyebrow">日报 / 来源</span><h1>今天，从已有内容开始</h1><p>按实际入库时间整理资料。这里没有自动生成的今日热点，也没有后台采集；旧资料仍按原日期展示。</p></div><Link className="research-button research-primary" href="/research/new">提出研究问题</Link></header>
    <nav className="research-source-tabs" aria-label="来源列表"><Link aria-current={view === "all" ? "page" : undefined} href={link("all")}>全部来源</Link><Link aria-current={view === "unread" ? "page" : undefined} href={link("unread")}>未读 / 有更新</Link><Link aria-current={view === "favorites" ? "page" : undefined} href={link("favorites")}>我的收藏</Link><Link href="/research/results?library=clippings">我的摘录</Link><Link href="/research/works">新作品队列</Link></nav>
    <form className="research-source-search" action="/research/sources"><input type="hidden" name="view" value={view} /><input type="search" name="q" aria-label="搜索来源" defaultValue={params.q} placeholder="搜索标题或已保存正文" maxLength={100} /><select name="days" aria-label="来源入库时间" defaultValue={params.days || ""}><option value="">全部入库日期</option><option value="1">近 1 天入库</option><option value="3">近 3 天入库</option><option value="7">近 7 天入库</option><option value="30">近 30 天入库</option></select><button className="research-button" type="submit">搜索</button></form>
    <p className="research-caption">原文摘录用于快速判断；完整内容和研究入口在来源详情中。每批最多 30 份；未读按本批资料筛选。收藏与已读状态仅本人可见。</p>
    <div className="research-source-list">{items.map(item => <section className="research-source-card" key={item.id}>
      <div className="research-source-meta"><span>{platformLabel[item.sourcePlatform] || item.sourcePlatform} · {item.sourceType}</span><time dateTime={item.createdAt.toISOString()}>入库 {item.createdAt.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</time><span>{item.read ? "已读" : "未读 / 有更新"}</span></div>
      <h2><Link href={"/research/sources/" + item.id}>{researchSourceLabel(item.title, item.sourceType)}</Link></h2><small>{item.excerptKind}</small><p>{item.excerpt || "目前没有可读正文，可到原资料页检查文件或补充文字。"}</p>
      <div className="research-source-links"><Link href={"/research/sources/" + item.id}>阅读与研究 →</Link><Link href={"/library/" + item.id}>打开原资料</Link></div>
      <ResearchSourceActions id={item.id} read={item.read} followed={item.followed} />
    </section>)}</div>
    {!items.length ? <section className="research-source-empty"><h2>{view === "favorites" ? "还没有收藏的来源" : view === "unread" ? "本批没有匹配的未读资料" : "没有匹配的已保存资料"}</h2><p>可以调整搜索，或到资料库导入原件。页面不会调用外部服务补齐内容。</p><Link href="/library">打开资料库 →</Link></section> : null}
    {nextCursor ? <Link className="research-button" href={link(view || "all", nextCursor)}>下一批资料 →</Link> : null}
  </article>;
}
