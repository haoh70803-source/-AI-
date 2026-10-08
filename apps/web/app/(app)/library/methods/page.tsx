import { SkillManagement } from "@/components/library/skill-management";
import { BookOpenCheck, Search, ArrowRight } from "lucide-react";
import Link from "next/link";
import { WorkflowSkillImport } from "@/components/library/workflow-skill-import";
import { requireWorkspace } from "@/server/access";
import { listMethods } from "@/server/methods/service";
export default async function MethodsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { session, workspace, role } = await requireWorkspace();
  const keyword = (await searchParams).q?.trim().slice(0,200) || "";
  const methods = await listMethods({ workspaceId: workspace.id, ownerUserId: session.user.id });
  const visible = methods.filter(method => !keyword || [method.current.title, ...method.current.steps].join(" ").toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
  return <div className="method-center-page v3-page v3-skill-page skills-import-only">
    <header className="method-center-header v3-page-header"><div><h1>Skill</h1><p>导入 Markdown 技能文件，在创作时选择使用。</p></div><div className="v3-skill-primary-actions">{role !== "VIEWER" ? <WorkflowSkillImport /> : null}</div></header>
    <section className="v3-skill-toolbar"><h2>我的 Skill <span className="text-sm text-[var(--text-secondary)]">{methods.length}</span></h2><form method="get" className="v3-skill-search"><label htmlFor="method-search"><Search size={16}/><input id="method-search" name="q" defaultValue={keyword} placeholder="搜索 Skill 名称或内容" /></label><button type="submit">搜索</button></form></section>
    {visible.length ? <div className="method-card-grid v3-skill-grid">{visible.map(method => <article key={method.id} className="method-card"><div className="method-card-body"><BookOpenCheck size={22}/><h3>{method.current.title}</h3><p>{method.current.steps[0] || "已保存的 Skill"}</p><footer><Link href={`/library/methods/${method.id}`}>查看内容</Link>{method.status !== "DISABLED" && role !== "VIEWER" ? <Link href={`/dashboard?skill=${encodeURIComponent(method.current.id)}`}>去使用 <ArrowRight size={14}/></Link> : <small>{method.status === "DISABLED" ? "已停用" : "只读"}</small>}</footer>{role !== "VIEWER" ? <SkillManagement id={method.id} title={method.current.title} disabled={method.status === "DISABLED"}/> : null}</div></article>)}</div> : <div className="method-empty"><BookOpenCheck size={28}/><h2>{keyword ? "没有匹配的 Skill" : "还没有 Skill"}</h2><p>{keyword ? "换个关键词，或清除搜索。" : "点击右上角“导入 Markdown”，预览确认后保存即可使用。"}</p>{keyword ? <Link href="/library/methods">清除搜索</Link> : null}</div>}
  </div>;
}
