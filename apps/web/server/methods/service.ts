import "server-only";

import { db, type Prisma } from "@content-center/db";
import { materialAnalysisOutputSchema, type CurrentMaterialAnalysisOutput } from "../material-analysis/schemas";
import { benchmarkAnalysisOutputSchema, type BenchmarkCommonMethod } from "@content-center/providers";
import { materialDistillationGenerationSchema, type MaterialDistillationHighlight } from "@content-center/providers";
import { z } from "zod";
import { isDefaultContentMethodPayload } from "../default-content-method/schemas";
import { parseImportedSkill, workflowSkillPreview, type WorkflowSkillContract } from "../workflow-skill/contract";

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const methodContentSchema = z.object({
  title: requiredText(200),
  steps: z.array(requiredText(500)).min(1).max(8),
  applicableScenarios: z.array(requiredText(300)).min(1).max(8),
  boundaries: z.array(requiredText(300)).min(1).max(8),
}).strict();

const createMethodFromAnalysisSchema = methodContentSchema.extend({
  materialAnalysisId: z.string().trim().min(1).max(200),
  methodIndex: z.number().int().min(0).max(20),
}).strict();
const createMethodFromBenchmarkSchema = methodContentSchema.partial().extend({
  benchmarkStudyId: z.string().trim().min(1).max(200),
  methodIndex: z.number().int().min(0).max(20),
}).strict();
const createMethodFromDistillationSchema = methodContentSchema.partial().extend({
  materialDistillationId: z.string().trim().min(1).max(200),
  methodIndex: z.number().int().min(0).max(5),
}).strict();
export const createMethodSchema = z.union([createMethodFromAnalysisSchema, createMethodFromBenchmarkSchema, createMethodFromDistillationSchema]);

export const updateMethodSchema = methodContentSchema.extend({ expectedVersion: z.number().int().min(1), markdown: z.string().min(1).max(100_000).optional() }).strict();
export const methodStatusSchema = z.enum(["SAVED", "TRIAL", "CORE", "DISABLED"]);

export class MethodError extends Error {
  constructor(readonly code: "METHOD_INVALID" | "METHOD_NOT_FOUND" | "METHOD_VERSION_CONFLICT" | "METHOD_STATUS_INVALID" | "WORKFLOW_SKILL_INVALID", message: string) {
    super(message);
    this.name = "MethodError";
  }
}

type MethodEvidenceDTO = { quote: string; sampleId?: string; segmentIndex?: number; startMs?: number; endMs?: number };

export type MethodVersionDTO = {
  id: string;
  version: number;
  title: string;
  steps: string[];
  applicableScenarios: string[];
  boundaries: string[];
  evidence: MethodEvidenceDTO[];
  workflowContract: WorkflowSkillContract | null;
  source: {
    sourceItemId: string | null;
    title: string;
    platform: string | null;
    materialAnalysisId: string | null;
    transcriptId: string | null;
    transcriptUpdatedAt: string | null;
    stale: boolean;
    benchmarkStudyId: string | null;
    sourceMaterialDistillationId: string | null;
    benchmarkAccountName: string | null;
    sampleCount: number | null;
    samples: { sourceItemId: string; title: string }[];
  };
  editedBy: string;
  createdAt: string;
};

export type MethodDTO = {
  id: string;
  status: "SAVED" | "TRIAL" | "CORE" | "DISABLED";
  statusUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  current: MethodVersionDTO;
  history: MethodVersionDTO[];
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function strings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidence(value: Prisma.JsonValue): MethodEvidenceDTO[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.quote !== "string" || !candidate.quote.trim()) return [];
    return [{
      quote: candidate.quote,
      ...(typeof candidate.sampleId === "string" ? { sampleId: candidate.sampleId } : {}),
      ...(typeof candidate.segmentIndex === "number" ? { segmentIndex: candidate.segmentIndex } : {}),
      ...(typeof candidate.startMs === "number" ? { startMs: candidate.startMs } : {}),
      ...(typeof candidate.endMs === "number" ? { endMs: candidate.endMs } : {}),
    }];
  });
}

