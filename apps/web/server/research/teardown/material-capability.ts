import "server-only";
import { db } from "@content-center/db";
import { normalizeSourceUrl } from "@content-center/core";
import { requestSourceTranscription, resolveWorkspaceTranscriptionPlan } from "@content-center/worker/transcription";
import { createSourceAndJob, SourceServiceError } from "../../source-service";
import { ResearchError, type ResearchActor } from "../access";

/** Material remains the owner of ingestion and transcription. Research only receives identifiers. */
export async function prepareTeardownMaterial(actor: ResearchActor, url: string, requestKey: string) {
  const canonicalUrl = normalizeSourceUrl(url);
  const externalId = new URL(url).pathname.match(/\/video\/(\d+)/)?.[1];
  const existing = await db.sourceItem.findFirst({ where: { workspaceId: actor.workspaceId, sourcePlatform: "DOUYIN", OR: [{ canonicalUrl }, ...(externalId ? [{ externalId }] : [])] }, include: { transcript: { select: { id: true } }, ingestJobs: { orderBy: { createdAt: "desc" }, take: 10 } } });
  if (existing) {
    if (existing.status === "ARCHIVED") throw new ResearchError("SOURCE_ARCHIVED", "作品资料已归档，请先在资料库恢复。", 409);
    if (existing.status === "FAILED") throw new ResearchError("SOURCE_FAILED", "作品资料下载失败，请先在资料库重试下载。", 409);
    if (!existing.transcript) {
      await resolveWorkspaceTranscriptionPlan(actor.workspaceId);
      const last = existing.ingestJobs.find(row => row.jobType === "TRANSCRIBE");
      if (existing.status === "READY" && last && ["FAILED", "CANCELLED"].includes(last.status)) await requestSourceTranscription({ workspaceId: actor.workspaceId, sourceItemId: existing.id, requestedById: actor.userId });
    }
    return { sourceItemId: existing.id, ingestJobId: existing.ingestJobs.find(row => row.jobType !== "TRANSCRIBE")?.id ?? null };
  }
  await resolveWorkspaceTranscriptionPlan(actor.workspaceId);
  try {
    // Transcription is requested by the teardown worker after stored media is ready.
    const result = await createSourceAndJob({ ...actor, source: { kind: "DOUYIN", shareText: url }, clientRequestId: `teardown:${requestKey}` });
    return { sourceItemId: result.sourceItem.id, ingestJobId: result.ingestJob.id };
  } catch (error) {
    if (error instanceof SourceServiceError) throw new ResearchError(error.code, "请在系统设置中配置并启用红狐 API。", 409);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const concurrent = await db.sourceItem.findFirst({ where: { workspaceId: actor.workspaceId, canonicalUrl } });
      if (concurrent && concurrent.status !== "ARCHIVED") return { sourceItemId: concurrent.id, ingestJobId: null };
    }
    throw error;
  }
}
