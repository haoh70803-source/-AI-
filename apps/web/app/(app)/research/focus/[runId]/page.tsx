import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/access";
import { ResearchError } from "@/server/research/access";
import { focusV2RunView } from "@/server/research/focus-v2-service";
import { ResearchUseFindings } from "@/components/research/research-use-findings";
import { FocusV2SaveButton } from "@/components/research/focus-v2-workbench";
import "@/components/research/research.css";

export default async function FocusV2ResultPage({ params }: { params: Promise<{ runId: string }> }) {
  const { workspace, session, role } = await requireWorkspace(); const { runId } = await params;
  let view: Awaited<ReturnType<typeof focusV2RunView>>;
  try { view = await focusV2RunView({ workspaceId: workspace.id, userId: session.user.id }, runId); }
  catch (error) { if (error instanceof ResearchError && error.status === 404) notFound(); throw error; }
  const { state } = view; const answer = state.answer!;
  const workByRef = new Map(state.works.map(work => [work.ref, work]));
  const workLinks = (refs: string[]) => <div className="research-focus-sources">{refs.map(ref => {
    const work = workByRef.get(ref); return work ? <Link key={ref} href={`/research/benchmarks/${work.accountId}/works/${work.workId}`} title={work.title}>{work.accountName} · {work.title.slice(0, 38)} →</Link> : null;
  })}</div>;
  return <article className="research-focus-page research-focus-result"><nav className="research-breadcrumb" aria-label="面包屑"><Link href="/research">研究中心</Link><span>/</span><Link href="/research/focus">专项研究</Link><span>/</span><span>研究结果</span></nav>
    <header className="research-page-heading"><div><span className="research-eyebrow">第 {view.version} 版 · {state.accounts.map(item => item.name).join(" × ")}</span><h1>{state.question}</h1><p>{new Date(view.at).toLocaleDateString("zh-CN")} · 实际综合 {state.works.length} 条已深拆作品，结论只覆盖本版证据。</p></div></header>
    <section className="research-section research-focus-lead"><h2>针对这个问题</h2><p>{answer.directAnswer}</p><div>{view.saved ? <Link className="research-button research-primary" href={`/research/results/run/${view.id}`}>查看已保存研究 →</Link> : <FocusV2SaveButton sessionId={view.sessionId} runId={view.id} canWrite={role !== "VIEWER"} />}</div><ResearchUseFindings key={view.id} resultId={view.id} canWrite={role !== "VIEWER"} /></section>
    <section className="research-section"><header><h2>关键发现</h2><span>解释为什么，以及有无反例</span></header><div className="research-focus-findings">{answer.findings.map((item, index) => <article key={index}><h3>{item.title}</h3><p>{item.observation}</p><p className="research-focus-why">{item.whyItMatters}</p>{workLinks(item.workRefs)}{item.counterRefs.length ? <details><summary>一起看的反例</summary>{workLinks(item.counterRefs)}</details> : null}<details><summary>查看逐字依据</summary>{item.citations.map((citation, citeIndex) => <blockquote key={citeIndex}>{citation.quote}</blockquote>)}<small>{item.limitation}</small></details></article>)}</div></section>
    {answer.comparisons.length ? <section className="research-section"><header><h2>账号之间真正不同的地方</h2><span>只比较有作品支持的维度</span></header><div className="research-focus-findings">{answer.comparisons.map((item, index) => <article key={index}><h3>{item.dimension}</h3><p>{item.difference}</p>{workLinks(item.workRefs)}<small>{item.limitation}</small></article>)}</div></section> : null}
    {answer.dissent.length ? <section className="research-section"><h2>反例与不同做法</h2><ul className="research-focus-list">{answer.dissent.map((item, index) => <li key={index}><strong>{item.observation}</strong><p>{item.significance}</p>{workLinks(item.workRefs)}</li>)}</ul></section> : null}
    {answer.whatChanged.length ? <section className="research-section"><h2>时间上的变化</h2><ul className="research-focus-list">{answer.whatChanged.map((item, index) => <li key={index}><p>{item.observation}</p>{workLinks([...item.earlierRefs, ...item.laterRefs])}<small>{item.limitation}</small></li>)}</ul></section> : null}
    {answer.transferable.length ? <section className="research-section"><h2>可迁移的方法</h2><div className="research-focus-findings">{answer.transferable.map((item, index) => <article key={index}><h3>{item.mechanism}</h3><p>适用：{item.applicability}</p><p>需要自己的证明：{item.ownProofNeeded}</p><p>可以测试：{item.testVariable}</p>{workLinks(item.sourceWorkRefs)}</article>)}</div></section> : null}
    <details className="research-disclosure"><summary>当前没有回答的部分与证据范围</summary><ul>{[...answer.unanswered, ...answer.nextStudyNeeds, ...answer.researchLimits].map((item, index) => <li key={index}>{item}</li>)}</ul><p>本版只读取 {state.works.length} 条已深拆作品；{state.deferredWorkIds.length ? `另有 ${state.deferredWorkIds.length} 条因上下文预算未纳入。` : "未深拆的作品不会被当作已看过正文。"}</p></details>
  </article>;
}