function evidenceMatchesTranscript(item: { quote: string; segmentIndex?: number }, transcript: { fullText: string; segments: Prisma.JsonValue }) {
  if (transcript.fullText.includes(item.quote)) return true;
  if (item.segmentIndex === undefined || !Array.isArray(transcript.segments)) return false;
  const segment = transcript.segments[item.segmentIndex];
  if (!segment || typeof segment !== "object" || Array.isArray(segment)) return false;
  const text = (segment as Record<string, unknown>).text;
  return typeof text === "string" && (text === item.quote || text.startsWith(item.quote));
}

function m1EvidenceQuotes(value: unknown, quotes = new Set<string>()) {
  if (Array.isArray(value)) { value.forEach((item) => m1EvidenceQuotes(item, quotes)); return quotes; }
  if (!value || typeof value !== "object") return quotes;
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence" && Array.isArray(child)) for (const item of child) {
      const quote = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>).quote : undefined;
      if (typeof quote === "string" && quote.trim()) quotes.add(quote.trim());
    }
    m1EvidenceQuotes(child, quotes);
  }
  return quotes;
}

const methodVersionInclude = {
  sourceItem: { select: { id: true, title: true, sourcePlatform: true } },
  sourceMaterialAnalysis: { select: { id: true } },
  sourceTranscript: { select: { id: true, updatedAt: true } },
  sourceBenchmarkStudy: { select: { id: true, sampleCount: true, benchmarkAccount: { select: { name: true } }, samples: { orderBy: { createdAt: "asc" }, select: { sourceItemId: true, sourceItem: { select: { title: true } } } } } },
  sourceMaterialDistillation: { select: { id: true, transcriptUpdatedAtAtDistillation: true, sourceItem: { select: { id: true, title: true, sourcePlatform: true, transcript: { select: { id: true, updatedAt: true } } } } } },
  editedBy: { select: { name: true } },
} as const;

type MethodAssetRow = Prisma.MethodAssetGetPayload<{ include: { versions: { include: typeof methodVersionInclude } } }>;
type MethodVersionRow = MethodAssetRow["versions"][number];

