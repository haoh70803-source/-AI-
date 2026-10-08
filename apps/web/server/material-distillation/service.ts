import { markDispatchPending } from "@content-center/worker/job-recovery";
import "server-only";

import { db, type MaterialDistillation, type Prisma } from "@content-center/db";
import { resolveSourceContent } from "@content-center/core";
import { enqueueMaterialDistillation } from "@content-center/worker/queue-producer";
import { materialDistillationGenerationSchema, materialDistillationModeSchema, type MaterialDistillationMode, type MaterialDistillationOutput } from "@content-center/providers";
import { loadLLMRuntime, type LLMRuntime } from "../ai/llm-runtime";
import { z } from "zod";

export const materialDistillationRequestSchema = z.object({ mode: materialDistillationModeSchema }).strict();

export class MaterialDistillationError extends Error {
  constructor(readonly code: "SOURCE_NOT_FOUND" | "VIDEO_REQUIRED" | "TRANSCRIPT_REQUIRED" | "DISTILLATION_NOT_FOUND" | "DISTILLATION_ALREADY_PROCESSING" | "INVALID_INPUT" | "MOCK_NOT_ALLOWED" | "QUEUE_UNAVAILABLE" | "DISTILLATION_FORBIDDEN", message: string) {
    super(message);
    this.name = "MaterialDistillationError";
  }
}

export type MaterialDistillationDTO = {
  id: string;
  sourceItemId: string;
  version: number;
  mode: MaterialDistillationMode;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  schemaVersion: string;
  output: MaterialDistillationOutput | null;
  aiRunId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MaterialDistillationJobDTO = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progress: number;
  attempt: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toOutput(value: Prisma.JsonValue | null): MaterialDistillationOutput | null {
  const parsed = materialDistillationGenerationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toMaterialDistillationDTO(row: MaterialDistillation, transcriptUpdatedAt?: Date | null): MaterialDistillationDTO {
  return { id: row.id, sourceItemId: row.sourceItemId, version: row.version, mode: row.mode, status: row.status, schemaVersion: row.schemaVersion, output: toOutput(row.output), aiRunId: row.aiRunId, errorCode: row.errorCode, errorMessage: row.errorMessage, stale: Boolean(transcriptUpdatedAt && transcriptUpdatedAt > row.transcriptUpdatedAtAtDistillation), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

async function scopedSource(workspaceId: string, sourceItemId: string) {
  const source = await db.sourceItem.findFirst({ where: { id: sourceItemId, workspaceId }, include: { transcript: true } });
  if (!source) throw new MaterialDistillationError("SOURCE_NOT_FOUND", "素材不存在。");
  return source;
}

function sourceContentUpdatedAt(source: { sourceType: string; rawText: string | null; updatedAt: Date; transcript: { id: string; fullText: string; segments: unknown; updatedAt: Date } | null }) {
  return resolveSourceContent({ sourceType: source.sourceType, rawText: source.rawText, sourceUpdatedAt: source.updatedAt, transcript: source.transcript })?.updatedAt ?? null;
}

export async function getMaterialDistillation(input: { workspaceId: string; sourceItemId: string }) {
  const source = await scopedSource(input.workspaceId, input.sourceItemId);
  const rows = await db.materialDistillation.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: source.id }, orderBy: { version: "desc" }, take: 20 });
  const jobs = await db.ingestJob.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: source.id, jobType: "DISTILL_MATERIAL" }, orderBy: { createdAt: "desc" }, take: 20 });
  const contentUpdatedAt = sourceContentUpdatedAt(source);
  const latestAttempt = rows[0] ? toMaterialDistillationDTO(rows[0], contentUpdatedAt) : null;
  const currentRow = rows.find((row) => row.status === "COMPLETED");
  const latestJob = jobs[0];
  return { current: currentRow ? toMaterialDistillationDTO(currentRow, contentUpdatedAt) : null, latestAttempt, job: latestJob ? { id: latestJob.id, status: latestJob.status, progress: latestJob.progress, attempt: latestJob.attempt, maxAttempts: latestJob.maxAttempts, errorCode: latestJob.errorCode, errorMessage: latestJob.errorMessage, updatedAt: latestJob.updatedAt.toISOString() } satisfies MaterialDistillationJobDTO : null, history: rows.map((row) => toMaterialDistillationDTO(row, contentUpdatedAt)) };
}

