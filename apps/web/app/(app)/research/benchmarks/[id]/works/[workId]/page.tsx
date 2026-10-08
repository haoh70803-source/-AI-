import Link from "next/link";
import { isLocalReviewOffline } from "@content-center/providers";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/access";
import { ResearchError } from "@/server/research/access";
import { workCreationChoices, workResearchOverview } from "@/server/research/work-research-service";
import { WorkOriginalMedia, WorkResearchControls } from "@/components/research/work-research-controls";
import { ResearchUseFindings } from "@/components/research/research-use-findings";
import { WorkDecisionIntro, WorkDecisionView } from "@/components/research/work-decision-view";
import "@/components/research/benchmark-dossier.css";
import "@/components/research/work-decision.css";
import "@/components/research/benchmark-workbench.css";
import { WorkReportFragments, WorkSeek } from "@/components/research/work-report-fragments";
import { ReportArchive } from "@/components/research/benchmark-workbench-actions";
import { safeResearchReturn } from "@/server/research/benchmark-workbench-math";
import { benchmarkWorkbench } from "@/server/research/benchmark-workbench";
import { researchWorkInbox } from "@/server/research/read-model";
import { db } from "@content-center/db";

const date = (value: string | null) => value ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" }) : "未知";
const clock = (ms: number | null) => ms === null ? "" : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const labels: Record<string, string> = { audience: "面向谁", situation: "什么场景", problem: "解决什么问题", beliefChange: "试图改变的认知", promise: "内容承诺", coreClaim: "核心观点", desiredOutcome: "希望观众得到什么",
  domain: "领域", theme: "内容母题", angle: "切入角度", informationGap: "信息缺口", intent: "内容意图" };