function toVersionDTO(row: MethodVersionRow): MethodVersionDTO {
  const study = row.sourceBenchmarkStudy;
  const sourceItem = row.sourceItem;
  const sourceAnalysis = row.sourceMaterialAnalysis;
  const sourceTranscript = row.sourceTranscript;
  const distillation = row.sourceMaterialDistillation;
  const distillationSource = distillation?.sourceItem;
  const sourceDisplay = sourceItem ?? distillationSource;
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    steps: strings(row.steps),
    applicableScenarios: strings(row.applicableScenarios),
    boundaries: strings(row.boundaries),
    evidence: evidence(row.evidence),
    workflowContract: row.workflowContract && typeof row.workflowContract === "object" && !Array.isArray(row.workflowContract) ? row.workflowContract as unknown as WorkflowSkillContract : null,
    source: {
      sourceItemId: sourceDisplay?.id ?? null,
      title: distillation ? `单条视频精华提炼 · ${distillationSource?.title || "未命名视频"}` : study ? `${study.benchmarkAccount.name} · 本次 ${study.sampleCount} 条代表内容研究` : sourceItem?.title || "未命名素材",
      platform: sourceDisplay?.sourcePlatform ?? null,
      materialAnalysisId: sourceAnalysis?.id ?? null,
      transcriptId: sourceTranscript?.id ?? null,
      transcriptUpdatedAt: row.sourceTranscriptUpdatedAt?.toISOString() ?? null,
      stale: Boolean((sourceTranscript && row.sourceTranscriptUpdatedAt && sourceTranscript.updatedAt > row.sourceTranscriptUpdatedAt) || (distillation && distillationSource?.transcript && distillation.transcriptUpdatedAtAtDistillation < distillationSource.transcript.updatedAt)),
      benchmarkStudyId: study?.id ?? null,
      benchmarkAccountName: study?.benchmarkAccount.name ?? null,
      sampleCount: study?.sampleCount ?? null,
      samples: study?.samples.map((sample) => ({ sourceItemId: sample.sourceItemId, title: sample.sourceItem.title || "未命名内容" })) ?? [],
      sourceMaterialDistillationId: distillation?.id ?? null,
    },
    editedBy: row.editedBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

function toMethodDTO(row: MethodAssetRow): MethodDTO {
  const versions = row.versions.map(toVersionDTO);
  const current = versions[0];
  if (!current) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
  return {
    id: row.id,
    status: row.status,
    statusUpdatedAt: row.statusUpdatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    current,
    history: versions,
  };
}

function isDefaultMethodAsset(row: { versions: Array<{ steps: Prisma.JsonValue }> }) {
  return row.versions.some((version) => isDefaultContentMethodPayload(version.steps));
}

async function findMethodRow(input: { workspaceId: string; ownerUserId: string; methodId: string }) {
  return db.methodAsset.findFirst({
    where: { id: input.methodId, workspaceId: input.workspaceId, ownerUserId: input.ownerUserId },
    include: { versions: { orderBy: { version: "desc" }, include: methodVersionInclude } },
  });
}

async function assertMethodEditor(input: { workspaceId: string; userId: string }) {
  const membership = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { role: true } });
  if (!membership || membership.role === "VIEWER") throw new MethodError("METHOD_INVALID", "当前用户无法修改我的方法。");
}

export async function listMethods(input: { workspaceId: string; ownerUserId: string; status?: "SAVED" | "TRIAL" | "CORE" | "DISABLED" }) {
  const rows = await db.methodAsset.findMany({
    where: { workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, ...(input.status ? { status: input.status } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: methodVersionInclude } },
  });
  return rows.filter((row) => !isDefaultMethodAsset(row)).map(toMethodDTO);
}

export function previewWorkflowSkill(markdown: string) {
  return workflowSkillPreview(parseImportedSkill(markdown));
}

export async function importWorkflowSkill(input: { workspaceId: string; ownerUserId: string; markdown: string }) {
  await assertMethodEditor({ workspaceId: input.workspaceId, userId: input.ownerUserId });
  const contract = parseImportedSkill(input.markdown);
  const asset = await db.$transaction(async (tx) => {
    const created = await tx.methodAsset.create({ data: { workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, status: "SAVED", statusUpdatedAt: new Date() } });
    await tx.methodVersion.create({
      data: {
        assetId: created.id,
        version: 1,
        title: contract.name,
        steps: json(contract.steps),
        applicableScenarios: json(contract.scenarios),
        boundaries: json(contract.prohibitions),
        workflowContract: json(contract),
        evidence: json([]),
        editedById: input.ownerUserId,
      },
    });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "method.imported_from_workflow_skill", resourceType: "method_asset", resourceId: created.id, metadata: { contractVersion: contract.contractVersion, outputType: contract.outputType, sourceType: contract.sourceType } } });
    return created;
  });
  const result = await getMethod({ workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, methodId: asset.id });
  if (!result) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
  return result;
}

export async function getMethod(input: { workspaceId: string; ownerUserId: string; methodId: string }) {
  const row = await findMethodRow(input);
  return row && !isDefaultMethodAsset(row) ? toMethodDTO(row) : null;
}

function currentUnderstanding(value: Prisma.JsonValue | null): CurrentMaterialAnalysisOutput {
  const parsed = materialAnalysisOutputSchema.safeParse(value);
  if (!parsed.success || !("methods" in parsed.data)) throw new MethodError("METHOD_INVALID", "这条内容暂时没有可保存的方法。");
  return parsed.data;
}

