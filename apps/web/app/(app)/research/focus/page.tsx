import Link from "next/link";
import { requireWorkspace } from "@/server/access";
import { focusV2Library } from "@/server/research/focus-v2-service";
import { FocusV2Workbench } from "@/components/research/focus-v2-workbench";
import "@/components/research/research.css";

export default async function ResearchFocusPage({ searchParams }: { searchParams: Promise<{ accounts?: string }> }) {
  const { workspace, session, role } = await requireWorkspace();
  const query = await searchParams;
  const library = await focusV2Library({ workspaceId: workspace.id, userId: session.user.id });
  const initialAccountIds = (query.accounts || "").split(",").filter(Boolean).slice(0, 3);
  return <main className="research-focus-page"><nav className="research-breadcrumb" aria-label="面包屑"><Link href="/research">研究中心</Link><span>/</span><span>专项研究</span></nav>
    <header className="research-page-heading"><div><span className="research-eyebrow">研究一个问题 · 比较作品和账号</span><h1>把一个问题研究明白。</h1><p>从已经读懂的作品出发，比较做法、反例与变化；重要结论都能回到单条作品。</p></div></header>
    <FocusV2Workbench library={library} initialAccountIds={initialAccountIds} canWrite={role !== "VIEWER"} /></main>;
}
