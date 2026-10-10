import "server-only";
import Link from "next/link";
import { db } from "@content-center/db";
import { getProjectListView } from "@/server/sidebar/service";

export async function FusionOverview({ workspaceId, userId }: { workspaceId: string; userId: string }) {
  const [projects, sources, skills, members] = await Promise.all([
    getProjectListView({ workspaceId, userId }),
    db.sourceItem.count({ where: { workspaceId, status: { not: "ARCHIVED" } } }),
    db.methodAsset.count({ where: { workspaceId, ownerUserId: userId, status: { not: "DISABLED" } } }),
    db.workspaceMember.count({ where: { workspaceId, disabledAt: null, user: { disabledAt: null } } }),
  ]);
  const projectCount = new Set([...projects.ungrouped, ...projects.folders.flatMap(folder => folder.projects)].map(item => item.projectId)).size;
  const recentDetails = await db.contentProject.findMany({ where: { workspaceId, id: { in: projects.recent.slice(0, 4).map(project => project.projectId) } }, select: { id: true, status: true, _count: { select: { artifacts: true, sources: true } } } });
  const details = new Map(recentDetails.map(project => [project.id, project]));
  const covers = ["horizon.png", "architecture.svg", "editorial.svg", "research.svg"];
  const metrics = [{ label: "我的项目", value: projectCount, href: "/projects" }, { label: "团队资料", value: sources, href: "/library" }, { label: "可用 Skill", value: skills, href: "/library/methods" }, { label: "有效成员", value: members, href: "/settings/members" }];
  return <section className="fusion-overview" aria-label="工作区概览">
    <section className="xin-recent-projects" aria-labelledby="xin-recent-title"><header><div><h2 id="xin-recent-title">回到你的创作</h2><small>RECENT PROJECTS</small></div><Link href="/projects">查看全部 →</Link></header>
      {projects.recent.length ? <div className="xin-recent-grid">{projects.recent.slice(0, 4).map((project, index) => { const item = details.get(project.projectId); return <Link href={project.href} className="xin-recent-card" key={project.projectId}><div className="xin-project-cover" style={{ backgroundImage: `url(/brand/experience/${covers[index]})` }} aria-hidden="true"><span>PROJECT / {String(index + 1).padStart(2, "0")}</span></div><div className="xin-project-info"><h3>{project.label}</h3><p><span>{item?._count.sources ?? 0} 份引用资料</span><time dateTime={project.recentAt}>{project.recentAt.slice(0, 10)} 更新</time></p><footer><span>{item?._count.artifacts ?? 0} 个成果</span><span>{item?.status === "APPROVED" ? "已完成" : item?.status === "ARCHIVED" ? "已归档" : "继续创作 →"}</span></footer></div></Link>; })}</div> : <p className="fusion-empty">这里还没有项目。点击开启新项目，添加资料后开始你的第一项创作。</p>}
    </section>
    <div className="fusion-recent xin-feature-project"><div className="xin-feature-art" aria-hidden="true"/><div><p className="xin-eyebrow">MADE WITH XIN WORLD</p><h2>从灵感的一瞬，<br/>到作品的每一面。</h2><p>让资料有出处，让成果可修改。<br/>在项目里与 AI 持续完成工作。</p><Link href="/projects">打开项目工作区 →</Link></div></div>
    <details className="xin-home-support"><summary>工作区数据与流程</summary><div className="fusion-metrics">{metrics.map(metric => <Link href={metric.href} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>查看详情 ↗</small></Link>)}</div>
    <div className="fusion-flow"><header><h2>连接你的创作流程</h2><small>按需使用</small></header><Link href="/library"><b>01</b><span>整理资料<small>文本、文件与可追溯来源</small></span><span>↗</span></Link><Link href="/research/new"><b>02</b><span>开展研究<small>明确问题，再选择采用的结果</small></span><span>↗</span></Link><Link href="/topics"><b>03</b><span>推进选题<small>评分、事实核验与人工审核</small></span><span>↗</span></Link><Link href="/knowledge/facts"><b>04</b><span>确认事实<small>让内容判断有据可查</small></span><span>↗</span></Link></div></details>


  </section>;
}