export async function createMethodFromAnalysis(input: {
  workspaceId: string;
  ownerUserId: string;
  materialAnalysisId: string;
  methodIndex: number;
  title: string;
  steps: string[];
  applicableScenarios: string[];
  boundaries: string[];
}) {
  await assertMethodEditor({ workspaceId: input.workspaceId, userId: input.ownerUserId });
  if (!Number.isInteger(input.methodIndex) || input.methodIndex < 0) throw new MethodError("METHOD_INVALID", "这条内容暂时没有可保存的方法。");
  const content = methodContentSchema.safeParse({ title: input.title, steps: input.steps, applicableScenarios: input.applicableScenarios, boundaries: input.boundaries });
  if (!content.success) throw new MethodError("METHOD_INVALID", "请检查方法名称、步骤和适用边界。");
  const analysis = await db.materialAnalysis.findFirst({
    where: { id: input.materialAnalysisId, workspaceId: input.workspaceId, status: "COMPLETED", sourceItem: { workspaceId: input.workspaceId } },
    include: { sourceItem: { select: { id: true, title: true, transcript: true } } },
  });
  if (!analysis) throw new MethodError("METHOD_INVALID", "这条内容暂时没有可保存的方法。");
  if (!analysis.sourceItem.transcript || analysis.sourceItem.transcript.workspaceId !== input.workspaceId) throw new MethodError("METHOD_INVALID", "来源文字稿已不可用，暂时不能保存方法。");
  const sourceTranscript = analysis.sourceItem.transcript;
  const understanding = currentUnderstanding(analysis.understanding);
  if (understanding.methods.evidenceStatus !== "SINGLE_SOURCE_DRAFT") throw new MethodError("METHOD_INVALID", "依据还不够，暂时不能保存为方法。");
  const draft = understanding.methods.items[input.methodIndex];
  const calibratedEvidence = draft?.evidence.filter((item) => typeof item.quote === "string" && item.quote.trim() && evidenceMatchesTranscript(item, sourceTranscript)) ?? [];
  if (!draft || calibratedEvidence.length === 0) throw new MethodError("METHOD_INVALID", "这条内容暂时没有可保存的方法。");

  const asset = await db.$transaction(async (tx) => {
    const created = await tx.methodAsset.create({ data: { workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, status: "SAVED", statusUpdatedAt: new Date() } });
    await tx.methodVersion.create({
      data: {
        assetId: created.id,
        version: 1,
        title: content.data.title,
        steps: json(content.data.steps),
        applicableScenarios: json(content.data.applicableScenarios),
        boundaries: json(content.data.boundaries),
        sourceItemId: analysis.sourceItem.id,
        sourceMaterialAnalysisId: analysis.id,
        sourceTranscriptId: sourceTranscript.id,
        sourceTranscriptUpdatedAt: analysis.transcriptUpdatedAtAtAnalysis,
        evidence: json(calibratedEvidence),
        editedById: input.ownerUserId,
      },
    });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "method.created", resourceType: "method_asset", resourceId: created.id, metadata: { sourceItemId: analysis.sourceItem.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: sourceTranscript.id } } });
    return created;
  });
  const result = await getMethod({ workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, methodId: asset.id });
  if (!result) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
  return result;
}

function benchmarkMethodContent(method: BenchmarkCommonMethod, input: { title?: string; steps?: string[]; applicableScenarios?: string[]; boundaries?: string[] }) {
  return methodContentSchema.safeParse({
    title: input.title ?? method.title,
    steps: input.steps ?? (typeof method.howTo === "string" ? [method.howTo] : method.howTo),
    applicableScenarios: input.applicableScenarios ?? (typeof method.applicable === "string" ? [method.applicable] : method.applicable),
    boundaries: input.boundaries ?? (typeof method.boundaries === "string" ? [method.boundaries] : method.boundaries),
  });
}

