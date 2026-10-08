import "server-only";

import { db, type MaterialAnalysis, type Prisma } from "@content-center/db";
import { resolveSourceContent } from "@content-center/core";
import { MaterialAnalysisRequestError, requestMaterialAnalysisJob } from "@content-center/worker/material-analysis-request";
import { loadLLMRuntime, type LLMRuntime } from "../ai/llm-runtime";
import { createProject } from "../project-service";
import { MaterialAnalysisToBriefMapper, type MaterialAnalysisBriefDraft } from "./brief-mapper";
import { buildMaterialAnalysisContext, MaterialAnalysisContextError } from "./context-builder";
import { materialAnalysisEditSchema, materialAnalysisOutputSchema, type MaterialAnalysisOutput } from "./schemas";

export class MaterialAnalysisError extends Error {
  constructor(readonly code: "SOURCE_NOT_FOUND" | "TRANSCRIPT_REQUIRED" | "ANALYSIS_NOT_FOUND" | "ANALYSIS_ALREADY_PROCESSING" | "INVALID_INPUT" | "MOCK_NOT_ALLOWED" | "QUEUE_UNAVAILABLE", message: string) {
    super(message);
    this.name = "MaterialAnalysisError";
  }
}

function strings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export type MaterialAnalysisDTO = {
  id: string;
  sourceItemId: string;
  version: number;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  origin: "AI" | "HUMAN";
  suggestedTitle: string | null;
  summary: string | null;
  topic: string | null;
  tags: string[];
  keywords: string[];
  contentType: string | null;
  targetAudience: string | null;
  coreViewpoint: string | null;
  keyPoints: string[];
  coreQuestion: string | null;
  understanding: MaterialAnalysisOutput | null;
  legacy: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MaterialAnalysisJobDTO = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progress: number;
  attempt: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
};

export function toMaterialAnalysisDTO(row: MaterialAnalysis, transcriptUpdatedAt?: Date | null): MaterialAnalysisDTO {
  const parsedUnderstanding = materialAnalysisOutputSchema.safeParse(row.understanding);
  return {
    id: row.id,
    sourceItemId: row.sourceItemId,
    version: row.version,
    status: row.status,
    origin: row.origin,
    suggestedTitle: row.suggestedTitle,
    summary: row.summary,
    topic: row.topic,
    tags: strings(row.tags),
    keywords: strings(row.keywords),
    contentType: row.contentType,
    targetAudience: row.targetAudience,
    coreViewpoint: row.coreViewpoint,
    keyPoints: strings(row.keyPoints),
    coreQuestion: row.coreQuestion,
    understanding: parsedUnderstanding.success ? parsedUnderstanding.data : null,
    legacy: !parsedUnderstanding.success || !("expression" in parsedUnderstanding.data),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    stale: Boolean(transcriptUpdatedAt && transcriptUpdatedAt > row.transcriptUpdatedAtAtAnalysis),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function scopedSource(workspaceId: string, sourceItemId: string) {
  const source = await db.sourceItem.findFirst({ where: { id: sourceItemId, workspaceId }, include: { transcript: true } });
  if (!source) throw new MaterialAnalysisError("SOURCE_NOT_FOUND", "素材不存在。");
  return source;
}

function sourceContentUpdatedAt(source: { sourceType: string; rawText: string | null; updatedAt: Date; transcript: { id: string; fullText: string; segments: unknown; updatedAt: Date } | null }) {
  return resolveSourceContent({ sourceType: source.sourceType, rawText: source.rawText, sourceUpdatedAt: source.updatedAt, transcript: source.transcript })?.updatedAt ?? null;
}

export async function getMaterialAnalysis(input: { workspaceId: string; sourceItemId: string }) {
  const source = await scopedSource(input.workspaceId, input.sourceItemId);
  const analyses = await db.materialAnalysis.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: source.id }, orderBy: { version: "desc" }, take: 20 });
  const jobs = await db.ingestJob.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: source.id, jobType: "ANALYZE_MATERIAL" }, orderBy: { createdAt: "desc" }, take: 20 });
  const contentUpdatedAt = sourceContentUpdatedAt(source);
  const latestAttempt = analyses[0] ? toMaterialAnalysisDTO(analyses[0], contentUpdatedAt) : null;
  const currentRow = analyses.find((row) => row.status === "COMPLETED");
  const latestJob = jobs[0];
  return {
    current: currentRow ? toMaterialAnalysisDTO(currentRow, contentUpdatedAt) : null,
    latestAttempt,
    job: latestJob ? {
      id: latestJob.id,
      status: latestJob.status,
      progress: latestJob.progress,
      attempt: latestJob.attempt,
      maxAttempts: latestJob.maxAttempts,
      errorCode: latestJob.errorCode,
      errorMessage: latestJob.errorMessage,
      updatedAt: latestJob.updatedAt.toISOString(),
    } satisfies MaterialAnalysisJobDTO : null,
    history: analyses.map((row) => toMaterialAnalysisDTO(row, contentUpdatedAt)),
  };
}

