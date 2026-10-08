import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { ResearchBlock } from "@content-center/core";
import { requireWorkspace } from "@/server/access";
import { getResearchResult, researchProjectOptions } from "@/server/research/read-model";
import { ResearchError } from "@/server/research/access";
import { ResearchBlocks } from "@/components/research/research-blocks";
import { getLegacyResearchResult } from "@/server/research/legacy";
import { ResearchUseFindings } from "@/components/research/research-use-findings";
import { workCreationChoices } from "@/server/research/work-research-service";
import { type WorkCreationChoices } from "@/components/research/work-creation-action";
import { researchScopeSchema, type ResearchScope } from "@/server/research/contracts";
import { ResearchCoverageSummary } from "@/components/research/research-coverage";

function ReadingPage({ id, kind, title, date, blocks, canWrite, continueHref, coverage, creation, saved = true, scope, manual = false }: { id: string; kind: "run" | "study"; title: string; date: Date; blocks: ResearchBlock[]; projects: Array<{ id: string; title: string }>; canWrite: boolean; continueHref: string; coverage: ReactNode; saved?: boolean; manual?: boolean; scope?: ResearchScope; creation?: { choices: WorkCreationChoices; sessionId: string } }) {
  return <article className="research-result-page research-reader-page">
    <nav className="research-breadcrumb" aria-label="面包屑"><Link href="/research">研究</Link><span>/</span><Link href={`/research/results${kind === "study" ? "?library=workspace" : ""}`}>保存的结论</Link><span>/</span><span>阅读</span></nav>
    <header className="research-page-heading"><div><span className="research-eyebrow">{manual ? "私人手工摘录 · 未调用 AI" : kind === "study" ? "工作空间历史研究" : saved ? "已保存 · 私人结论" : "私人研究 · 可随时继续"}</span><h1>{title}</h1><p>{date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" })} · {kind === "study" ? "按当时记录阅读，未重新采集" : "后续追问不会覆盖这份结果"}</p></div></header>
    <div className="research-result-actions"><Link className="research-button" href={continueHref}>{kind === "run" ? "继续研究" : "查看对标账号"}</Link><span className="research-caption">先读发现，原始内容就在旁边</span></div>
    <ResearchBlocks blocks={blocks} prefix={id} afterLead={coverage} reader={{ resultId: id, kind, canWrite, continueHref, sessionId: creation?.sessionId, scope }} />
    <ResearchUseFindings key={kind+":"+id} kind={kind} resultId={id} canWrite={canWrite} />
  </article>;
}

export default async function ResultPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "run" && kind !== "study") notFound();
  const { workspace, session, role } = await requireWorkspace();
  const actor = { workspaceId: workspace.id, userId: session.user.id };
  try {
    if (kind === "study") {
      const [result, projects] = await Promise.all([getLegacyResearchResult(actor, id), researchProjectOptions(actor)]);
      return <ReadingPage id={id} kind={kind} title={result.title} date={result.createdAt} blocks={result.blocks} projects={projects} canWrite={role !== "VIEWER"} continueHref={`/research/benchmarks/${result.accountId}`} coverage={<section className="research-coverage-summary"><header><h2>历史样本范围</h2><span>保存时记录</span></header><p><strong>{result.sampleCount}</strong> 条保存样本 · <strong>{result.traceableCount}</strong> 条仍可追溯资料；不代表账号全量。</p></section>} />;
    }
    const [result, projects, choices] = await Promise.all([getResearchResult(actor, id, { includeUnsaved: true }), researchProjectOptions(actor), workCreationChoices(actor)]);
    return <ReadingPage id={id} kind={kind} title={result.resultTitle || result.question} date={result.savedAt ?? result.finishedAt ?? result.createdAt} manual={Boolean(result.coverage && typeof result.coverage === "object" && !Array.isArray(result.coverage) && result.coverage.manualClipping === true)} saved={Boolean(result.savedAt)} scope={researchScopeSchema.safeParse(result.inputScope).data} blocks={result.blocks} projects={projects} canWrite={role !== "VIEWER"} continueHref={`/research/session/${result.sessionId}`} creation={{ choices, sessionId: result.sessionId }} coverage={<ResearchCoverageSummary value={result.coverage} />} />;
  } catch (error) {
    if (error instanceof ResearchError && error.status === 404) notFound();
    throw error;
  }
}
