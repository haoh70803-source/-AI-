import { db, type Prisma } from "@content-center/db";
import type { ContentIngestPayload } from "./queue-producer";
import { markDispatchPending } from "./job-recovery";
import { getSourceContent } from "./source-content";

export class MaterialAnalysisRequestError extends Error {
  constructor(readonly code: "SOURCE_NOT_READY" | "ALREADY_PROCESSING" | "QUEUE_UNAVAILABLE", message: string) { super(message); this.name = "MaterialAnalysisRequestError"; }
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

export async function requestMaterialAnalysisJob(input: { workspaceId: string; sourceItemId: string; requestedById: string; existingProcessing?: "RETURN" | "THROW"; reuseCompleted?: boolean }, dependencies: { enqueue?: (payload: ContentIngestPayload, maxAttempts: number) => Promise<unknown> } = {}) {
  const source = await db.sourceItem.findFirst({ where: { id: input.sourceItemId, workspaceId: input.workspaceId, status: { not: "ARCHIVED" } } });
  const content = await getSourceContent(input);
  if (!source || !content) throw new MaterialAnalysisRequestError("SOURCE_NOT_READY", "资料正文尚未准备好。");
  const active = await db.materialAnalysis.findFirst({ where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, status: "PROCESSING" }, orderBy: { version: "desc" } });
  if (active) {
    if (input.existingProcessing === "THROW") throw new MaterialAnalysisRequestError("ALREADY_PROCESSING", "这条资料正在整理，请稍候。");
    return { analysis: active, job: null, created: false as const };
  }
  if (input.reuseCompleted !== false) {
    const existing = await db.materialAnalysis.findFirst({ where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, transcriptUpdatedAtAtAnalysis: content.updatedAt, status: "COMPLETED" }, orderBy: { version: "desc" } });
    if (existing) return { analysis: existing, job: null, created: false as const };
  }
  let reserved;
  try {
    reserved = await db.$transaction(async (tx) => {
      const active = await tx.materialAnalysis.findFirst({ where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, status: "PROCESSING" } });
      if (active) throw new MaterialAnalysisRequestError("ALREADY_PROCESSING", "这条资料正在整理，请稍候。");
      const latest = await tx.materialAnalysis.findFirst({ where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId }, orderBy: { version: "desc" }, select: { version: true } });
      const analysis = await tx.materialAnalysis.create({ data: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, version: (latest?.version ?? 0) + 1, status: "PROCESSING", tags: [], keywords: [], keyPoints: [], transcriptUpdatedAtAtAnalysis: content.updatedAt, createdById: input.requestedById } });
      const job = await tx.ingestJob.create({ data: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, requestedById: input.requestedById, jobType: "ANALYZE_MATERIAL", provider: "LLM", providerMode: "REAL", status: "QUEUED", maxAttempts: 3, metadata: json({ materialAnalysisId: analysis.id, contentSource: content.contentSource, contentVersion: content.version, contentUpdatedAt: content.updatedAt.toISOString() }) } });
      return { analysis, job };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof MaterialAnalysisRequestError) throw error;
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002" || code === "P2034") throw new MaterialAnalysisRequestError("ALREADY_PROCESSING", "这条资料正在整理，请稍候。");
    throw error;
  }
  try {
    const enqueue = dependencies.enqueue ?? (async (payload: ContentIngestPayload, maxAttempts: number) => (await import("./queue-producer")).enqueueMaterialAnalysis(payload, maxAttempts));
    await enqueue({ jobId: reserved.job.id, workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, requestedById: input.requestedById }, reserved.job.maxAttempts);
    return { ...reserved, created: true as const };
  } catch {
    await markDispatchPending(reserved.job.id, input.workspaceId);
    return { ...reserved, created: true as const };
  }
}
