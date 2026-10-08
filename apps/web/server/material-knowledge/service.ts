import "server-only";

import { createHash } from "node:crypto";
import { db, type EvidenceType, type Prisma } from "@content-center/db";
import { z } from "zod";
import { AIControlService } from "../ai/control/ai-control-service";
import { ActionPermissionPolicy } from "../ai/control/action-permission";
import type { ContextBuilderV2Result } from "../ai/control/context-builder-v2";
import type { ContextManifest, ContextOwnership, WorkspaceRoleName } from "../ai/control/contracts";

const categories = ["NUMBER", "FACT", "CASE", "VIEWPOINT", "ORGANIZATION", "PRODUCT_SERVICE", "EXPERIENCE", "COMMERCIAL_COMMITMENT", "OTHER"] as const;
const normalizedEnum = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess((value) => typeof value === "string" ? value.trim().toUpperCase() : value, z.enum(values));
const candidateSchema = z.object({ content: z.string().trim().min(1).max(1_000), category: normalizedEnum(categories), ownership: normalizedEnum(["OWN", "EXTERNAL", "UNKNOWN"]).optional(), excerpt: z.string().trim().min(1).max(1_000), segmentIndex: z.number().int().nonnegative().optional(), confidence: z.number().min(0).max(1) }).strict();
export const materialKnowledgeExtractionSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return { candidates: value };
  const wrapper = record(value);
  return Object.keys(wrapper).length === 1 && Array.isArray(wrapper.items) ? { candidates: wrapper.items } : value;
}, z.object({ candidates: z.array(candidateSchema).max(30) }).strict());
const categoryType: Record<(typeof categories)[number], EvidenceType> = { NUMBER: "DATA", FACT: "FACT", CASE: "CASE", VIEWPOINT: "VIEWPOINT", ORGANIZATION: "ORGANIZATION", PRODUCT_SERVICE: "PRODUCT_SERVICE", EXPERIENCE: "EXPERIENCE", COMMERCIAL_COMMITMENT: "COMMERCIAL_COMMITMENT", OTHER: "OTHER" };
export const candidateLabels: Record<EvidenceType, string> = { DATA: "数字", FACT: "事实", CASE: "案例", VIEWPOINT: "观点", ORGANIZATION: "公司信息", PRODUCT_SERVICE: "公司信息", EXPERIENCE: "经历", COMMERCIAL_COMMITMENT: "其他", QUOTE: "观点", QUESTION: "其他", OTHER: "其他" };

export class MaterialKnowledgeError extends Error {
  constructor(readonly code: "SOURCE_NOT_FOUND" | "SOURCE_NOT_READY" | "CANDIDATE_NOT_FOUND" | "PERMISSION_DENIED" | "INVALID_INPUT", message: string) { super(message); this.name = "MaterialKnowledgeError"; }
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function normalized(value: string) { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s，,。；;：:！？!?、“”‘’（）()《》【】\-—]/gu, ""); }
export function resolveMaterialOwnership(source: { sourceProvider: string | null; sourceType: string; sourcePlatform: string; projects: Array<{ role: string }> }) {
  if (source.projects.some(({ role }) => role === "OWN_MATERIAL")) return "OWN" as const;
  if (source.sourceProvider === "REDFOX" || source.sourceType === "URL" || source.sourcePlatform !== "GENERIC") return "EXTERNAL" as const;
  return "UNKNOWN" as const;
}
function segments(value: unknown) { return Array.isArray(value) ? value.flatMap((item, index) => { const row = record(item); return typeof row.text === "string" ? [{ index, text: row.text, startMs: typeof row.startMs === "number" ? row.startMs : null, endMs: typeof row.endMs === "number" ? row.endMs : null }] : []; }) : []; }

async function roleFor(workspaceId: string, userId: string) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
  if (!member) throw new MaterialKnowledgeError("PERMISSION_DENIED", "当前账号不能处理这条资料。");
  return member.role as WorkspaceRoleName;
}

