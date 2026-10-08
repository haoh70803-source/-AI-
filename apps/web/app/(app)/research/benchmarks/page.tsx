import Link from "next/link";
import {isLocalReviewOffline} from "@content-center/providers";
import {requireWorkspace} from "@/server/access";
import {canAddResearchAccount} from "@/server/experience-account";
import {benchmarkWorkbench} from "@/server/research/benchmark-workbench";
import {researchWorkInbox} from "@/server/research/read-model";
import {BenchmarkAccountAdd} from "@/components/research/benchmark-account-add";
import {BenchmarkPurpose,BenchmarkSync} from "@/components/research/benchmark-workbench-actions";
import {platformLabel} from "@/components/research/research-labels";
import "@/components/research/benchmark-workbench.css";
type Query={q?:string;platform?:string;period?:string;accountId?:string;threshold?:string;viral?:string;sort?:string;purpose?:string};
const date=(value:Date|string|null)=>value?new Date(value).toLocaleDateString("zh-CN",{timeZone:"Asia/Shanghai"}):"尚未同步";
const number=(value:number)=>value.toLocaleString("zh-CN");
export default async function ResearchBenchmarks({searchParams}:{searchParams:Promise<Query>}){
 const{workspace,session,role}=await requireWorkspace(),query=await searchParams,actor={workspaceId:workspace.id,userId:session.user.id};
 const [data,inbox]=await Promise.all([benchmarkWorkbench(actor,query),researchWorkInbox(actor,{includeDismissed:true})]);
 const canWrite=canAddResearchAccount(role,session.user),externalAvailable=!isLocalReviewOffline();
 const filters=new URLSearchParams(Object.entries(query).filter((entry):entry is [string,string]=>typeof entry[1]==="string"));
 const returnTo="/research/benchmarks?"+filters+"#works";
 const period=data.days===null?"全部已保存":data.days===7?"最近一周":"最近30天";
 const roleLink=(purpose:string)=>{const values=new URLSearchParams(filters);values.set("purpose",purpose);values.delete("accountId");return "/research/benchmarks?"+values;};
 return <article className="teacher-workbench">
  <header className="research-page-heading"><div><span className="research-eyebrow">研究中心</span><h1>老师 / 对标</h1><p>老师学方法，对标找题材。先选账号，再看值得学的作品。</p></div>
   <div className="teacher-header-actions"><Link className="research-button" href="/research/works?view=unread&days=7">新作品队列</Link><BenchmarkAccountAdd canManage={canWrite} externalAvailable={externalAvailable}/></div>
  </header>
  <nav className="teacher-role-tabs" aria-label="学习目的筛选">{([["all","全部账号"],["teacher","老师 · 学方法"],["reference","对标 · 找题材"]] as const).map(([value,label])=><Link key={value} href={roleLink(value)} aria-current={(query.purpose||"all")===value?"page":undefined}>{label}</Link>)}</nav>
  {!externalAvailable?<p className="teacher-availability" role="status">当前查看已保存的数据。新增采集、同步和 AI 拆解待授权接入；分类、阅读和已有报告仍可使用。</p>:null}
  <form className="teacher-filter-form">
   <div className="teacher-filter-main"><label>作品范围<select name="period" defaultValue={query.period||"30"}><option value="7">最近一周</option><option value="30">最近30天</option><option value="all">全部已保存</option></select></label><label>作品表现<select name="viral" defaultValue={query.viral||"all"}><option value="all">全部作品</option><option value="viral">超过门槛</option></select></label><button className="research-button">查看</button>
   <details className="teacher-more-filters"><summary>更多筛选</summary><div className="teacher-filter-extra"><label>搜索账号<input type="search" name="q" defaultValue={query.q} maxLength={100} placeholder="账号名称"/></label><label>平台<select name="platform" defaultValue={query.platform||""}><option value="">全部平台</option>{["DOUYIN","XIAOHONGSHU","BILIBILI","YOUTUBE","TIKTOK"].map(value=><option key={value} value={value}>{platformLabel[value]||value}</option>)}</select></label><label>指定账号<select name="accountId" defaultValue={query.accountId||""}><option value="">全部账号</option>{data.cards.map(card=><option key={card.id} value={card.id}>{card.name}</option>)}</select></label><label>倍数门槛<input type="number" name="threshold" min={1} max={100} step={0.1} defaultValue={data.threshold}/></label><label>排序<select name="sort" defaultValue={query.sort||"multiple"}><option value="multiple">点赞基准倍数</option><option value="heat">点赞最多</option><option value="time">最新发布</option></select></label></div></details></div>
   <input type="hidden" name="purpose" value={query.purpose||"all"}/>
  </form>
  <section className="teacher-account-section"><header className="teacher-section-heading"><h2>关注的账号 <small>{data.cards.length}</small></h2><BenchmarkSync ids={data.cards.map(card=>card.id)} canWrite={canWrite} externalAvailable={externalAvailable}/></header>
   <div className="teacher-card-grid" aria-label="账号表现">{data.cards.map(card=><section id={"account-"+card.id} className="teacher-card" key={card.id}>
    <header><Link href={"/research/benchmarks/"+card.id}>{card.name} →</Link><span className="teacher-tag">{platformLabel[card.platform]||card.platform}</span></header>
    <BenchmarkPurpose id={card.id} purpose={card.purpose}/>
    {card.trend.length>=2?<figure className="teacher-trend"><svg viewBox="0 0 300 64" role="img" aria-label="已保存作品按发布时间排列的点赞表现"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={card.trend.map((point,index)=>((index/Math.max(1,card.trend.length-1))*296+2)+","+(60-point.likes/Math.max(1,...card.trend.map(p=>p.likes))*54)).join(" ")}/>{card.trend.map((point,index)=><circle key={point.id} cx={index/Math.max(1,card.trend.length-1)*296+2} cy={60-point.likes/Math.max(1,...card.trend.map(p=>p.likes))*54} r={point.likes===Math.max(...card.trend.map(p=>p.likes))?4:2}><title>{point.title+" · 点赞 "+point.likes}</title></circle>)}</svg><figcaption>{period} · 作品点赞表现</figcaption></figure>:<p className="teacher-sample-note">{period}{card.works.length?"仅有 "+card.works.length+" 条已保存作品":"没有已保存作品"}<br/>{card.baseline.median===null?"暂不能比较表现；可切换作品范围。":""}</p>}
    {card.baseline.median!==null?<dl className="teacher-stats"><div><dt>点赞中位数</dt><dd>{number(card.baseline.median)}</dd></div><div><dt>有效样本</dt><dd>{card.baseline.samples}</dd></div><div><dt>≥ {data.threshold} 倍</dt><dd>{card.highCount} 条</dd></div></dl>:card.trend.length>=2?<p className="research-caption">有效样本 {card.baseline.samples} 条，至少 5 条后可计算倍数。</p>:null}
    <footer><span>已保存 {card._count.contentSnapshots} 条 · 更新 {date(card.lastSyncedAt)}</span><div className="research-source-links"><Link href={"/research/benchmarks/"+card.id}>查看作品</Link>{externalAvailable?<BenchmarkSync ids={[card.id]} canWrite={canWrite} externalAvailable={externalAvailable}/>:null}{card.originalUrl&&/^https:\/\//.test(card.originalUrl)?<a href={card.originalUrl} target="_blank" rel="noopener noreferrer">主页 ↗</a>:null}</div></footer>
    {card.collectionRuns[0]&&["FAILED","PARTIAL"].includes(card.collectionRuns[0].status)?<p role="status" className="research-caption">最近采集未完整完成，已保存作品保留。</p>:null}
   </section>)}</div>
   {!data.cards.length?<section className="research-source-empty"><h3>当前筛选下没有账号</h3><p>已有账号需要由你选择学习目的，才会出现在老师或对标列表。</p><Link href="/research/benchmarks">查看全部账号 →</Link></section>:null}
  </section>
  <section id="works" className="teacher-ranking"><header className="teacher-section-heading"><div><h2>作品榜</h2><p>{period} · {data.works.length} 条已保存作品{query.viral==="viral"?"超过 "+data.threshold+" 倍门槛":""}</p></div><Link href="/research/works?view=unread&days=7">去新作品队列 →</Link></header>
   {data.works.map(work=>{const report=inbox.items.find(item=>item.id===work.id)?.reportId;const href="/research/benchmarks/"+work.accountId+"/works/"+work.id+"?returnTo="+encodeURIComponent(returnTo.replace("#works","#work-"+work.id));return <section className="teacher-work-row" id={"work-"+work.id} key={work.id}><span className={"teacher-multiple"+(work.multiple===null?" is-unavailable":"")}>{work.multiple===null?"—":work.multiple.toFixed(1)+"×"}<small>点赞基准倍数</small></span><div><h3><Link href={href}>{work.title}</Link></h3><p>{work.accountName} · {date(work.publishedAt)}{work.durationMs!==null?" · "+Math.round(work.durationMs/1000)+" 秒":""}</p><div className="teacher-work-counts">{Object.entries(work.counts).filter(([,value])=>value!==null).map(([key,value])=><span key={key}>{({likes:"赞",favorites:"藏",shares:"转",comments:"评"} as Record<string,string>)[key]} <strong>{number(value!)}</strong></span>)}</div></div><Link className="research-button" href={href+(report?"#deep-report":"")}>{report?"看已有拆解":"查看作品"}</Link></section>})}
   {!data.works.length&&data.cards.length?<div className="research-source-empty"><h3>这个范围暂无作品</h3><p>采集未启用；可以切换“全部已保存”查看历史作品。</p></div>:null}
  </section>
  <details className="teacher-data-notes"><summary>数据范围与比较方法</summary><p>基准是同账号、同平台、同周期的点赞中位数，至少 5 个有效样本；倍数不代表播放量或完播率。每账号最多读取最近 200 条、最多 100 个账号；“全部”指已保存范围。{data.bounded?"当前达到读取上限。":""}缺失指标不补算。曲线比较各条作品的点赞观察值，不表示粉丝增长或同一作品随时间变化。</p><p>当前同步只取近期一页，尚未提供连续翻页和自动每日采集。需要先完成第三方授权及真实接口验收。</p></details>
 </article>;
}
