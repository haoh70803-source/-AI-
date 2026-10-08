import { ArrowRight, FileText, Lightbulb, Plus, Search } from "lucide-react";
import Link from "next/link";
import { requireWorkspace } from "@/server/access";
import { listIdeas } from "@/server/discovery/service";

const statusLabel: Record<string, string> = {
  INBOX: "待整理",
  DRAFT: "待整理",
  READY: "已整理",
  IN_PROGRESS: "进行中",
  DONE: "已完成",
};

export default async function IdeaLibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { workspace } = await requireWorkspace();
  const query = await searchParams;
  const keyword = query.q?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const status = query.status ?? "ALL";
  const ideas = await listIdeas(workspace.id, 100);
  const visible = ideas.filter((idea) => {
    const matchesSearch = !keyword || [idea.title, idea.description, idea.aiRationale].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(keyword);
    return matchesSearch && (status === "ALL" || idea.status === status);
  });

  function href(nextStatus: string) {
    const params = new URLSearchParams();
    if (keyword) params.set("q", query.q ?? "");
    if (nextStatus !== "ALL") params.set("status", nextStatus);
    return `/discovery/ideas?${params.toString()}`;
  }

  return <div className="v3-page v3-idea-library">
    <header className="v3-page-header"><div><Link href="/discovery" className="v3-idea-back">研究</Link><h1>选题库</h1><p>保存研究中形成的选题，继续补充依据或进入创作。</p></div><Link href="/discovery"><Plus size={17} />研究新选题</Link></header>
    <section className="v3-idea-toolbar">
      <nav>{([["ALL", "全部"], ["INBOX", "待整理"], ["READY", "已整理"], ["IN_PROGRESS", "进行中"], ["DONE", "已完成"]] as const).map(([value, label]) => <Link key={value} href={href(value)} aria-current={status === value ? "page" : undefined}>{label}<span>{value === "ALL" ? ideas.length : ideas.filter((idea) => idea.status === value).length}</span></Link>)}</nav>
      <form method="get">{status !== "ALL" ? <input type="hidden" name="status" value={status} /> : null}<label><Search size={16} /><input name="q" defaultValue={query.q} placeholder="搜索选题" /></label><button>搜索</button></form>
    </section>
    <section className="v3-idea-results"><header><h2>选题</h2><span>{visible.length} 个结果</span></header>{visible.length ? <div>{visible.map((idea) => <Link key={idea.id} href={idea.projectId ? `/dashboard?project=${idea.projectId}` : `/discovery/ideas/${idea.id}`}><header><span><Lightbulb size={18} /></span><em>{statusLabel[idea.status] || idea.status}</em></header><h3>{idea.title}</h3><p>{idea.description || (typeof idea.aiRationale === "string" ? idea.aiRationale : null) || "继续补充资料和判断，把这个方向整理成可执行的内容。"}</p><footer><span><FileText size={13} />{idea._count.references} 条参考</span><strong>{idea.projectId ? "继续创作" : "继续研究"}<ArrowRight size={14} /></strong></footer></Link>)}</div> : <div className="project-library-empty"><span><Lightbulb size={22} /></span><h2>还没有符合条件的选题</h2><p>从真实资料、对标研究或趋势中保存第一个选题。</p><Link href="/discovery">开始研究</Link></div>}</section>
  </div>;
}
