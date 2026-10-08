/* finesse · register=product · shell=cover-led-creative-project-library · palette=continued-cobalt-cool-slate · density=5 */
import { Button } from "@content-center/ui";
import { ArrowRight, ArrowUpDown, ChevronDown, FileText, Filter, Folder, FolderOpen, Search, Sparkles } from "lucide-react";
import { db } from "@content-center/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderLibrary } from "@/components/projects/folder-library";
import { ProjectLibrarySync } from "@/components/projects/project-library-sync";
import { getProjectListView } from "@/server/sidebar/service";
import type { ProjectListView } from "@/server/sidebar/view-model";
import "@/components/projects/folder-library.css";
import { ProjectCardMenuWithLifecycle as ProjectCardMenu } from "@/components/projects/project-card-menu-with-lifecycle";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { AssetThumbnail } from "@/components/library/asset-thumbnail";
import { ProjectFilterMenu } from "@/components/projects/project-filter-menu";
import { requireWorkspace } from "@/server/access";
import { listProjects, type ProjectListQuery } from "@/server/project-service";
import "@/components/projects/project-library-reference.css";

type ListedProject = Awaited<ReturnType<typeof listProjects>>["items"][number];
type EmployeeState = { key: "ACTIVE" | "UNSTARTED" | "DONE"; label: "进行中" | "草稿" | "已完成" };
type ProjectView = "ALL" | "ARCHIVED" | EmployeeState["key"];

function employeeState(item: ListedProject): EmployeeState {
  if (item.status === "APPROVED" || item.status === "ARCHIVED") return { key: "DONE", label: "已完成" };
  if (item.status === "DRAFT" && !item.motherContent?.body.trim() && !item.creativeBrief?.coreMessage.trim()) return { key: "UNSTARTED", label: "草稿" };
  return { key: "ACTIVE", label: "进行中" };
}

function queryHref(query: ProjectListQuery, updates: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...updates })) if (value) params.set(key, value);
  return `/projects?${params.toString()}`;
}

function coverVariant(item: ListedProject) {
  let hash = 0;
  for (const character of `${item.id}:${item.title}`) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % 6;
}