export async function requestMaterialAnalysis(input: { workspaceId: string; sourceItemId: string; userId: string }, dependencies: { runtime?: LLMRuntime } = {}) {
  let built;
  try {
    built = await buildMaterialAnalysisContext(input);
  } catch (error) {
    if (error instanceof MaterialAnalysisContextError) throw new MaterialAnalysisError(error.code, error.message);
    throw error;
  }
  const runtime = dependencies.runtime ?? await loadLLMRuntime(input.workspaceId);
  if (runtime.mode === "MOCK") throw new MaterialAnalysisError("MOCK_NOT_ALLOWED", "智能整理不使用模拟结果，请先配置 AI 模型。");
  try {
    const requested = await requestMaterialAnalysisJob({ workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, requestedById: input.userId, existingProcessing: "THROW", reuseCompleted: false });
    return { ...toMaterialAnalysisDTO(requested.analysis, built.sourceContent.updatedAt), jobId: requested.job?.id, status: requested.created ? "QUEUED" as const : requested.analysis.status };
  } catch (error) {
    if (error instanceof MaterialAnalysisRequestError) throw new MaterialAnalysisError(error.code === "ALREADY_PROCESSING" ? "ANALYSIS_ALREADY_PROCESSING" : error.code === "SOURCE_NOT_READY" ? "TRANSCRIPT_REQUIRED" : "QUEUE_UNAVAILABLE", error.message);
    throw error;
  }
}

export async function updateMaterialAnalysis(input: { workspaceId: string; sourceItemId: string; analysisId: string; userId: string; data: unknown }) {
  const parsed = materialAnalysisEditSchema.safeParse(input.data);
  if (!parsed.success) throw new MaterialAnalysisError("INVALID_INPUT", "请检查整理内容和字段长度。");
  const source = await scopedSource(input.workspaceId, input.sourceItemId);
  const analysis = await db.materialAnalysis.findFirst({ where: { id: input.analysisId, workspaceId: input.workspaceId, sourceItemId: source.id } });
  if (!analysis) throw new MaterialAnalysisError("ANALYSIS_NOT_FOUND", "整理结果不存在。");
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.materialAnalysis.update({ where: { id: analysis.id }, data: { understanding: json(parsed.data), summary: parsed.data.whatItSays.summary, keyPoints: json(parsed.data.whatItSays.keyPoints), status: "COMPLETED", origin: "HUMAN", errorCode: null, errorMessage: null } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "material_analysis.updated", resourceType: "material_analysis", resourceId: analysis.id, metadata: { sourceItemId: source.id, version: analysis.version } } });
    return row;
  });
  return toMaterialAnalysisDTO(updated, sourceContentUpdatedAt(source));
}

async function initializeExistingProjectBrief(input: { workspaceId: string; projectId: string; sourceItemId: string; userId: string; draft: MaterialAnalysisBriefDraft }) {
  try {
    return await db.$transaction(async (tx) => {
      const project = await tx.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, sources: { some: { sourceItemId: input.sourceItemId } } }, select: { id: true } });
      if (!project) throw new MaterialAnalysisError("SOURCE_NOT_FOUND", "项目或主素材不存在。");
      const existing = await tx.creativeBrief.findUnique({ where: { projectId: project.id }, select: { id: true } });
      if (existing) return false;
      const brief = await tx.creativeBrief.create({ data: { workspaceId: input.workspaceId, projectId: project.id, createdById: input.userId, ...input.draft } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "brief.initialized", resourceType: "creative_brief", resourceId: brief.id, metadata: { projectId: project.id, source: "MATERIAL_ANALYSIS", primarySourceItemId: input.sourceItemId } } });
      return true;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return false;
    throw error;
  }
}

export async function createProjectFromMaterial(input: { workspaceId: string; sourceItemId: string; userId: string }) {
  const source = await scopedSource(input.workspaceId, input.sourceItemId);
  const latest = await db.materialAnalysis.findFirst({ where: { workspaceId: input.workspaceId, sourceItemId: source.id, status: "COMPLETED" }, orderBy: { version: "desc" } });
  const existing = await db.projectSource.findFirst({
    where: { sourceItemId: source.id, project: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" } } },
    orderBy: { createdAt: "desc" },
    select: { project: { select: { id: true, title: true, audience: true, creativeBrief: { select: { id: true } } } } },
  });
  if (existing) {
    if (!latest || existing.project.creativeBrief) return { projectId: existing.project.id, created: false, briefInitialized: false };
    const draft = MaterialAnalysisToBriefMapper.map({ analysis: latest, source, project: existing.project });
    const briefInitialized = await initializeExistingProjectBrief({ workspaceId: input.workspaceId, projectId: existing.project.id, sourceItemId: source.id, userId: input.userId, draft });
    return { projectId: existing.project.id, created: false, briefInitialized };
  }
  const title = source.title || latest?.suggestedTitle || "未命名内容项目";
  const audience = undefined;
  const initialBrief = latest ? MaterialAnalysisToBriefMapper.map({ analysis: latest, source, project: { title, audience: audience ?? null } }) : undefined;
  const project = await createProject({ workspaceId: input.workspaceId, userId: input.userId, sourceItemId: source.id, title, description: latest?.summary || undefined, audience, initialBrief });
  return { projectId: project.id, created: true, briefInitialized: Boolean(initialBrief) };
}