export async function createMethodFromBenchmarkStudy(input: {
  workspaceId: string;
  ownerUserId: string;
  benchmarkStudyId: string;
  methodIndex: number;
  title?: string;
  steps?: string[];
  applicableScenarios?: string[];
  boundaries?: string[];
}) {
  await assertMethodEditor({ workspaceId: input.workspaceId, userId: input.ownerUserId });
  if (!Number.isInteger(input.methodIndex) || input.methodIndex < 0) throw new MethodError("METHOD_INVALID", "这次研究暂时没有可保存的方法。");
  const study = await db.benchmarkStudy.findFirst({
    where: { id: input.benchmarkStudyId, workspaceId: input.workspaceId, status: "COMPLETED" },
    include: { samples: { select: { id: true, sourceItemId: true, materialAnalysis: { select: { understanding: true } } } } },
  });
  if (!study) throw new MethodError("METHOD_INVALID", "这次研究暂时没有可保存的方法。");
  const parsedOutput = benchmarkAnalysisOutputSchema.safeParse(study.output);
  const method = parsedOutput.success && parsedOutput.data.stableMethodsFound ? parsedOutput.data.commonMethods[input.methodIndex] : undefined;
  if (!method) throw new MethodError("METHOD_INVALID", "这次研究暂时没有可保存的方法。");
  const content = benchmarkMethodContent(method, input);
  if (!content.success) throw new MethodError("METHOD_INVALID", "请检查方法名称、步骤和适用边界。");
  const evidenceBySample = new Map(study.samples.flatMap((sample) => sample.materialAnalysis ? [[sample.id, m1EvidenceQuotes(sample.materialAnalysis.understanding)] as const] : []));
  const groundedEvidence = method.evidence.filter((item) => evidenceBySample.get(item.sampleId)?.has(item.quote.trim()));
  if (!groundedEvidence.length) throw new MethodError("METHOD_INVALID", "这次研究没有足够的原文依据。");
  const asset = await db.$transaction(async (tx) => {
    const created = await tx.methodAsset.create({ data: { workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, status: "SAVED", statusUpdatedAt: new Date() } });
    await tx.methodVersion.create({
      data: {
        assetId: created.id,
        version: 1,
        title: content.data.title,
        steps: json(content.data.steps),
        applicableScenarios: json(content.data.applicableScenarios),
        boundaries: json(content.data.boundaries),
        sourceBenchmarkStudyId: study.id,
        sourceItemId: null,
        sourceMaterialAnalysisId: null,
        sourceTranscriptId: null,
        sourceTranscriptUpdatedAt: null,
        evidence: json(groundedEvidence),
        editedById: input.ownerUserId,
      },
    });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "method.created_from_benchmark_study", resourceType: "method_asset", resourceId: created.id, metadata: json({ benchmarkStudyId: study.id, methodIndex: input.methodIndex, sampleCount: study.sampleCount }) } });
    return created;
  });
  const result = await getMethod({ workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, methodId: asset.id });
  if (!result) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
  return result;
}

const distillationMethodTypes = new Set(["method", "process", "framework", "checklist", "decision_rule", "copy_structure"]);

function distillationMethodContent(highlight: MaterialDistillationHighlight, input: { title?: string; steps?: string[]; applicableScenarios?: string[]; boundaries?: string[] }) {
  return methodContentSchema.safeParse({ title: input.title ?? highlight.title, steps: input.steps ?? highlight.howTo, applicableScenarios: input.applicableScenarios ?? highlight.applicable, boundaries: input.boundaries ?? highlight.boundaries });
}