export default async function WorkResearchPage({ params, searchParams }: { params: Promise<{ id: string; workId: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { workspace, session, role } = await requireWorkspace(); const { id, workId } = await params;
  try {
    const view = await workResearchOverview({ workspaceId: workspace.id, userId: session.user.id }, id, workId);
    const { current, latest } = view; const answer = latest?.answer;
    const actor = { workspaceId: workspace.id, userId: session.user.id };
    const returnTo = safeResearchReturn((await searchParams).returnTo);
    const [board, queue, archivePrefs] = await Promise.all([benchmarkWorkbench(actor, { accountId: id, period: "all" }), researchWorkInbox(actor, {accountId:id,includeDismissed:true}), db.researchObjectPreference.findMany({where:{...actor,kind:"REPORT_ARCHIVED",followedAt:{not:null}},select:{objectKey:true}})]);
    const workMetric = board.works.find(item=>item.id===workId);
    const identity = await db.benchmarkContentSnapshot.findFirst({where:{id:workId,workspaceId:actor.workspaceId,benchmarkAccountId:id},select:{platform:true,externalId:true}});
    const topicReferences = identity ? await db.contentIdeaReference.findMany({where:{idea:{workspaceId:actor.workspaceId,status:{not:"ARCHIVED"}},OR:[{platform:identity.platform,externalId:identity.externalId},...(current.sourceItemId?[{sourceItemId:current.sourceItemId}]:[])]},select:{idea:{select:{id:true,title:true}}},take:20}) : [];
    const linkedTopics = Array.from(new Map(topicReferences.map(ref=>[ref.idea.id,ref.idea])).values());
    const v2Answer = answer && "decision" in answer ? answer : null;
    const choices = v2Answer ? await workCreationChoices({ workspaceId: workspace.id, userId: session.user.id }) : null;
    const citation = (quote: string, ref: string) => <blockquote className="work-research-quote"><span>研究时的原文 · {ref === "M1" ? "资料正文" : "作品标题"}</span><p>{quote}</p>{current.sourceItemId ? <Link href={`/library/${current.sourceItemId}`}>打开资料核对 →</Link> : null}</blockquote>;
    return <div className="work-report-layout"><aside className="work-report-sidebar"><Link href={returnTo}>← 返回原列表</Link><h2>已拆作品</h2><p className="research-caption">最近 100 条已保存作品内的本人报告</p>{queue.items.filter(item=>item.reportId).map(item=><Link key={item.id} href={"/research/benchmarks/"+id+"/works/"+item.id+"?returnTo="+encodeURIComponent(returnTo)} aria-current={item.id===workId?"page":undefined}>{item.title}{archivePrefs.some(pref=>pref.objectKey===item.reportId)?" · 已归档":""}</Link>)}</aside><article className="research-work-page">
      <nav className="dossier-breadcrumb" aria-label="面包屑"><Link href="/research">研究中心</Link><span>/</span><Link href={`/research/benchmarks/${id}`}>{view.account.name}</Link><span>/</span><span>作品深度拆解</span></nav>
      <header className="work-research-hero"><span className="dossier-overline">作品研究档案 · {view.account.platform}</span><h1>{current.title}</h1><p>发布于 {date(current.publishedAt)} · 研究时观察于 {date(current.observedAt)}{current.contentOrigin === "TRANSCRIPT" ? " · 正文来自机器文字稿" : ""}</p><div className="work-research-links">{current.url ? <a href={current.url} target="_blank" rel="noopener noreferrer">打开原作品 ↗</a> : null}{current.sourceItemId ? <Link href={`/library/${current.sourceItemId}`}>打开原资料 →</Link> : null}<Link href={returnTo}>返回原列表 →</Link></div></header>
      <div className="work-report-metrics">{Object.entries(current.metrics).filter(([,value])=>value!==null).map(([key,value])=><div key={key}><span>{({views:"播放",likes:"点赞",comments:"评论",favorites:"收藏",shares:"分享"} as Record<string,string>)[key]}</span><br/><strong>{value ?? "未提供"}</strong></div>)}<div><span>同账号已保存点赞基准</span><br/><strong>{workMetric?.multiple === null || workMetric?.multiple === undefined ? "样本不足" : workMetric.multiple.toFixed(1)+"×"}</strong><p>中位数 {workMetric?.baseline ?? "不足"} · 有效样本 {workMetric?.samples ?? 0} · 最多最近 200 条</p></div></div><div className={v2Answer ? "work-research-opening" : undefined}><details className="work-original-disclosure"><summary>原作品与文字证据</summary><section className="work-research-section work-research-source"><header><h2>原内容与当前证据</h2><p>先读原文，再看这条作品怎样组织内容。</p></header>
        {current.mediaAssetId && current.sourceItemId ? <WorkOriginalMedia accountId={id} workId={workId} sourceItemId={current.sourceItemId} originalUrl={current.url} /> : <p className="dossier-footnote">当前没有可在此播放的已保存视频文件。可以打开原作品或到资料页查看原件。</p>}
        {current.contentText ? <details className="work-research-transcript"><summary>{current.contentOrigin === "TRANSCRIPT" ? "阅读机器文字稿" : "阅读可用正文"} · {current.segments.length ? `${current.segments.length} 个带时间片段` : "无时间码"}</summary>{current.segments.length ? <ol>{current.segments.map((segment, index) => <li key={index}><WorkSeek accountId={id} workId={workId} startMs={segment.startMs} enabled={Boolean(current.mediaAssetId)} /><time>–{clock(segment.endMs)}</time><span>{segment.text}</span></li>)}</ol> : <p>{current.contentText}</p>}{current.truncated ? <p className="dossier-footnote">本页只保存本次研究读到的前段内容；完整文字见资料页。</p> : null}</details> : <p className="dossier-footnote">当前只有标题与作品数据。补充正文后才能研究内容结构和表达机制。</p>}
        <p className="dossier-footnote">作品指标是观察值；没有留存和转化数据，不从点赞推断内容效果。{current.contentOrigin === "TRANSCRIPT" ? "机器转写可能有错字或漏句。" : ""}</p>
      </section></details>{v2Answer ? <WorkDecisionIntro answer={v2Answer} /> : null}</div>
      <section id="deep-report" className="work-research-section"><header><h2>深度拆解</h2><p>{latest ? `第 ${latest.version} 版 · ${date(latest.finishedAt)}${latest.model ? ` · ${latest.model}` : ""}${latest.currentEvidence ? " · 当前证据一致" : " · 原证据已变化"}` : isLocalReviewOffline() ? "尚无已保存拆解；新 AI 调用待授权接入。" : "尚无深度拆解；由你主动开始。"}</p></header>
        <div className="research-source-actions">{latest ? <ReportArchive id={latest.id} archived={archivePrefs.some(pref=>pref.objectKey===latest.id)}/> : null}{linkedTopics.length ? linkedTopics.map(topic=><Link key={topic.id} href={"/discovery/ideas/"+topic.id}>已采用 · {topic.title} →</Link>) : latest ? <Link href={current.sourceItemId ? "/research/sources/"+current.sourceItemId : "#creation-preview"}>未采用 · 放入选题前审阅 →</Link> : <span className="research-caption">尚无可采用的拆解发现</span>}</div>
        <WorkResearchControls accountId={id} workId={workId} view={view} canWrite={role !== "VIEWER"} externalAvailable={!isLocalReviewOffline()} />
        {answer && !v2Answer ? <>
          <div className="work-research-lead"><span>我看懂了它</span><h3>{answer.topicIdea.theme || answer.topicIdea.angle || "这条内容的核心问题"}</h3><p className="work-research-about">{answer.understanding.about.match(/^.*?[。！？]/u)?.[0] ?? answer.understanding.about.slice(0, 120)}</p><details className="work-research-more"><summary>展开完整理解</summary><p>{answer.understanding.about}</p><p>{answer.summary}</p></details>{citation(answer.understanding.citation.quote, answer.understanding.citation.ref)}</div>
          <div className="work-research-columns"><section><h3>理解这条内容</h3><dl>{Object.entries(answer.understanding).filter(([key, value]) => key !== "about" && key !== "citation" && value).map(([key, value]) => <div key={key}><dt>{labels[key] || key}</dt><dd>{String(value)}</dd></div>)}</dl></section><section><h3>选题为什么成立</h3><p>{answer.topicIdea.whyThisTopic}</p><dl>{Object.entries(answer.topicIdea).filter(([key, value]) => key !== "whyThisTopic" && key !== "citation" && value).map(([key, value]) => <div key={key}><dt>{labels[key] || key}</dt><dd>{String(value)}</dd></div>)}</dl>{citation(answer.topicIdea.citation.quote, answer.topicIdea.citation.ref)}</section></div>
        </> : null}
      </section>
      {answer ? <div className="work-report-columns"><WorkReportFragments blocks={answer.structureBlocks} accountId={id} workId={workId} mediaAvailable={Boolean(current.mediaAssetId)}/><section><h2>表现与表达分析</h2>{answer.mechanisms.map((item,index)=><div key={index}><h3>{item.name}</h3><p>{item.description}</p><p>{item.hypothesis}</p><small>{item.limitation}</small></div>)}</section></div> : null}
      {!latest ? <div id="creation-preview"><p>{isLocalReviewOffline() ? "还没有可复刻的已保存拆解。可以先打开原作品阅读；新采集与拆解须先完成授权接入。" : "想复刻：先完成拆解，再审阅发现并预览自己的创作；不会自动发送聊天。"}</p></div> : null}
      {v2Answer ? <details className="work-supplement"><summary>更多选题判断、写法与完整依据</summary><WorkDecisionView answer={v2Answer} sourceItemId={current.sourceItemId} savedRunId={latest?.saved ? latest.id : null} showIntro={false}
        /></details> : null}
      {choices && latest ? <section id="creation-preview"><ResearchUseFindings resultId={latest.id} canWrite={role !== "VIEWER"} /></section> : null}
      {answer && !v2Answer ? <details className="work-supplement"><summary>更多迁移方法与完整依据</summary>
        <section className="work-research-section"><header><h2>内容怎样一步步推进</h2><p>按这条作品实际内容拆分，段落数量不预设。</p></header><ol className="work-research-structure">{answer.structureBlocks.map(block => <li key={block.order}><div className="work-structure-index">{String(block.order).padStart(2, "0")}{block.startMs !== null ? <time>{clock(block.startMs)}–{clock(block.endMs)}</time> : null}</div><div><h3>{block.role}</h3><p>{block.content}</p><dl><div><dt>作用</dt><dd>{block.purpose}</dd></div>{block.expression ? <div><dt>表达</dt><dd>{block.expression}</dd></div> : null}</dl>{citation(block.citation.quote, block.citation.ref)}</div></li>)}</ol></section>
        {answer.mechanisms.length ? <section className="work-research-section"><header><h2>这条内容用了什么机制</h2><p>注意力、证明与表达只呈现实际出现的做法；效果是待验证假设。</p></header><div className="work-mechanisms">{answer.mechanisms.map((item, index) => <article key={index}><span>{({ ATTENTION: "为什么可能继续看", PROOF: "为什么可能相信", EXPRESSION: "怎样表达", OTHER: "其他机制" })[item.kind]}</span><h3>{item.name}</h3><p>{item.description}</p>{item.claim ? <p>作品主张：{item.claim}</p> : null}{item.proof ? <p>作品给出的证明：{item.proof}</p> : null}<p>研究假设：{item.hypothesis}</p><p className="dossier-footnote">{item.limitation}</p>{citation(item.citation.quote, item.citation.ref)}</article>)}</div></section> : null}
        <section className="work-research-section work-transfer"><header><h2>把机制转成自己的内容</h2><p>保留方法，换成自己的项目、受众和真实证据。</p></header><h3>{answer.transferable.principle}</h3><p>{answer.transferable.why}</p><ol>{answer.transferable.steps.map((step, index) => <li key={index}>{step}</li>)}</ol><dl><div><dt>适用场景</dt><dd>{answer.transferable.applicability}</dd></div><div><dt>需要自己的证据</dt><dd>{answer.transferable.ownEvidenceNeeded}</dd></div><div><dt>原作品不能照搬</dt><dd>{answer.transferable.surfaceElements.join("、") || "人物、案例、结果与原话"}</dd></div><div><dt>可以测试</dt><dd>{answer.transferable.testVariable}</dd></div></dl><p className="dossier-footnote">{answer.transferable.limitation}</p>{citation(answer.transferable.citation.quote, answer.transferable.citation.ref)}
          <div className="work-research-links">{latest?.saved ? <Link className="dossier-primary" href={`/research/results/run/${latest.id}#share-result`}>审阅并加入项目 →</Link> : <p>先保存这版研究，就能在项目和 Agent 中引用具体机制与依据。</p>}</div>
        </section>
      </details> : null}
      <details className="work-supplement"><summary>研究历史</summary><section className="work-research-section"><header><h2>研究历史</h2><p>正文或时间码改变后，旧版本仍按当时证据保留。</p></header>{view.history.length ? <ul className="work-research-history">{view.history.map(item => <li key={item.id}><Link href={item.saved ? `/research/results/run/${item.id}` : `/research/session/${item.sessionId}?before=${item.version + 1}#run-${item.id}`}>第 {item.version} 版 · {date(item.date)} · {item.saved ? "已保存成果" : "研究版本"}</Link></li>)}</ul> : <p className="dossier-footnote">还没有完成的作品研究。</p>}</section></details>
    </article></div>;
  } catch (error) { if (error instanceof ResearchError && error.status === 404) notFound(); throw error; }
}
