import { AudioLines, FileText, ImageIcon, Link2, Video, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { IngestDialog } from "@/components/library/ingest-dialog";
import { LibraryCardAction, LibraryCardMenu } from "@/components/library/library-card-controls";
import { LibraryPoller } from "@/components/library/library-poller";
import { LibraryToolbar } from "@/components/library/library-toolbar";
import { AssetThumbnail } from "@/components/library/asset-thumbnail";
import { sourceDisplayName } from "@/lib/content-production";
import { getSourceProcessingState } from "@/lib/source-processing-state";
import { requireWorkspace } from "@/server/access";
import { listLibrarySources, type LibraryQuery } from "@/server/library";
import { getProjectListView } from "@/server/sidebar/service";
import { listArtifacts } from "@/server/artifacts/service";
import "@/components/library/asset-library.css";
import "@/components/library/feishu-library.css";

type Source = Awaited<ReturnType<typeof listLibrarySources>>["items"][number];
const types: Array<[string, string, LucideIcon]> = [["", "全部", FileText], ["DOCUMENT", "文档", FileText], ["IMAGE", "图片", ImageIcon], ["VIDEO", "视频", Video], ["AUDIO", "音频", AudioLines], ["URL", "链接", Link2], ["TEXT", "文字", FileText]];

function href(query: LibraryQuery & { layout?: string; upload?: string; content?: string }, updates: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...updates })) if (value) params.set(key, value);
  return `/library?${params}`;
}
function state(item: Source) { return getSourceProcessingState({ sourceStatus: item.status, hasTranscript: item.sourceType === "VIDEO" || item.sourceType === "AUDIO" ? Boolean(item.transcript) : Boolean(item.transcript || item.rawText?.trim()), assets: item.assets, jobs: item.ingestJobs }); }