export async function createMethodFromDistillation(input: {
  workspaceId: string;
  ownerUserId: string;
  materialDistillationId: string;
  methodIndex: number;
  title?: string;
  steps?: string[];
  applicableScenarios?: string[];
  boundaries?: string[];
}) {
  await assertMethodEditor({ workspaceId: input.workspaceId, userId: input.ownerUserId });
  const distillation = await db.materialDistillation.findFirst({ where: { id: input.materialDistillationId, workspaceId: input.workspaceId, status: "COMPLETED", sourceItem: { workspaceId: input.workspaceId } }, include: { sourceItem: { select: { id: true, title: true, transcript: true } } } });
  const parsed = distillation ? materialDistillationGenerationSchema.safeParse(distillation.output) : null;
  const highlight = parsed?.success && parsed.data.hasLongTermValue ? parsed.data.highlights[input.methodIndex] : undefined;
  if (!distillation || !parsed?.success || !highlight || highlight.quality !== "WORTH_KEEPING" || !distillationMethodTypes.has(highlight.type)) throw new MethodError("METHOD_INVALID", "这条视频暂时没有适合保存的方法。");
  const content = distillationMethodContent(highlight, input);
  if (!content.success) throw new MethodError("METHOD_INVALID", "请检查方法名称、步骤和适用边界。");
  if (!distillation.sourceItem.transcript?.fullText.trim()) throw new MethodError("METHOD_INVALID", "来源文字稿已不可用，暂时不能保存方法。");
  const sourceTranscript = distillation.sourceItem.transcript;
  const groundedEvidence = highlight.evidence.flatMap((item) => {
    if (!item.quote?.trim()) return [];
    const candidate = { quote: item.quote, ...(item.segmentIndex !== undefined ? { segmentIndex: item.segmentIndex } : {}) };
    return evidenceMatchesTranscript(candidate, sourceTranscript) ? [candidate] : [];
  });
  if (!groundedEvidence.length) throw new MethodError("METHOD_INVALID", "这条提炼结果没有足够的原文依据。");
  const asset = await db.$transaction(async (tx) => {
    const created = await tx.methodAsset.create({ data: { workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, status: "SAVED", statusUpdatedAt: new Date() } });
    await tx.methodVersion.create({ data: { assetId: created.id, version: 1, title: content.data.title, steps: json(content.data.steps), applicableScenarios: json(content.data.applicableScenarios), boundaries: json(content.data.boundaries), sourceItemId: null, sourceMaterialAnalysisId: null, sourceTranscriptId: null, sourceTranscriptUpdatedAt: null, sourceBenchmarkStudyId: null, sourceMaterialDistillationId: distillation.id, evidence: json(groundedEvidence), editedById: input.ownerUserId } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "method.created_from_material_distillation", resourceType: "method_asset", resourceId: created.id, metadata: json({ materialDistillationId: distillation.id, methodIndex: input.methodIndex, sourceItemId: distillation.sourceItemId }) } });
    return created;
  });
  const result = await getMethod({ workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, methodId: asset.id });
  if (!result) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
  return result;
}

function versionConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034"));
}