async function reserveDistillation(input: { workspaceId: string; sourceItemId: string; userId: string; mode: MaterialDistillationMode; transcriptUpdatedAt: Date }) {
  try {
    return await db.$transaction(async (tx) => {
      const processing = await tx.materialDistillation.findFirst({ where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, status: "PROCESSING" }, select: { id: true } });
      if (processing) throw new MaterialDistillationError("DISTILLATION_ALREADY_PROCESSING", "这条视频正在提炼，请稍候。");
      const latest = await tx.materialDistillation.findFirst({ where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId }, orderBy: { version: "desc" }, select: { version: true } });
      const distillation = await tx.materialDistillation.create({ data: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, createdById: input.userId, version: (latest?.version ?? 0) + 1, mode: input.mode, status: "PROCESSING", schemaVersion: "material-distillation-v2", transcriptUpdatedAtAtDistillation: input.transcriptUpdatedAt } });
      const job = await tx.ingestJob.create({ data: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, requestedById: input.userId, jobType: "DISTILL_MATERIAL", provider: "LLM", providerMode: "REAL", status: "QUEUED", maxAttempts: 3, metadata: json({ materialDistillationId: distillation.id, mode: input.mode, transcriptUpdatedAtAtDistillation: input.transcriptUpdatedAt.toISOString() }) } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "material_distillation.created", resourceType: "material_distillation", resourceId: distillation.id, metadata: json({ sourceItemId: input.sourceItemId, version: distillation.version, mode: input.mode }) } });
      return { distillation, job };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof MaterialDistillationError) throw error;
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002" || code === "P2034") throw new MaterialDistillationError("DISTILLATION_ALREADY_PROCESSING", "这条视频正在提炼，请稍候。");
    throw error;
  }
}

export async function requestMaterialDistillation(input: { workspaceId: string; sourceItemId: string; userId: string; mode: MaterialDistillationMode }, dependencies: { runtime?: LLMRuntime } = {}) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { role: true } });
  if (!member || member.role === "VIEWER") throw new MaterialDistillationError("DISTILLATION_FORBIDDEN", "当前权限不能发起精华提炼。");
  const source = await scopedSource(input.workspaceId, input.sourceItemId);
  const sourceContent = resolveSourceContent({ sourceType: source.sourceType, rawText: source.rawText, sourceUpdatedAt: source.updatedAt, transcript: source.transcript });
  if (!sourceContent) throw new MaterialDistillationError("TRANSCRIPT_REQUIRED", "请先完成资料读取，再进行精华提炼。");
  const runtime = dependencies.runtime ?? await loadLLMRuntime(input.workspaceId);
  if (runtime.mode === "MOCK") throw new MaterialDistillationError("MOCK_NOT_ALLOWED", "精华提炼不使用模拟结果，请先配置 AI 模型。");
  const reserved = await reserveDistillation({ workspaceId: input.workspaceId, sourceItemId: source.id, userId: input.userId, mode: input.mode, transcriptUpdatedAt: sourceContent.updatedAt });
  try {
    await enqueueMaterialDistillation({ jobId: reserved.job.id, workspaceId: input.workspaceId, sourceItemId: source.id, requestedById: input.userId }, reserved.job.maxAttempts);
    return { ...toMaterialDistillationDTO(reserved.distillation, sourceContent.updatedAt), jobId: reserved.job.id, status: "QUEUED" as const };
  } catch {
    await markDispatchPending(reserved.job.id, input.workspaceId);
    return { ...toMaterialDistillationDTO(reserved.distillation, sourceContent.updatedAt), jobId: reserved.job.id, status: "QUEUED" as const };
  }
}
