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
import { factState } from "../content-governance/policy";
import type { ConfirmedOwnFact } from "../ai/creation-context";





export type ReferenceActor = { workspaceId: string; userId: string; projectId: string };
export interface KnowledgeContextAdapter {
  retrieve(input: ReferenceActor & { knowledgeBaseId: string; query: string }): Promise<{ status: "unsupported" | "ready"; items: ContextItem[] }>;
}
export const knowledgeContextAdapter: KnowledgeContextAdapter = {
  async retrieve(actor) {
    await assertReferenceProject(actor);
    // KNOWLEDGE identifies a versioned KnowledgeEntry, not an unrestricted whole-workspace search.
    const entry = await db.knowledgeEntry.findFirst({ where: { id: actor.knowledgeBaseId, workspaceId: actor.workspaceId, confidentiality: "INTERNAL", retiredAt: null } });
    if (!entry) throw new AIControlError("PERMISSION_DENIED", "知识条目不存在、已归档或不可用于共享项目。");
    const source = await db.sourceItem.findFirst({ where: { id: entry.sourceItemId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } });
    if (!source || !await getMaterialReadableContent({ ...actor, sourceItemId: source.id })) throw new AIControlError("PERMISSION_DENIED", "知识来源已失效或授权不可用。");
    return { status: "ready", items: [{ objectType: "KNOWLEDGE", objectId: entry.id, version: entry.version, ownership: "EXTERNAL", provenance: "knowledge_entry_snapshot", whySelected: "用户明确引用的知识版本，尚不等于我方事实", truncated: false,
      content: JSON.stringify({ title: entry.title, body: entry.body, sourceItemId: entry.sourceItemId, sourceHash: entry.sourceHash, sourceVersion: (entry.sourceSnapshot as { updatedAt?: unknown } | null)?.updatedAt ?? null }),
      source: { sourceType: "KNOWLEDGE", sourceId: entry.id, title: entry.title, href: "/knowledge", generated: true, version: entry.version } }] };
  },
};

/** Reuse the governed fact lifecycle, only for explicitly supplied or project-associated sources. */
export async function loadConfirmedProjectFacts(actor: ReferenceActor, references: ContextReference[]) {
  await assertReferenceProject(actor);
  const [bindings, evidence] = await Promise.all([
    db.projectSource.findMany({ where: { projectId: actor.projectId, sourceItem: { workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } } }, select: { sourceItemId: true } }),
    db.evidenceItem.findMany({ where: { workspaceId: actor.workspaceId, projectId: actor.projectId, status: "CONFIRMED" }, select: { locator: true } }),
  ]);
  const sourceIds = [...new Set([...bindings.map(row => row.sourceItemId), ...references.filter(ref => ref.sourceType === "MATERIAL").map(ref => ref.sourceId)])];
  const knowledgeIds = references.filter(ref => ref.sourceType === "KNOWLEDGE").map(ref => ref.sourceId);
  const factIds = evidence.flatMap(row => { const value = row.locator as { factRecordId?: unknown } | null; return typeof value?.factRecordId === "string" ? [value.factRecordId] : []; });
  if (!sourceIds.length && !knowledgeIds.length && !factIds.length) return { facts: [] as ConfirmedOwnFact[], items: [] as ContextItem[] };
  const rows = await db.factRecord.findMany({ where: { workspaceId: actor.workspaceId, retiredAt: null, knowledge: { workspaceId: actor.workspaceId, confidentiality: "INTERNAL", retiredAt: null }, OR: [{ id: { in: factIds } }, { knowledgeId: { in: knowledgeIds } }, { knowledge: { sourceItemId: { in: sourceIds } } }] },
    include: { knowledge: true, confirmations: { orderBy: { createdAt: "desc" }, include: { approvals: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40 });
  const facts: ConfirmedOwnFact[] = [], items: ContextItem[] = [];
  const readable = new Map<string, boolean>();
  for (const row of rows) {
    if (factState(row) !== "CONFIRMED") continue;
    if (!readable.has(row.knowledge.sourceItemId)) {
      const source = await db.sourceItem.findFirst({ where: { id: row.knowledge.sourceItemId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } });
      readable.set(row.knowledge.sourceItemId, Boolean(source && await getMaterialReadableContent({ ...actor, sourceItemId: source.id })));
    }
    if (!readable.get(row.knowledge.sourceItemId)) continue;
    facts.push({ text: row.claim, source: "PROJECT_EVIDENCE", kind: "FACT", sourceId: row.id });
    items.push({ objectType: "FACT_RECORD", objectId: row.id, version: `${row.knowledge.version}:${row.confirmations[0]!.id}`, ownership: "OWN_CONFIRMED", provenance: "governed_fact_record", whySelected: "当前项目或明确引用的来源，双确认且有效", truncated: false,
      content: JSON.stringify({ claim: row.claim, category: row.category, validUntil: row.validUntil, knowledgeId: row.knowledgeId, knowledgeVersion: row.knowledge.version, sourceItemId: row.knowledge.sourceItemId, sourceHash: row.knowledge.sourceHash, confirmationId: row.confirmations[0]!.id }) });
  }
  return { facts, items };
}

export async function assertReferenceProject(actor: ReferenceActor) {
  await researchMember(actor);
  const project = await db.contentProject.findFirst({ where: { id: actor.projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!project) throw new AIControlError("PERMISSION_DENIED");
}

export async function searchContextReferences(actor: ReferenceActor, query: string): Promise<ReferenceOption[]> {
  await assertReferenceProject(actor);
  const q = query.trim().slice(0, 100);
  const title = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const [materials, research, artifacts, accounts, trends, knowledge] = await Promise.all([
    db.sourceItem.findMany({ where: { workspaceId: actor.workspaceId, title }, select: { id: true, title: true, description: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    listResearchResults(actor, q),
    db.artifact.findMany({ where: { workspaceId: actor.workspaceId, projectId: actor.projectId, title, draftBranch: { deletedAt: null } }, select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true, name: title }, select: { id: true, name: true, platform: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.trendSnapshot.findMany({ where: { workspaceId: actor.workspaceId, title }, orderBy: { observedAt: "desc" }, take: 8 }),
    db.knowledgeEntry.findMany({ where: { workspaceId: actor.workspaceId, title, retiredAt: null, confidentiality: "INTERNAL" }, select: { id: true, title: true, version: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return [
    ...knowledge.map(entry => ({ sourceType: "KNOWLEDGE" as const, sourceId: entry.id, title: entry.title, href: "/knowledge", generated: true, version: entry.version, description: "知识条目；不自动视为我方事实" })),
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
      else {
        if (ref.sourceVersion !== undefined && result.items.some(item => String(item.version) !== String(ref.sourceVersion))) throw new AIControlError("NO_CONTEXT", "知识版本已变化，请重新选择引用。");
        items.push(...result.items.map(item => ({ ...item, source: item.source ? { ...item.source, scope: ref.scope, sourceVersion: item.version ?? undefined } : item.source })));
      }
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
    const version = source.version ?? source.updatedAt ?? null;
    if (ref.sourceVersion !== undefined && String(ref.sourceVersion) !== String(version)) throw new AIControlError("NO_CONTEXT", "引用来源版本已变化，请重新选择后继续。");
    source.sourceVersion = version ?? undefined;
    items.push({ objectType: ref.sourceType === "MATERIAL" ? "SOURCE_ITEM" : ref.sourceType, objectId: ref.sourceId, version, ownership: "EXTERNAL", provenance: "explicit_reference", whySelected: "用户明确选择的引用范围", truncated: false, content, source });
  }
  return { items, warnings };
}