export async function getMaterialKnowledge(input: { workspaceId: string; userId: string; sourceItemId: string }) {
  const role = await roleFor(input.workspaceId, input.userId);
  const source = await db.sourceItem.findFirst({ where: { id: input.sourceItemId, workspaceId: input.workspaceId }, include: { transcript: true, projects: { select: { role: true } }, materialAnalyses: { orderBy: { version: "desc" }, take: 1 }, evidenceItems: { orderBy: { createdAt: "asc" }, include: { confirmedBy: { select: { name: true } }, rejectedBy: { select: { name: true } } } }, ingestJobs: { orderBy: { createdAt: "desc" }, take: 10 } } });
  if (!source) throw new MaterialKnowledgeError("SOURCE_NOT_FOUND", "资料不存在。");
  const analysis = source.materialAnalyses[0]; const extractionRun = await db.aIRun.findFirst({ where: { workspaceId: input.workspaceId, action: "MATERIAL_KNOWLEDGE_EXTRACTION", inputSummary: { path: ["sourceItemId"], equals: source.id } }, orderBy: { createdAt: "desc" }, select: { status: true, errorCode: true } });
  const busy = source.ingestJobs.some(({ status }) => status === "QUEUED" || status === "RUNNING") || analysis?.status === "PROCESSING" || extractionRun?.status === "RUNNING";
  const sourceFailed = source.status === "FAILED"; const extractionFailed = extractionRun?.status === "FAILED"; const hasText = Boolean(source.transcript?.fullText.trim() || source.rawText?.trim());
  const status = busy ? "PROCESSING" : source.evidenceItems.length ? source.evidenceItems.some(({ status }) => status === "PENDING") ? "REVIEW" : "COMPLETE" : extractionFailed || sourceFailed ? "FAILED" : hasText ? "READY_TO_EXTRACT" : "WAITING";
  return { source: { id: source.id, title: source.title || "未命名资料", sourceType: source.sourceType, ownership: resolveMaterialOwnership(source), hasTranscript: Boolean(source.transcript?.fullText.trim()), transcript: source.transcript ? { fullText: source.transcript.fullText, segments: segments(source.transcript.segments) } : null }, status, employeeStatus: status === "PROCESSING" ? "正在整理内容" : status === "FAILED" ? "整理失败，可以重新试一次。" : status === "REVIEW" ? "等待确认" : status === "COMPLETE" ? "已整理" : status === "READY_TO_EXTRACT" ? "正在识别关键信息" : source.sourceType === "VIDEO" && !source.transcript ? "正在转成文字" : "正在获取资料", summary: analysis?.summary ?? null, candidates: source.evidenceItems.map((item) => ({ id: item.id, projectId: item.projectId, content: item.claim || item.note || item.excerpt || "", originalExcerpt: item.excerpt || "", category: candidateLabels[item.type], ownership: item.ownership, ownershipLabel: item.ownership === "OWN" ? "内部资料" : item.ownership === "EXTERNAL" ? "外部来源" : "归属待判断", status: item.status, statusLabel: item.ownership === "EXTERNAL" ? "外部参考" : item.status === "PENDING" ? "待确认" : item.status === "CONFIRMED" ? "已确认" : "不采用", canConfirm: role !== "VIEWER" && item.ownership === "OWN" && item.status === "PENDING", canReject: role !== "VIEWER" && item.status === "PENDING", locator: item.locator, confirmedBy: item.confirmedBy?.name ?? null, confirmedAt: item.confirmedAt?.toISOString() ?? null })) };
}

