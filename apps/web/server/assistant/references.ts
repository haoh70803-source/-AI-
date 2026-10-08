import type { ContextReference, SourceReference, ReferenceOption } from "../../lib/contracts/references";
export type { ReferenceType, ContextReference, SourceReference, ReferenceOption } from "../../lib/contracts/references";
import "server-only";
import { db } from "@content-center/db";
import { AIControlError, type ContextItem } from "../ai/control/contracts";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import { ArtifactContextAdapter } from "../artifacts/context-adapter";
import { getResearchResult, getSelectedResearch, listResearchResults } from "../research/read-model";
import { researchMember } from "../research/access";
import { trendStableKey } from "../research/trends";





export type ReferenceActor = { workspaceId: string; userId: string; projectId: string };
export interface KnowledgeContextAdapter {
  retrieve(input: ReferenceActor & { knowledgeBaseId: string; query: string }): Promise<{ status: "unsupported" | "ready"; items: ContextItem[] }>;
}
export const knowledgeContextAdapter: KnowledgeContextAdapter = { async retrieve() { return { status: "unsupported", items: [] }; } };

export async function assertReferenceProject(actor: ReferenceActor) {
  await researchMember(actor);
  const project = await db.contentProject.findFirst({ where: { id: actor.projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!project) throw new AIControlError("PERMISSION_DENIED");
}

export async function searchContextReferences(actor: ReferenceActor, query: string): Promise<ReferenceOption[]> {
  await assertReferenceProject(actor);
  const q = query.trim().slice(0, 100);
  const title = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const [materials, research, artifacts, accounts, trends] = await Promise.all([
    db.sourceItem.findMany({ where: { workspaceId: actor.workspaceId, title }, select: { id: true, title: true, description: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    listResearchResults(actor, q),
    db.artifact.findMany({ where: { workspaceId: actor.workspaceId, projectId: actor.projectId, title, draftBranch: { deletedAt: null } }, select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true, name: title }, select: { id: true, name: true, platform: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.trendSnapshot.findMany({ where: { workspaceId: actor.workspaceId, title }, orderBy: { observedAt: "desc" }, take: 8 }),
  ]);
  return [
    ...materials.map(r => ({ sourceType: "MATERIAL" as const, sourceId: r.id, title: r.title || "未命名资料", href: `/library/${r.id}`, generated: false, updatedAt: r.updatedAt.toISOString(), description: r.description?.slice(0, 100) || "资料" })),
    ...research.slice(0, 8).map(r => ({ sourceType: "RESEARCH" as const, sourceId: r.id, title: r.resultTitle || r.question, href: `/research/results/run/${r.id}`, generated: true, version: r.version, description: "已保存的私人研究" })),
    ...artifacts.map(r => ({ sourceType: "ARTIFACT" as const, sourceId: r.id, title: r.title, href: `/dashboard?project=${actor.projectId}&node=artifact:${r.id}`, generated: true, updatedAt: r.updatedAt.toISOString(), description: "当前项目成果" })),
    ...accounts.map(r => ({ sourceType: "BENCHMARK" as const, sourceId: r.id, title: r.name, href: `/research/benchmarks/${r.id}`, generated: false, description: r.platform })),
    ...trends.map(r => ({ sourceType: "TREND" as const, sourceId: r.id, title: r.title, href: `/research/trends/${trendStableKey(r)}`, generated: false, updatedAt: r.observedAt.toISOString(), description: `${r.platform} · 已保存趋势` })),
  ];
}

export async function resolveContextReferences(actor: ReferenceActor, references: ContextReference[], options: { query?: string; knowledgeAdapter?: KnowledgeContextAdapter } = {}) {
  await assertReferenceProject(actor);
  const items: ContextItem[] = [];
  const warnings: string[] = [];
  for (const ref of [...new Map(references.map(r => [`${r.sourceType}:${r.sourceId}`, r])).values()]) {
    if (ref.researchSelection && ref.sourceType !== "RESEARCH") throw new AIControlError("PERMISSION_DENIED", "结论选择只能用于研究引用。");
    let source: SourceReference;
    let content: string;
    if (ref.sourceType === "KNOWLEDGE") {
      const result = await (options.knowledgeAdapter ?? knowledgeContextAdapter).retrieve({ ...actor, knowledgeBaseId: ref.sourceId, query: options.query || "" });
      if (result.status === "unsupported") warnings.push("知识库尚未配置，本次未使用。");
      else items.push(...result.items);
      continue;
    }
    if (ref.sourceType === "MATERIAL") {
      // Scope metadata first; the Material boundary alone decides which body is readable.
      const row = await db.sourceItem.findFirst({ where: { id: ref.sourceId, workspaceId: actor.workspaceId }, select: { id: true, title: true, sourceUrl:true,sourceProvider:true } });
      if (!row) throw new AIControlError("PERMISSION_DENIED", "引用的资料不存在或不可访问。");
      const readable = await getMaterialReadableContent({ ...actor, sourceItemId: row.id });
      if (!readable) { warnings.push(`${row.title}：当前资料暂无可供 AI 使用的正文。`); continue; }
      source = { ...ref, title: row.title || "未命名资料", href: row.sourceProvider === "FEISHU" && row.sourceUrl ? row.sourceUrl : `/library/${row.id}`, generated: readable.contentSource === "SOURCE_UNDERSTANDING", version: readable.version, updatedAt: readable.updatedAt.toISOString() };
      content = readable.contentText;
    } else if (ref.sourceType === "RESEARCH") {
      if (ref.researchSelection) {
        const selected = await getSelectedResearch(actor, ref.researchSelection.kind, ref.sourceId, ref.researchSelection).catch(() => { throw new AIControlError("PERMISSION_DENIED", "选中的研究结论不存在、已变化或不可访问。"); });
        source = { ...ref, title: selected.title, href: `/research/results/${ref.researchSelection.kind}/${ref.sourceId}`, generated: true, version: selected.version };
        content = JSON.stringify({ blocks: selected.blocks, note: "用户为本次对话挑选/调整的结论；原研究保持不变" });
      } else {
      const row = await getResearchResult(actor, ref.sourceId).catch(() => { throw new AIControlError("PERMISSION_DENIED", "研究成果不存在或不可访问。"); });
      source = { ...ref, title: row.resultTitle || row.question, href: `/research/results/run/${row.id}`, generated: true, version: row.version, updatedAt: row.createdAt.toISOString() };
      const coverage = row.coverage && typeof row.coverage === "object" && !Array.isArray(row.coverage) ? row.coverage as Record<string, unknown> : {};
      // Put the saved conclusions ahead of large evidence snapshots so the context budget cannot discard the Result.
      content = JSON.stringify({ question: row.question, blocks: row.blocks.filter(block => block.type !== "sources"), scope: row.inputScope, coverage: { observed: coverage.observed, readable: coverage.readable, aiSampleCount: coverage.aiSampleCount, gaps: coverage.gaps }, sourceRefs: row.sourceRefs });
      }
    } else if (ref.sourceType === "ARTIFACT") {
      const resolved = await new ArtifactContextAdapter().resolve({ ...actor, artifactId: ref.sourceId });
      const body = JSON.parse(resolved.item.content) as { title: string; content: string };
      source = { ...ref, title: body.title, href: `/dashboard?project=${actor.projectId}&node=artifact:${ref.sourceId}`, generated: true, version: resolved.item.version ?? undefined };
      content = body.content;
    } else if (ref.sourceType === "BENCHMARK") {
      const row = await db.benchmarkAccount.findFirst({ where: { id: ref.sourceId, workspaceId: actor.workspaceId, enabled: true }, select: { id: true, name: true, bio: true, platform: true, researchNotes: true, updatedAt: true } });
      if (!row) throw new AIControlError("PERMISSION_DENIED", "对标账号不存在或不可访问。");
      source = { ...ref, title: row.name, href: `/research/benchmarks/${row.id}`, generated: false, updatedAt: row.updatedAt.toISOString() };
      content = JSON.stringify({ name: row.name, bio: row.bio, platform: row.platform, notes: row.researchNotes });
    } else {
      const row = await db.trendSnapshot.findFirst({ where: { id: ref.sourceId, workspaceId: actor.workspaceId } });
      if (!row) throw new AIControlError("PERMISSION_DENIED", "趋势不存在或不可访问。");
      source = { ...ref, title: row.title, href: `/research/trends/${trendStableKey(row)}`, generated: false, updatedAt: row.observedAt.toISOString() };
      content = JSON.stringify({ title: row.title, rank: row.rank, metrics: row.metrics, windowStart: row.windowStart, windowEnd: row.windowEnd, observedAt: row.observedAt });
    }
    items.push({ objectType: ref.sourceType === "MATERIAL" ? "SOURCE_ITEM" : ref.sourceType, objectId: ref.sourceId, version: source.version ?? source.updatedAt ?? null, ownership: "EXTERNAL", provenance: "explicit_reference", whySelected: "用户本轮明确引用", truncated: false, content, source });
  }
  return { items, warnings };
}
