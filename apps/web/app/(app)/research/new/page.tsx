import Link from "next/link";
import { requireWorkspace } from "@/server/access";
import { listResearchMaterials, listResearchSessions } from "@/server/research/service";
import { researchHomeInputs } from "@/server/research/read-model";
import { ResearchComposer } from "@/components/research/research-composer";
export default async function NewResearch({ searchParams }: { searchParams: Promise<{ projectId?: string; entry?: string; accounts?: string | string[]; trend?: string; material?: string }> }) {
  const { workspace, session, role } = await requireWorkspace(), params = await searchParams;
  const actor = { workspaceId: workspace.id, userId: session.user.id };
  const [materials, inputs, sessions] = await Promise.all([listResearchMaterials(actor), researchHomeInputs(actor, params), listResearchSessions(actor)]);
  const { requestedAccounts, accountIds, accounts, trend, selectedMaterial } = inputs;
  const scope = accounts.length || trend || selectedMaterial ? { materialIds: selectedMaterial ? [selectedMaterial.id] : [], benchmarkAccountIds: accounts.map(item => item.id), trendKeys: trend ? [trend.key] : [], notes: "", useCreatorProfile: false, useOwnArtifacts: false } : undefined;
  const entry = params.entry === "BREAKDOWN" ? "BREAKDOWN" : params.entry === "BENCHMARK" ? "BENCHMARK" : params.entry === "OPPORTUNITY" ? "OPPORTUNITY" : "DIRECT";
  return <article className="research-result-page xin-research-home">
    <header className="research-page-heading"><div><span className="research-eyebrow">RESEARCH / FROM EVIDENCE TO IDEAS</span><h1>把问题，研究明白。</h1><p>从资料与对标出发，让每个结论都有依据。</p></div><a className="research-button" href="#research-question">＋ 新建研究</a></header>
    <div className="xin-research-shortcuts"><Link href="/research/teardown" className="research-button">视频拆解 · 完整链路 →</Link><Link href="/research/benchmarks" className="research-button">对标、趋势与其他研究能力 →</Link></div>
    <section className="xin-research-hero"><div><span className="research-eyebrow">CONTINUE YOUR EXPLORATION</span><h2>下一步创作，<br/>从一个更好的问题开始。</h2><p>研究与项目相连，资料、依据和结论一起留下。</p></div><img src="/brand/experience/research.svg" alt="红色圆点与水平轨道的研究视觉"/></section>
    <div className="xin-research-layout"><aside className="xin-research-session-list"><p className="research-eyebrow">研究会话</p>{sessions.slice(0,12).map(item => <Link href={`/research/session/${item.id}`} key={item.id}><strong>{item.title}</strong><small>打开研究记录 →</small></Link>)}{!sessions.length ? <p className="research-caption">尚无研究会话。开始一项研究后，问题、依据与结果会保存在这里。</p> : null}<div className="xin-research-evidence"><strong>{materials.length} 份可选资料</strong><p>查看依据 → 核对结论 → 继续创作</p><Link href="/library">管理原始资料 →</Link></div></aside>
    <section className="research-source-card xin-research-result" aria-label="开始一项研究"><header><strong>研究问题与依据</strong><span>私人研究</span></header><div className="xin-research-result-body"><p className="research-caption">读取依据 → 比较分析 → 综合结论</p><h2>这次想弄明白什么？</h2>
      {requestedAccounts.length > 3 ? <p role="alert" className="research-error">一次最多选择 3 个账号。</p> : null}
      {accounts.length !== accountIds.length ? <p role="alert" className="research-error">部分账号不可访问，请重新选择。</p> : null}
      {params.trend && !trend ? <p role="alert" className="research-error">所选趋势无法访问，请重新选择。</p> : null}
      <ResearchComposer initialMaterials={selectedMaterial ? [selectedMaterial, ...materials.filter(item => item.id !== selectedMaterial.id)] : materials} initialAccounts={accounts} initialTrends={trend ? [trend] : []} initialScope={scope} initialEntry={entry} projectId={params.projectId} canWrite={role !== "VIEWER"} />
    </div></section></div>
  </article>;
}
