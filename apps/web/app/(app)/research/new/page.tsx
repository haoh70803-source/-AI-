import Link from "next/link";
import { requireWorkspace } from "@/server/access";
import { listResearchMaterials, listResearchSessions } from "@/server/research/service";
import { researchHomeInputs } from "@/server/research/read-model";
import { ResearchComposer } from "@/components/research/research-composer";
import { BenchmarkWorkspace, type BenchmarkQuery } from "@/components/research/benchmark-workspace";
import { ResearchTools, ResearchContinueCreation } from "@/components/research/research-tools";
export default async function NewResearch({ searchParams }: { searchParams: Promise<BenchmarkQuery & { projectId?: string; entry?: string; accounts?: string | string[]; trend?: string; material?: string }> }) {
  const { workspace, session, role } = await requireWorkspace(), params = await searchParams;
  const actor = { workspaceId: workspace.id, userId: session.user.id };
  const [materials, inputs, sessions] = await Promise.all([listResearchMaterials(actor), researchHomeInputs(actor, params), listResearchSessions(actor)]);
  const { requestedAccounts, accountIds, accounts, trend, selectedMaterial } = inputs;
  const scope = accounts.length || trend || selectedMaterial ? { materialIds: selectedMaterial ? [selectedMaterial.id] : [], benchmarkAccountIds: accounts.map(item => item.id), trendKeys: trend ? [trend.key] : [], notes: "", useCreatorProfile: false, useOwnArtifacts: false } : undefined;
  const entry = params.entry === "BREAKDOWN" ? "BREAKDOWN" : params.entry === "BENCHMARK" ? "BENCHMARK" : params.entry === "OPPORTUNITY" ? "OPPORTUNITY" : "DIRECT";
  return <article className="research-result-page xin-research-home">
    <ResearchTools active={params.purpose === "reference" ? "reference" : "teacher"} />
    <BenchmarkWorkspace embedded searchParams={Promise.resolve({ ...params, purpose: params.purpose ?? "teacher" })} />
    <ResearchContinueCreation />
    <details className="research-lite-question" open={Boolean(params.entry || params.material || params.accounts || params.trend || params.projectId)}><summary>围绕自己的问题研究 · 添加资料与依据</summary>
    <section className="research-source-card xin-research-result" aria-label="开始一项研究"><header><strong>研究问题与依据</strong><span>私人研究</span></header><div className="xin-research-result-body"><p className="research-caption">读取依据 → 比较分析 → 综合结论</p><h2>这次想弄明白什么？</h2>
      {requestedAccounts.length > 3 ? <p role="alert" className="research-error">一次最多选择 3 个账号。</p> : null}
      {accounts.length !== accountIds.length ? <p role="alert" className="research-error">部分账号不可访问，请重新选择。</p> : null}
      {params.trend && !trend ? <p role="alert" className="research-error">所选趋势无法访问，请重新选择。</p> : null}
      <ResearchComposer initialMaterials={selectedMaterial ? [selectedMaterial, ...materials.filter(item => item.id !== selectedMaterial.id)] : materials} initialAccounts={accounts} initialTrends={trend ? [trend] : []} initialScope={scope} initialEntry={entry} projectId={params.projectId} canWrite={role !== "VIEWER"} />
    </div></section></details>
    <details className="research-lite-history"><summary>最近研究会话 · {sessions.length}</summary><nav aria-label="最近研究会话">{sessions.slice(0,12).map(item => <Link href={`/research/session/${item.id}`} key={item.id} title={item.title}>{item.title}<span>打开 →</span></Link>)}</nav>{!sessions.length ? <p className="research-caption">尚无研究会话。开始研究后，问题、依据与结果会保存在这里。</p> : null}<div className="research-lite-materials"><span>{materials.length} 份可选资料</span><Link href="/library">管理原始资料 →</Link><Link href="/research/results">查看研究记录 →</Link></div></details>
  </article>;
}