export async function extractMaterialKnowledge(input: { workspaceId: string; userId: string; sourceItemId: string }, dependencies: { controlService?: AIControlService } = {}) {
  const role = await roleFor(input.workspaceId, input.userId); if (role === "VIEWER") throw new MaterialKnowledgeError("PERMISSION_DENIED", "当前权限可以查看整理结果，但不能重新整理。");
  const source = await db.sourceItem.findFirst({ where: { id: input.sourceItemId, workspaceId: input.workspaceId }, include: { transcript: true, projects: { select: { projectId: true, role: true } }, materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1 } } });
  if (!source) throw new MaterialKnowledgeError("SOURCE_NOT_FOUND", "资料不存在。");
  const fullText = source.transcript?.fullText.trim() || source.rawText?.trim() || ""; if (!fullText) throw new MaterialKnowledgeError("SOURCE_NOT_READY", "资料文字内容尚未准备好。");
  const sourceOwnership = resolveMaterialOwnership(source); const contextOwnership: ContextOwnership = sourceOwnership === "EXTERNAL" ? "EXTERNAL" : "PENDING"; const sourceSegments = segments(source.transcript?.segments);
  const contextTruncated = fullText.length > 40_000; const excerpt = fullText.slice(0, 40_000); const generatedAt = new Date().toISOString(); const projectId = source.projects[0]?.projectId ?? null;
  const manifestCore = { schemaVersion: "ai-context-manifest-v1" as const, generatedAt, project: { id: projectId, version: source.updatedAt.toISOString() }, currentDraft: null, selectedObjects: [], methodVersions: [], creatorProfile: null, confirmedInformationRefs: [], sourceRefs: [source.id], externalRefs: sourceOwnership === "EXTERNAL" ? [source.id] : [], conversationMessageRefs: [], items: [{ objectType: "SOURCE_ITEM", objectId: source.id, version: source.transcript?.updatedAt.toISOString() ?? source.updatedAt.toISOString(), ownership: contextOwnership, provenance: source.sourceProvider || source.sourcePlatform, whySelected: "资料自动整理", truncated: contextTruncated, content: excerpt }], truncation: { any: contextTruncated, categories: { SOURCE_ITEM: contextTruncated } } };
  const manifest: ContextManifest = { ...manifestCore, manifestId: createHash("sha256").update(JSON.stringify(manifestCore)).digest("hex").slice(0, 24) };
  const preparedContext = { context: { source: { id: source.id, title: source.title, type: source.sourceType, ownership: sourceOwnership }, transcript: { text: excerpt, segments: sourceSegments.slice(0, 500) }, analysisSummary: source.materialAnalyses[0]?.summary ?? null, boundary: "只抽取原材料真实表达，不补充、不推断、不改变来源归属。" }, snapshot: null, ownFacts: [], hasOwnEvidence: false, hasOwnCaseOrData: false, ownContribution: "NONE", hasOwnBackground: false, contextTruncated, selectedMethods: [], defaultMethod: null, inputSummary: { sourceItemId: source.id, sourceType: source.sourceType, ownership: sourceOwnership, contentCharacters: fullText.length }, manifest } as unknown as ContextBuilderV2Result;
  const run = await (dependencies.controlService ?? new AIControlService()).execute({ workspaceId: input.workspaceId, userId: input.userId, projectId: projectId ?? undefined, taskType: "MATERIAL_KNOWLEDGE_EXTRACTION", requestedAction: "CREATE_RESEARCH_CANDIDATE", userInput: "从当前资料提取值得确认或引用的信息", preparedContext, action: "MATERIAL_KNOWLEDGE_EXTRACTION", operation: "MATERIAL_KNOWLEDGE_EXTRACTION", promptVersion: 1, inputSummary: (context) => context.inputSummary, metadata: () => ({ kind: "MATERIAL_KNOWLEDGE_EXTRACTION", sourceItemId: source.id, ownership: sourceOwnership }), auditMetadata: () => ({ sourceItemId: source.id, sourceOwnership }), generate: (provider) => provider.generateStructured({ systemPrompt: "只抽取材料明确表达的信息。禁止补数字、推断公司事实、把观点改成事实、把外部信息改成内部信息。每条必须提供原文摘录；视频优先提供真实 segmentIndex。", prompt: `资料：\n${excerpt}\n\n返回候选信息。`, structuredOutput: { preferJsonSchema: true, schemaName: "material_knowledge_candidates" } }, materialKnowledgeExtractionSchema) });
  const output = run.output as z.infer<typeof materialKnowledgeExtractionSchema>; const projectScopes = source.projects.length ? source.projects.map(({ projectId: id }) => id) : [null]; let created = 0;
  for (const candidate of output.candidates.slice(0, 8)) {
    const segment = candidate.segmentIndex === undefined ? null : sourceSegments[candidate.segmentIndex]; const originalExcerpt = segment?.text || candidate.excerpt; if (!fullText.includes(originalExcerpt)) continue;
    const locator = segment ? { kind: "TRANSCRIPT_SEGMENT", segmentIndex: segment.index, startMs: segment.startMs, endMs: segment.endMs, excerpt: originalExcerpt } : { kind: source.sourceType === "URL" ? "WEB_EXCERPT" : "SOURCE_EXCERPT", excerpt: originalExcerpt };
    for (const candidateProjectId of projectScopes) {
      const dedupeKey = createHash("sha256").update(`${source.id}|${candidateProjectId ?? "workspace"}|${candidate.category}|${normalized(candidate.content)}`).digest("hex");
      const existing = await db.evidenceItem.findUnique({ where: { dedupeKey } }); if (existing) continue;
      await db.evidenceItem.create({ data: { workspaceId: input.workspaceId, projectId: candidateProjectId, sourceItemId: source.id, type: categoryType[candidate.category], excerpt: originalExcerpt, claim: candidate.content, ownership: sourceOwnership, status: sourceOwnership === "EXTERNAL" ? "CONFIRMED" : "PENDING", locator: json(locator), confidence: candidate.confidence, dedupeKey, createdById: input.userId } }); created += 1;
    }
  }
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "material_knowledge.extracted", resourceType: "source_item", resourceId: source.id, metadata: json({ aiRunId: run.id, ownership: sourceOwnership, candidateCount: output.candidates.length, createdCount: created }) } });
  return { runId: run.id, created, ownership: sourceOwnership, state: await getMaterialKnowledge(input) };
}

