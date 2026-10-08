import { ResearchSourceNotes } from "@/components/research/research-source-notes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/access";
import { ResearchError } from "@/server/research/access";
import { researchSourceDetail } from "@/server/research/read-model";
import { ResearchSourceActions } from "@/components/research/research-source-actions";
import { researchSourceLabel } from "@/components/research/research-labels";
export default async function SourceReading({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, { workspace, session, role } = await requireWorkspace();
  try {
    const { source, content, read, followed, clippings, topics } = await researchSourceDetail({ workspaceId: workspace.id, userId: session.user.id }, id);
    return <article className="research-result-page research-source-reader"><nav className="research-breadcrumb"><Link href="/research">日报 / 来源</Link><span>/ 阅读来源</span></nav>
      <header className="research-page-heading"><div><span className="research-eyebrow">原资料 · {source.sourceType}</span><h1>{researchSourceLabel(source.title, source.sourceType)}</h1><p>入库 {source.createdAt.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })} · 不代表原作品发布日期</p></div></header>
      <ResearchSourceActions id={id} read={read} followed={followed} />
      <section className="research-source-card"><h2>快速了解</h2><p>{source.description || content?.contentText.replace(/\s+/g, " ").slice(0, 360) || "暂无可读正文。"}</p><small>{source.description ? "来源描述" : content ? "原内容摘录，未做 AI 总结" : "请检查原件或补充正文"}</small></section>
      <section className="research-source-card"><h2>{content?.contentSource === "SOURCE_UNDERSTANDING" ? "已有机器识别文字 · 需核对原件" : content?.contentSource === "TRANSCRIPT" ? "机器文字稿" : "已保存原内容"}</h2>{content ? <pre className="research-source-original">{content.contentText}</pre> : <p>当前没有可读文字；不会根据标题推测内容。</p>}<Link href={"/library/" + id}>查看完整资料与附件 →</Link></section>
      <ResearchSourceNotes key={id} sourceId={id} title={researchSourceLabel(source.title, source.sourceType)} canWrite={role !== "VIEWER"} readable={Boolean(content)} clippings={clippings} topics={topics} />
      <section className="research-source-card"><h2>继续理解这份内容</h2><p>提出要研究的问题；进度、追问和报告只留在研究中。完成后可明确选择发现及目标项目，再到创作区审阅发送。</p><Link className="research-button research-primary" href={"/research/new?entry=BREAKDOWN&material=" + encodeURIComponent(id)}>拆解 / 深入研究</Link><Link className="research-button" href="/research/results">查看收藏的研究与历史</Link></section>
    </article>;
  } catch (cause) { if (cause instanceof ResearchError && cause.status === 404) notFound(); throw cause; }
}
