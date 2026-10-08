import Link from "next/link";
import { requireWorkspace } from "@/server/access";
import { listResearchMaterials } from "@/server/research/service";
import { researchHomeInputs } from "@/server/research/read-model";
import { ResearchComposer } from "@/components/research/research-composer";
export default async function NewResearch({ searchParams }: { searchParams: Promise<{ projectId?: string; entry?: string; accounts?: string | string[]; trend?: string; material?: string }> }) {
  const { workspace, session, role } = await requireWorkspace(), params = await searchParams;
  const actor = { workspaceId: workspace.id, userId: session.user.id };
  const [materials, inputs] = await Promise.all([listResearchMaterials(actor), researchHomeInputs(actor, params)]);
  const { requestedAccounts, accountIds, accounts, trend, selectedMaterial } = inputs;
  const scope = accounts.length || trend || selectedMaterial ? { materialIds: selectedMaterial ? [selectedMaterial.id] : [], benchmarkAccountIds: accounts.map(item => item.id), trendKeys: trend ? [trend.key] : [], notes: "", useCreatorProfile: false, useOwnArtifacts: false } : undefined;
  const entry = params.entry === "BREAKDOWN" ? "BREAKDOWN" : params.entry === "BENCHMARK" ? "BENCHMARK" : params.entry === "OPPORTUNITY" ? "OPPORTUNITY" : "DIRECT";
  return <article className="research-result-page"><nav className="research-breadcrumb"><Link href="/research">日报 / 来源</Link><span>/ 新研究</span></nav>
    <header className="research-page-heading"><div><h1>这次想弄明白什么？</h1><p>选择原内容或老师账号，提出一个具体问题。研究默认私人，进度与追问只保存在这里。</p></div></header>
    <section className="research-source-card" aria-label="开始一项研究">
      {requestedAccounts.length > 3 ? <p role="alert" className="research-error">一次最多选择 3 个账号。</p> : null}
      {accounts.length !== accountIds.length ? <p role="alert" className="research-error">部分账号不可访问，请重新选择。</p> : null}
      {params.trend && !trend ? <p role="alert" className="research-error">所选趋势无法访问，请重新选择。</p> : null}
      <ResearchComposer initialMaterials={selectedMaterial ? [selectedMaterial, ...materials.filter(item => item.id !== selectedMaterial.id)] : materials} initialAccounts={accounts} initialTrends={trend ? [trend] : []} initialScope={scope} initialEntry={entry} projectId={params.projectId} canWrite={role !== "VIEWER"} />
    </section>
  </article>;
}