export async function decideMaterialCandidate(input: { workspaceId: string; userId: string; sourceItemId: string; candidateId: string; decision: "CONFIRM" | "REJECT"; content?: string }) {
  const role = await roleFor(input.workspaceId, input.userId); const candidate = await db.evidenceItem.findFirst({ where: { id: input.candidateId, workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, status: "PENDING" } });
  if (!candidate) throw new MaterialKnowledgeError("CANDIDATE_NOT_FOUND", "这条信息不存在或已经处理。");
  const action = input.decision === "CONFIRM" ? "CONFIRM_OWN_INFORMATION" : "CREATE_RESEARCH_CANDIDATE"; const permission = new ActionPermissionPolicy().evaluate({ role, action, userConfirmed: input.decision === "CONFIRM" });
  if (permission.decision !== "ALLOW") throw new MaterialKnowledgeError("PERMISSION_DENIED", "当前权限可以查看信息，但不能确认或不采用。");
  if (input.decision === "CONFIRM" && candidate.ownership !== "OWN") throw new MaterialKnowledgeError("INVALID_INPUT", "只有明确属于内部资料的信息才能确认使用。");
  const finalContent = input.content?.trim() || candidate.claim || candidate.note || candidate.excerpt || ""; if (!finalContent || finalContent.length > 1_000) throw new MaterialKnowledgeError("INVALID_INPUT", "请检查确认后的内容。");
  const now = new Date(); const updated = await db.$transaction(async (tx) => {
    const row = await tx.evidenceItem.update({ where: { id: candidate.id }, data: input.decision === "CONFIRM" ? { claim: finalContent, status: "CONFIRMED", confirmedById: input.userId, confirmedAt: now, rejectedById: null, rejectedAt: null } : { status: "REJECTED", rejectedById: input.userId, rejectedAt: now, confirmedById: null, confirmedAt: null } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: input.decision === "CONFIRM" ? "material_knowledge.confirmed" : "material_knowledge.rejected", resourceType: "evidence_item", resourceId: row.id, metadata: json({ sourceItemId: input.sourceItemId, projectId: row.projectId, originalContent: candidate.claim, finalContent: input.decision === "CONFIRM" ? finalContent : null, originalExcerpt: candidate.excerpt, edited: finalContent !== candidate.claim }) } }); return row;
  });
  return { id: updated.id, status: updated.status, content: updated.claim };
}
