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
  const metrics = [{ label: "进行中的项目", value: projectCount, href: "/projects" }, { label: "团队资料", value: sources, href: "/library" }, { label: "可用 Skill", value: skills, href: "/library/methods" }, { label: "有效成员", value: members, href: "/settings" }];
  return <section className="fusion-overview" aria-label="工作区概览">
    <div className="fusion-metrics">{metrics.map(metric => <Link href={metric.href} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>查看详情 ↗</small></Link>)}</div>
    <div className="fusion-overview-panels"><div className="fusion-recent"><header><h2>最近的项目</h2><Link href="/projects">全部项目 ↗</Link></header>{projects.recent.length ? <ul>{projects.recent.slice(0, 4).map(project => <li key={project.projectId}><Link href={project.href}><span>{project.label}</span><time dateTime={project.recentAt}>{project.recentAt.slice(0, 10)}</time></Link></li>)}</ul> : <p className="fusion-empty">这里还没有项目。从上方写下你的创作需求，或在侧栏创建空白项目。</p>}</div>
    <div className="fusion-flow"><header><h2>连接你的创作流程</h2><small>按需使用</small></header><Link href="/library"><b>01</b><span>整理资料<small>文本、文件与可追溯来源</small></span><span>↗</span></Link><Link href="/research/new"><b>02</b><span>开展研究<small>明确问题，再选择采用的结果</small></span><span>↗</span></Link><Link href="/topics"><b>03</b><span>推进选题<small>评分、事实核验与人工审核</small></span><span>↗</span></Link><Link href="/knowledge/facts"><b>04</b><span>确认事实<small>让内容判断有据可查</small></span><span>↗</span></Link></div></div>
  </section>;
}
