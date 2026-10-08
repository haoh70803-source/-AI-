import Link from "next/link";
import {isLocalReviewOffline} from "@content-center/providers";
import {notFound} from "next/navigation";
import {requireWorkspace} from "@/server/access";
import {canAddResearchAccount} from "@/server/experience-account";
import {benchmarkWorkbench} from "@/server/research/benchmark-workbench";
import {researchWorkInbox} from "@/server/research/read-model";
import {BenchmarkPurpose,BenchmarkSync} from "@/components/research/benchmark-workbench-actions";
import {platformLabel} from "@/components/research/research-labels";
import "@/components/research/benchmark-workbench.css";
export default async function AccountDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{period?:string}>}){
 const{id}=await params,query=await searchParams,{workspace,session,role}=await requireWorkspace(),actor={workspaceId:workspace.id,userId:session.user.id};
 const[board,queue]=await Promise.all([benchmarkWorkbench(actor,{accountId:id,period:query.period}),researchWorkInbox(actor,{accountId:id,includeDismissed:true})]);
 const account=board.cards.find(card=>card.id===id);if(!account)notFound();
 const returnTo="/research/benchmarks/"+id+"?period="+(query.period||"30")+"#works";
 return <article className="teacher-workbench"><nav className="dossier-breadcrumb"><Link href="/research/benchmarks">← 老师与对标</Link></nav><header className="research-page-heading"><div><span className="research-eyebrow">账号学习档案 · {platformLabel[account.platform]||account.platform}</span><h1>{account.name}</h1><p>已保存 {account._count.contentSnapshots} 条作品</p><BenchmarkPurpose id={id} purpose={account.purpose}/></div><div className="teacher-header-actions"><BenchmarkSync ids={[id]} canWrite={canAddResearchAccount(role,session.user)} externalAvailable={!isLocalReviewOffline()}/>{account.originalUrl&&/^https:\/\//.test(account.originalUrl)?<a href={account.originalUrl} target="_blank" rel="noopener noreferrer">账号主页 ↗</a>:null}<Link href={"/research/works?view=unread&days=7&accountId="+id}>该账号新作队列 →</Link></div></header>
 <p className="research-caption">最后成功同步：{account.lastSyncedAt?account.lastSyncedAt.toLocaleString("zh-CN",{timeZone:"Asia/Singapore"}):"尚未同步"}。新增采集待授权接入；不会自动采集。</p>
 <form className="research-filters"><label>作品周期<select name="period" defaultValue={query.period||"30"}><option value="7">最近一周</option><option value="30">最近 30 天</option><option value="all">全部已保存</option></select></label><button className="research-button">筛选</button></form>
 {account.baseline.median!==null?<dl className="teacher-stats"><div><dt>同周期点赞中位数</dt><dd>{account.baseline.median??"样本不足"}</dd></div><div><dt>有效样本 / 可读范围</dt><dd>{account.baseline.samples} / {account.works.length}</dd></div><div><dt>≥ 2.5 倍作品</dt><dd>{account.baseline.median===null?"无法判断":account.highCount}</dd></div></dl>:<p className="research-caption">当前范围样本不足，可切换“全部已保存”查看历史作品。</p>}<details className="teacher-data-notes"><summary>账号身份与统计口径</summary><p>平台身份 {account.externalAccountId}</p><p className="research-caption">至少 5 个有效样本，每账号最多最近 200 条；全部已保存 {account._count.contentSnapshots} 条。缺少数据不会用零替代。</p></details>
 <section id="works"><h2>账号作品与拆解关联 · {board.works.length} 条</h2>{board.works.map(work=>{const report=queue.items.find(item=>item.id===work.id)?.reportId;return <section className="teacher-work-row" id={"work-"+work.id} key={work.id}><span className="teacher-multiple">{work.multiple===null?"—":work.multiple.toFixed(1)+"×"}</span><div><h3>{work.title}</h3><p>{work.publishedAt?new Date(work.publishedAt).toLocaleDateString("zh-CN",{timeZone:"Asia/Singapore"}):"发布日期未提供"} · {work.durationMs===null?"时长未提供":Math.round(work.durationMs/1000)+" 秒"}</p><p>赞 {work.counts.likes??"未提供"} · 藏 {work.counts.favorites??"未提供"} · 转 {work.counts.shares??"未提供"} · 评 {work.counts.comments??"未提供"}</p></div><Link className="research-button" href={"/research/benchmarks/"+id+"/works/"+work.id+"?returnTo="+encodeURIComponent(returnTo.replace("#works","#work-"+work.id))+"#deep-report"}>{report?"看已有拆解":"展开作品"}</Link></section>})}</section></article>;
}
