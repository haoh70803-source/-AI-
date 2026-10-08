import Link from "next/link";
import { ResearchError } from "@/server/research/access";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/server/access";
import { newsReadModel } from "@/server/research/news/service";
import { ResearchNews } from "@/components/research/research-news";
import "@/components/research/research-news.css";
type Params = { projectId?: string; entry?: string; accounts?: string | string[]; trend?: string; material?: string };
export default async function ResearchDaily({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  if (params.entry || params.accounts || params.material || params.trend || params.projectId) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
    redirect("/research/new?" + query.toString());
  }
  const { workspace, session } = await requireWorkspace();
  const initial = await newsReadModel({ workspaceId: workspace.id, userId: session.user.id }).catch(error => {
    if (error instanceof ResearchError && error.code === "FORBIDDEN") return null;
    throw error;
  });
  if (!initial) return <section className="fusion-research-gate"><p className="fusion-eyebrow">RESEARCH CENTER</p><h1>从一个研究问题开始</h1><p>当前资讯入口仅对已授权的管理员开放。你可以使用研究工作台创建自己的研究任务。</p><Link href="/research/new">新建研究 →</Link><Link href="/research/results">查看研究记录 →</Link></section>;
  return <ResearchNews initial={initial} />;
}