function AssetCard({ item, canManage }: { item: Source; canManage: boolean }) {
  const [, label, Icon] = types.find(([value]) => value === item.sourceType) || types[0]!;
  const title = sourceDisplayName({ title: item.title, platformLabel: label, createdAt: item.createdAt });
  const processing = state(item);
  const status = item.status === "FAILED" ? "处理失败" : item.status === "ARCHIVED" ? "已归档" : processing.busy ? processing.libraryLabel : "";
  return <article className={`asset-library-card type-${item.sourceType.toLowerCase()}`}>
    <Link href={`/library/${item.id}`} className="asset-library-card-link" aria-label={title}>
      <div className={`asset-library-preview ${item.thumbnailUrl ? "has-image" : ""}`}>
        {item.thumbnailUrl ? <AssetThumbnail src={item.thumbnailUrl} /> : <><div className="asset-paper asset-paper-back" /><div className="asset-paper"><Icon size={30} strokeWidth={1.25} /><i /><i /><i /></div></>}
        <span className="asset-type-badge"><Icon size={12} />{label}</span>
        {status ? <span className={`asset-processing ${item.status === "FAILED" ? "is-failed" : ""}`}>{status}</span> : null}
      </div>
      <div className="asset-library-card-copy"><h2>{title}</h2><p>{item.author || label}</p><time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleDateString("zh-CN")}</time></div>
    </Link>
    {canManage ? <LibraryCardMenu sourceId={item.id} title={title} archived={item.status === "ARCHIVED"} /> : null}
    <div className="asset-library-card-action"><LibraryCardAction href={`/library/${item.id}`} processing={processing.busy} /></div>
  </article>;
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<LibraryQuery & { layout?: string; upload?: string; content?: string }> }) {
  const { workspace, session, role } = await requireWorkspace();
  const query = await searchParams;
  const result = await listLibrarySources(workspace.id, { ...query, pageSize: "30", ...(query.view === "RECENT" ? { sort: "newest" } : {}) });
  const canManage = role !== "VIEWER";
  const projects = await getProjectListView({ workspaceId: workspace.id, userId: session.user.id });
  const recentProjects = projects.recent.slice(0,12);
  const artifactGroups = await Promise.all(recentProjects.map(async project => ({ project, items: await listArtifacts({ workspaceId: workspace.id, userId: session.user.id, projectId: project.projectId }) })));
  const artifacts = artifactGroups.flatMap(({ project, items }) => items.map(item => ({ item, project }))).filter(({ item, project }) => !query.search || `${item.title} ${project.label}`.includes(query.search)).slice(0,30);
  const content = query.content === "artifacts" ? "artifacts" : query.content === "materials" ? "materials" : "all";
  return <div className="asset-library-page">
    <LibraryPoller active={result.items.some((item) => state(item).busy)} />
    <header className="asset-library-header"><div><span className="asset-library-eyebrow">YOUR CREATIVE LIBRARY</span><h1>内容中心</h1><p>每一份资料，每一个成果，都有自己的位置。</p></div><div className="feishu-library-header-actions">{canManage ? <IngestDialog initialOpen={query.upload === "1"} /> : null}</div></header>
    <section className="xin-content-banner"><img src="/brand/experience/horizon.png" alt="品牌地平线视觉"/><div><span>YOUR MATERIALS / YOUR ARTIFACTS</span><h2>向新而行。</h2><p>资料成为线索，成果值得留下。</p><Link href="/projects">回到项目继续创作 →</Link></div></section>
    <nav className="asset-library-views xin-content-tabs" aria-label="内容类型">{[["all","全部"],["artifacts","成果"],["materials","资料"]].map(([value,label]) => <Link key={value} href={href(query,{ content:value!,page:"1" })} aria-current={content === value ? "page" : undefined}>{label}</Link>)}<span aria-disabled="true" title="目前没有资料与成果的统一收藏接口">收藏 · 未接入</span></nav>
    <LibraryToolbar count={content === "artifacts" ? artifacts.length : result.total} />
    <details className="xin-content-tools"><summary>资料来源、知识与筛选</summary>
    <Link href="/library/methods">管理可选技能 →</Link>
    <nav className="asset-library-views" aria-label="资料中心视图"><Link href="/library" aria-current="page">原始资料</Link><Link href="/library/feishu">飞书知识</Link><Link href="/knowledge">知识条目</Link><Link href="/knowledge/facts">已确认事实</Link><Link href="/ip-context">品牌与 IP 背景</Link></nav>
    <nav className="asset-library-views" aria-label="资料范围">{[["ALL", "全部资料"], ["RECENT", "最近加入"], ["ARCHIVED", "已归档"]].map(([value, label]) => <Link key={value} href={href(query, { view: value === "ARCHIVED" ? "ALL" : value!, status: value === "ARCHIVED" ? "ARCHIVED" : "", page: "1" })} aria-current={(query.status === "ARCHIVED" ? "ARCHIVED" : query.view || "ALL") === value ? "page" : undefined}>{label}</Link>)}</nav>
    <nav className="asset-library-types" aria-label="资料类型">{types.map(([value, label, Icon]) => <Link key={value} href={href(query, { sourceType: value, page: "1" })} aria-current={(query.sourceType || "") === value ? "page" : undefined}><Icon size={14} />{label}</Link>)}</nav>
    </details>
    {content !== "materials" && artifacts.length ? <section className={`asset-library-grid ${query.layout === "LIST" ? "is-list" : ""}`} aria-label="最近项目成果">{artifacts.map(({item,project}) => <article className="asset-library-card" key={item.artifactId}><Link className="asset-library-card-link" href={`/dashboard?project=${encodeURIComponent(project.projectId)}&node=artifact:${encodeURIComponent(item.artifactId)}`}><div className="asset-library-preview xin-artifact-preview"><FileText size={32}/><span className="asset-type-badge">文本成果</span></div><div className="asset-library-card-copy"><h2>{item.title}</h2><p>{project.label}</p><small>打开成果继续编辑 →</small></div></Link></article>)}</section> : content === "artifacts" ? <section className="asset-library-empty"><h2>{query.search ? "没有找到相关成果" : "最近项目暂无成果"}</h2><p>这里只展示最近 12 个项目的前 30 份可访问成果。</p><Link href="/projects">浏览全部项目 →</Link></section> : null}
    {content !== "artifacts" ? result.items.length ? <section className={`asset-library-grid ${query.layout === "LIST" ? "is-list" : ""}`} aria-label="资料列表">{result.items.map((item) => <AssetCard key={item.id} item={item} canManage={canManage && item.sourceProvider !== "FEISHU"} />)}</section> : <section className="asset-library-empty"><FileText size={38} strokeWidth={1} /><h2>{query.search ? "没有找到相关资料" : "这里还没有资料"}</h2><p>{query.search ? "换个关键词试试，或清除搜索查看全部资料。" : "添加一份文档、一段视频，或记下一个灵感。"}</p>{query.search ? <Link href={href(query, { search: "", page: "1" })}>清除搜索</Link> : canManage ? <IngestDialog /> : null}</section> : null}
    {result.pages > 1 ? <nav className="asset-library-pagination" aria-label="分页">{result.page > 1 ? <Link href={href(query, { page: String(result.page - 1) })}>上一页</Link> : <span>上一页</span>}<span>{result.page} / {result.pages}</span>{result.page < result.pages ? <Link href={href(query, { page: String(result.page + 1) })}>下一页</Link> : <span>下一页</span>}</nav> : null}
  </div>;
}