function isToday(date: Date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function editedAt(date: Date) {
  return isToday(date)
    ? `最近编辑：今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : `最近编辑：${date.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" })}`;
}

function createdAt(date: Date) {
  return `创建于：${date.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" })}`;
}

function projectSummary(item: ListedProject) {
  return item.description || item.goal || item.creativeBrief?.coreMessage || "从一个想法开始，把它继续写成完整内容。";
}

function ProjectCover({ item, state, compact = false, showStatus = true }: { item: ListedProject; state: EmployeeState; compact?: boolean; showStatus?: boolean }) {
  const thumbnail = item.sources.find(({ sourceItem }) => sourceItem.thumbnailUrl)?.sourceItem.thumbnailUrl;
  return <div className={`project-library-cover cover-${coverVariant(item)} ${compact ? "is-compact" : ""}`}>
    <div className="project-folder-paper" aria-hidden="true">{thumbnail ? <AssetThumbnail src={thumbnail} /> : <FileText size={32} strokeWidth={1.2} />}</div>
    {showStatus ? <em>{item.status === "ARCHIVED" ? "已归档" : state.label}</em> : null}
  </div>;
}

function ProjectCard({ item, canEdit, showStatus, organization }: { item: ListedProject; canEdit: boolean; showStatus: boolean; organization?: ProjectListView }) {
  const state = employeeState(item);
  const href = `/dashboard?project=${item.id}`;
  return <article className={`project-library-card is-${state.key.toLowerCase()}`}>
    <Link href={href} className="project-card-cover-wrap" aria-label={`打开项目：${item.title}`}>
      <ProjectCover item={item} state={state} showStatus={showStatus} />
    </Link>
    <div className="project-library-card-body">
      <h3><Link href={href}>{item.title}</Link></h3>
      <p>{projectSummary(item)}</p>
      <div className="project-card-facts"><span><Folder size={12} />{item._count.sources} 份资料</span><span><Sparkles size={12} />{item._count.evidenceItems} 条依据</span></div>
      <footer>
        <time dateTime={item.updatedAt.toISOString()}>{state.key === "UNSTARTED" ? createdAt(item.createdAt) : editedAt(item.updatedAt)}</time>
        <ProjectCardMenu projectId={item.id} title={item.title} archived={item.status === "ARCHIVED"} canManage={canEdit} folders={organization?.folders} folderId={organization?.folders.find((folder) => folder.projects.some((project) => project.projectId === item.id))?.folderId ?? null} />
      </footer>
    </div>
  </article>;
}

function EndedProjectCard({ item, canEdit, showStatus }: { item: ListedProject; canEdit: boolean; showStatus: boolean }) {
  const href = `/dashboard?project=${item.id}`;
  return <article className="project-ended-card">
    <ProjectCover item={item} state={{ key: "DONE", label: "已完成" }} compact showStatus={showStatus} />
    <div>
      {showStatus ? <span>已结束</span> : null}
      <h3><Link href={href}>{item.title}</Link></h3>
      <time dateTime={item.updatedAt.toISOString()}>{editedAt(item.updatedAt)}</time>
    </div>
    {canEdit ? <ProjectCardMenu projectId={item.id} title={item.title} ended /> : null}
    <ArrowRight className="project-ended-arrow" size={16} aria-hidden="true" />
  </article>;
}

function ProjectSection({ title, items, canEdit, ended = false, showStatus = false, organization }: { title: string; items: ListedProject[]; canEdit: boolean; ended?: boolean; showStatus?: boolean; organization?: ProjectListView }) {
  if (!items.length) return null;
  return <section className={`project-library-section ${ended ? "is-ended" : ""}`} aria-labelledby={`project-section-${ended ? "done" : title}`}>
    <header><h2 id={`project-section-${ended ? "done" : title}`}>{title}</h2><span>{items.length} 个创作任务</span></header>
    <div className={ended ? "project-ended-grid" : "project-library-grid"}>
      {items.map((item) => ended ? <EndedProjectCard key={item.id} item={item} canEdit={canEdit} showStatus={showStatus} /> : <ProjectCard key={item.id} item={item} canEdit={canEdit} showStatus={showStatus} organization={organization} />)}
    </div>
  </section>;
}

function ProjectEmpty({ view, hasProjects, search, canEdit, query }: { view: ProjectView; hasProjects: boolean; search: string; canEdit: boolean; query: ProjectListQuery }) {
  const title = search ? "没有找到相关创作"
    : !hasProjects ? "还没有创作，从一个想法开始吧"
      : view === "ACTIVE" ? "暂时没有正在进行的创作"
        : view === "UNSTARTED" ? "暂时没有未开始的创作"
          : view === "DONE" ? "暂时没有已结束的创作"
            : "当前没有可展示的创作";
  const description = search ? "可以换一个关键词，或清除搜索后查看全部创作。" : canEdit ? "从右上角新建创作，或通过创作菜单将已有内容移入此文件夹。" : "此处会显示已创建并归入当前分组的创作。";
  return <section className="project-library-empty">
    <span><FolderOpen size={24} /></span>
    <h2>{title}</h2>
    <p>{description}</p>
    <div>{search ? <Button variant="secondary" asChild><Link href={queryHref(query, { search: "", page: "1" })}>清除搜索</Link></Button> : null}</div>
  </section>;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<ProjectListQuery> }) {
  const { session, workspace, role } = await requireWorkspace();
  const query = await searchParams;
  const organization = await getProjectListView({ workspaceId: workspace.id, userId: session.user.id });
  if (!query.folder && query.view !== "all" && !query.status) return <><ProjectLibrarySync /><FolderLibrary initialView={organization} search={query.search} sort={query.sort} /></>;
  const selectedFolder = query.folder && query.folder !== "ungrouped" ? organization.folders.find((folder) => folder.folderId === query.folder) : null;
  if (query.folder && query.folder !== "ungrouped" && !selectedFolder) notFound();
  const folderLabel = query.folder === "ungrouped" ? "未分组" : selectedFolder?.label;
  const showAssets = Boolean(folderLabel) && query.tab === "assets";
  const folderProjects = selectedFolder?.projects || (query.folder === "ungrouped" ? organization.ungrouped : []);
  const assets = showAssets ? await db.sourceItem.findMany({ where: { workspaceId: workspace.id, status: { not: "ARCHIVED" }, projects: { some: { projectId: { in: folderProjects.map((project) => project.projectId) } } }, ...(query.search?.trim() ? { title: { contains: query.search.trim(), mode: "insensitive" as const } } : {}) }, select: { id: true, title: true, sourceType: true, thumbnailUrl: true }, orderBy: { updatedAt: "desc" } }) : [];
  const view = typeof query.status === "string" && ["ALL", "ACTIVE", "UNSTARTED", "DONE", "ARCHIVED"].includes(query.status) ? query.status as ProjectView : "ALL";
  const result = await listProjects(workspace.id, { ...query, sort: query.sort || "updated", status: view === "ALL" ? undefined : view, pageSize: "30" }, query.folder ? { userId: session.user.id, folderId: selectedFolder?.folderId ?? null } : undefined);
  const items = result.items;
  const visibleItems = items;
  const canEdit = role !== "VIEWER";
  const hasProjects = result.total > 0 || Boolean(query.search);

  return <div className={`project-library-page v3-page v3-projects-page reference-project-library ${folderLabel ? "is-folder-detail" : ""}`}>
    <ProjectLibrarySync />
    <nav className="project-library-breadcrumb" aria-label="面包屑"><Link href="/projects">项目库</Link><span>›</span><strong>{folderLabel || "全部创作"}</strong></nav>
    {!folderLabel ? <header className="project-library-header v3-page-header">
      <div><h1>{folderLabel || "全部创作"}</h1><p>{folderLabel ? "此文件夹中的创作，点击卡片进入创作界面。" : "浏览所有创作，或从项目库按文件夹查看。"}</p></div>
      {canEdit && !showAssets ? <NewProjectButton folderId={selectedFolder?.folderId} returnTo={query.folder ? `/projects?folder=${encodeURIComponent(query.folder)}` : "/projects?view=all"} label="新建创作" /> : null}
    </header> : <h1 className="sr-only">{folderLabel}</h1>}
    {folderLabel ? <nav className="folder-detail-tabs" aria-label="文件夹内容"><Link href={queryHref(query, { tab: "", page: "1", search: "" })} aria-current={!showAssets ? "page" : undefined}>创作页</Link><Link href={queryHref(query, { tab: "assets", page: "1", status: "ALL", search: "" })} aria-current={showAssets ? "page" : undefined}>引用资料</Link>{canEdit && !showAssets ? <NewProjectButton folderId={selectedFolder?.folderId} returnTo={`/projects?folder=${encodeURIComponent(query.folder!)}`} label="新建创作" /> : null}</nav> : null}

    {showAssets ? <section className="folder-assets"><p>汇总此文件夹内创作引用的资料，同一份资料只展示一次。</p><div>{assets.map((asset) => <Link href={`/library/${asset.id}`} key={asset.id}>{asset.thumbnailUrl ? <AssetThumbnail src={asset.thumbnailUrl} /> : <FileText size={30} />}<strong>{asset.title || "未命名资料"}</strong><span>查看资料 →</span></Link>)}</div>{!assets.length ? <div className="folder-library-empty"><FileText size={36} /><h2>还没有引用资料</h2><p>进入一个创作添加资料后，会自动汇总到这里。</p></div> : null}</section> : <>
    <div className="project-library-commandbar">
      <nav aria-label="项目状态">{([ ["ALL", "全部"], ["ACTIVE", "进行中"], ["UNSTARTED", "草稿"], ["DONE", "已完成"], ["ARCHIVED", "已归档"] ] as const).map(([value, label]) => <Link key={value} href={queryHref(query, { status: value, page: "1" })} aria-current={view === value ? "page" : undefined}>{label}</Link>)}</nav>
      <form method="get">
        <input type="hidden" name="status" value={view} />
        <input type="hidden" name="view" value="all" />
        {query.folder ? <input type="hidden" name="folder" value={query.folder} /> : null}
        <input type="hidden" name="sort" value={query.sort || "updated"} />
        {query.review ? <input type="hidden" name="review" value={query.review} /> : null}
        <label><Search size={16} /><input name="search" defaultValue={query.search} aria-label="搜索创作" placeholder="搜索创作" /></label>
        <ProjectFilterMenu className="v3-project-sort"><summary><ArrowUpDown size={15} />{query.sort === "created" ? "最近创建" : query.sort === "name" ? "名称排序" : "最近编辑"}<ChevronDown size={14} /></summary><div><Link href={queryHref(query, { sort: "updated", page: "1" })}>最近编辑</Link><Link href={queryHref(query, { sort: "created", page: "1" })}>最近创建</Link><Link href={queryHref(query, { sort: "name", page: "1" })}>名称排序</Link></div></ProjectFilterMenu>
        <ProjectFilterMenu className="v3-project-filter"><summary><Filter size={15} />筛选<ChevronDown size={14} /></summary><div><Link href={queryHref(query, { review: "", page: "1" })}>全部项目</Link><Link href={queryHref(query, { review: "pending", page: "1" })}>待人工审核</Link></div></ProjectFilterMenu>
        <button type="submit" className="sr-only">应用</button>
      </form>
    </div>

    {query.review === "pending" ? <div className="project-library-notice"><span>当前仅显示有平台内容待人工审核的创作任务。</span><Link href="/projects">清除筛选</Link></div> : null}

    <div className="project-library-content">
      {visibleItems.length ? view === "ALL" ? <ProjectSection title="创作页" items={items} canEdit={canEdit} showStatus organization={organization} />
        : <ProjectSection title={view === "ACTIVE" ? "进行中" : view === "UNSTARTED" ? "草稿" : view === "ARCHIVED" ? "已归档" : "已完成"} items={visibleItems} canEdit={canEdit} showStatus organization={organization} />
        : <ProjectEmpty view={view} hasProjects={hasProjects} search={query.search?.trim() || ""} canEdit={canEdit} query={query} />}
    </div>

    {result.pages > 1 ? <nav aria-label="分页" className="project-library-pagination"><Link aria-disabled={result.page <= 1} className={result.page <= 1 ? "is-disabled" : ""} href={queryHref(query, { page: String(result.page - 1) })}>上一页</Link><span>第 {result.page} / {result.pages} 页</span><Link aria-disabled={result.page >= result.pages} className={result.page >= result.pages ? "is-disabled" : ""} href={queryHref(query, { page: String(result.page + 1) })}>下一页</Link></nav> : null}
    </>}
  </div>;
}
