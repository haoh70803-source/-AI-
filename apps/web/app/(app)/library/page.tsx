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
import "@/components/library/asset-library.css";
import "@/components/library/feishu-library.css";

type Source = Awaited<ReturnType<typeof listLibrarySources>>["items"][number];
const types: Array<[string, string, LucideIcon]> = [["", "全部", FileText], ["DOCUMENT", "文档", FileText], ["IMAGE", "图片", ImageIcon], ["VIDEO", "视频", Video], ["AUDIO", "音频", AudioLines], ["URL", "链接", Link2], ["TEXT", "文字", FileText]];

function href(query: LibraryQuery & { layout?: string; upload?: string }, updates: Record<string, string>) {
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

export default async function LibraryPage({ searchParams }: { searchParams: Promise<LibraryQuery & { layout?: string; upload?: string }> }) {
  const { workspace, role } = await requireWorkspace();
  const query = await searchParams;
  const result = await listLibrarySources(workspace.id, { ...query, pageSize: "30", ...(query.view === "RECENT" ? { sort: "newest" } : {}) });
  const canManage = role !== "VIEWER";
  return <div className="asset-library-page">
    <LibraryPoller active={result.items.some((item) => state(item).busy)} />
    <header className="asset-library-header"><div><span className="asset-library-eyebrow"><FileText size={16} />你的内容资产</span><h1>资料库</h1><p>让视频、文档和灵感，在这里汇聚。</p></div><div className="feishu-library-header-actions"><Link href="/library/feishu" className="feishu-library-entry"><Link2 size={14}/>飞书资料</Link>{canManage ? <IngestDialog initialOpen={query.upload === "1"} /> : null}</div></header>
    <nav className="asset-library-views" aria-label="资料范围">{[["ALL", "全部资料"], ["RECENT", "最近加入"], ["ARCHIVED", "已归档"]].map(([value, label]) => <Link key={value} href={href(query, { view: value === "ARCHIVED" ? "ALL" : value!, status: value === "ARCHIVED" ? "ARCHIVED" : "", page: "1" })} aria-current={(query.status === "ARCHIVED" ? "ARCHIVED" : query.view || "ALL") === value ? "page" : undefined}>{label}</Link>)}</nav>
    <LibraryToolbar count={result.total} />
    <nav className="asset-library-types" aria-label="资料类型">{types.map(([value, label, Icon]) => <Link key={value} href={href(query, { sourceType: value, page: "1" })} aria-current={(query.sourceType || "") === value ? "page" : undefined}><Icon size={14} />{label}</Link>)}</nav>
    {result.items.length ? <section className={`asset-library-grid ${query.layout === "LIST" ? "is-list" : ""}`} aria-label="资料列表">{result.items.map((item) => <AssetCard key={item.id} item={item} canManage={canManage && item.sourceProvider !== "FEISHU"} />)}</section> : <section className="asset-library-empty"><FileText size={38} strokeWidth={1} /><h2>{query.search ? "没有找到相关资料" : "这里还没有资料"}</h2><p>{query.search ? "换个关键词试试，或清除搜索查看全部资料。" : "添加一份文档、一段视频，或记下一个灵感。"}</p>{query.search ? <Link href={href(query, { search: "", page: "1" })}>清除搜索</Link> : canManage ? <IngestDialog /> : null}</section>}
    {result.pages > 1 ? <nav className="asset-library-pagination" aria-label="分页">{result.page > 1 ? <Link href={href(query, { page: String(result.page - 1) })}>上一页</Link> : <span>上一页</span>}<span>{result.page} / {result.pages}</span>{result.page < result.pages ? <Link href={href(query, { page: String(result.page + 1) })}>下一页</Link> : <span>下一页</span>}</nav> : null}
  </div>;
}