export async function updateMethodContent(input: {
  workspaceId: string;
  ownerUserId: string;
  methodId: string;
  expectedVersion: number;
  markdown?: string;
  title: string;
  steps: string[];
  applicableScenarios: string[];
  boundaries: string[];
}) {
  await assertMethodEditor({ workspaceId: input.workspaceId, userId: input.ownerUserId });
  const content = methodContentSchema.safeParse({ title: input.title, steps: input.steps, applicableScenarios: input.applicableScenarios, boundaries: input.boundaries });
  if (!content.success) throw new MethodError("METHOD_INVALID", "请检查方法名称、步骤和适用边界。");
  try {
    await db.$transaction(async (tx) => {
      const asset = await tx.methodAsset.findFirst({ where: { id: input.methodId, workspaceId: input.workspaceId, ownerUserId: input.ownerUserId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
      const current = asset?.versions[0];
      if (!asset || !current) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
      if (isDefaultContentMethodPayload(current.steps)) throw new MethodError("METHOD_INVALID", "默认创作方法请使用公司方法管理入口。");
      if (current.version !== input.expectedVersion) throw new MethodError("METHOD_VERSION_CONFLICT", "这个方法刚刚有新的修改，请刷新后再保存。");
      await tx.methodVersion.create({ data: { assetId: asset.id, version: current.version + 1, title: content.data.title, steps: json(content.data.steps), applicableScenarios: json(content.data.applicableScenarios), boundaries: json(content.data.boundaries), sourceItemId: current.sourceItemId, sourceMaterialAnalysisId: current.sourceMaterialAnalysisId, sourceTranscriptId: current.sourceTranscriptId, sourceTranscriptUpdatedAt: current.sourceTranscriptUpdatedAt, sourceBenchmarkStudyId: current.sourceBenchmarkStudyId, sourceMaterialDistillationId: current.sourceMaterialDistillationId, workflowContract: input.markdown !== undefined ? json({ ...parseImportedSkill(input.markdown), name: content.data.title }) : current.workflowContract ?? undefined, evidence: json(current.evidence ?? []), editedById: input.ownerUserId } });
      await tx.methodAsset.update({ where: { id: asset.id }, data: { updatedAt: new Date() } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "method.version_created", resourceType: "method_asset", resourceId: asset.id, metadata: { version: current.version + 1 } } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof MethodError) throw error;
    if (versionConflict(error)) throw new MethodError("METHOD_VERSION_CONFLICT", "这个方法刚刚有新的修改，请刷新后再保存。");
    throw error;
  }
  const result = await getMethod({ workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, methodId: input.methodId });
  if (!result) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
  return result;
}

export async function updateMethodStatus(input: { workspaceId: string; ownerUserId: string; methodId: string; status: string }) {
  await assertMethodEditor({ workspaceId: input.workspaceId, userId: input.ownerUserId });
  const parsed = methodStatusSchema.safeParse(input.status);
  if (!parsed.success) throw new MethodError("METHOD_STATUS_INVALID", "请选择有效的方法状态。");
  const asset = await db.methodAsset.findFirst({ where: { id: input.methodId, workspaceId: input.workspaceId, ownerUserId: input.ownerUserId }, select: { id: true, versions: { orderBy: { version: "desc" }, take: 1, select: { steps: true } } } });
  if (!asset) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
  if (asset.versions[0] && isDefaultContentMethodPayload(asset.versions[0].steps)) throw new MethodError("METHOD_INVALID", "默认创作方法请使用公司方法管理入口。");
  await db.$transaction([
    db.methodAsset.update({ where: { id: asset.id }, data: { status: parsed.data, statusUpdatedAt: new Date() } }),
    db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "method.status_updated", resourceType: "method_asset", resourceId: asset.id, metadata: { status: parsed.data } } }),
  ]);
  const result = await getMethod({ workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, methodId: input.methodId });
  if (!result) throw new MethodError("METHOD_NOT_FOUND", "方法不存在。");
  return result;
}

export async function deleteMethod(input: { workspaceId: string; ownerUserId: string; methodId: string }) {
  await assertMethodEditor({ workspaceId: input.workspaceId, userId: input.ownerUserId });
  await db.$transaction(async tx => {
    const asset = await tx.methodAsset.findFirst({ where: { id: input.methodId, workspaceId: input.workspaceId, ownerUserId: input.ownerUserId }, include: { versions: true } });
    if (!asset) throw new MethodError("METHOD_NOT_FOUND", "Skill 不存在。");
    if (isDefaultMethodAsset(asset)) throw new MethodError("METHOD_INVALID", "默认方法不能从这里删除。");
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "method.deleted", resourceType: "method_asset", resourceId: asset.id, metadata: { title: asset.versions.at(-1)?.title, versions: asset.versions.length } } });
    await tx.methodAsset.delete({ where: { id: asset.id } });
  }, { isolationLevel: "Serializable" });
}
