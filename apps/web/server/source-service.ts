import { createHash } from "node:crypto";
import { resolveWorkspaceTranscriptionPlan } from "@content-center/worker/transcription";
import { markDispatchPending } from "@content-center/worker/job-recovery";
import { reserveExperienceUsage } from "@content-center/worker/experience-limits";
import "server-only";

import { detectSourcePlatform, normalizeSourceUrl } from "@content-center/core";
import { db } from "@content-center/db";
import { enqueueContentIngest } from "@content-center/worker/queue-producer";
import { IntegrationService } from "@content-center/integrations";
import {
  createSourceMetadataEnvelope,
  extractDouyinShareUrl,
  extractRedFoxContentUrl,
  type SourceExternalMetadata,
} from "@content-center/providers";

export type CreateSourceInput =
  | { kind: "TEXT"; title?: string; text: string; notes?: string }
  | { kind: "URL"; url: string }
  | { kind: "MEDIA_URL"; url: string }
  | { kind: "DOUYIN"; shareText: string }
  | {
      kind: "REDFOX";
      url: string;
      externalId?: string;
      title?: string;
      author?: string;
      description?: string;
      thumbnailUrl?: string;
      contentType?: "VIDEO" | "IMAGE" | "ARTICLE" | "UNKNOWN";
      externalMetadata?: SourceExternalMetadata;
    };

export class SourceServiceError extends Error {
  constructor(readonly code: "REDFOX_NOT_CONFIGURED" | "REDFOX_DISABLED" | "IDEMPOTENCY_KEY_REUSED") {
    super(code);
    this.name = "SourceServiceError";
  }
}

const integrationService = new IntegrationService();

export async function createSourceAndJob(input: {
  workspaceId: string;
  userId: string;
  source: CreateSourceInput;
  autoTranscribe?: boolean;
  clientRequestId?: string;
}, dependencies: { enqueue?: typeof enqueueContentIngest } = {}) {
  if (input.autoTranscribe) await resolveWorkspaceTranscriptionPlan(input.workspaceId);
  const redFoxSource = input.source.kind === "DOUYIN" || input.source.kind === "REDFOX";
  if (redFoxSource) {
    const integration = await integrationService.getIntegrationStatus(input.workspaceId, "REDFOX");
    if (integration.status === "DISABLED") throw new SourceServiceError("REDFOX_DISABLED");
    if (integration.status !== "CONFIGURED") throw new SourceServiceError("REDFOX_NOT_CONFIGURED");
  }
  const rawText = input.source.kind === "TEXT" ? input.source.text.trim() : null;
  const sourceUrl = input.source.kind === "TEXT"
    ? null
    : (input.source.kind === "URL" || input.source.kind === "MEDIA_URL")
      ? input.source.url.trim()
      : input.source.kind === "DOUYIN"
        ? extractDouyinShareUrl(input.source.shareText)
        : extractRedFoxContentUrl(input.source.url).url;
  const canonicalUrl = sourceUrl ? normalizeSourceUrl(sourceUrl) : null;
  const sourceType = input.source.kind === "TEXT"
    ? "TEXT"
    : input.source.kind === "URL"
      ? "URL"
      : input.source.kind === "REDFOX" && input.source.contentType === "IMAGE"
        ? "IMAGE"
        : "VIDEO";
  const sourcePlatform = input.source.kind === "TEXT" ? "GENERIC" : detectSourcePlatform(sourceUrl ?? "");
  const provider = input.source.kind === "TEXT" ? "MANUAL" : input.source.kind === "URL" ? "GENERIC_URL" : input.source.kind === "MEDIA_URL" ? "DIRECT_MEDIA" : "REDFOX";
  const providerMode = "REAL";
  const jobType = input.source.kind === "TEXT" ? "EXTRACT_TEXT" : input.source.kind === "URL" ? "FETCH_URL" : "PROCESS_MEDIA";
  const title = input.source.kind === "TEXT"
    ? input.source.title?.trim() || null
    : input.source.kind === "REDFOX"
      ? input.source.title?.trim() || null
      : null;
  const description = input.source.kind === "TEXT"
    ? input.source.notes?.trim() || null
    : input.source.kind === "REDFOX"
      ? input.source.description?.trim() || null
      : null;

  const requestDigest=createHash("sha256").update(JSON.stringify({source:input.source,autoTranscribe:input.autoTranscribe ?? false})).digest("hex");
  const created = await db.$transaction(async (tx) => {
    if(input.clientRequestId) {
      const key=JSON.stringify(["source-request",input.workspaceId,input.userId,input.clientRequestId]);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",key);
      const existing=await tx.ingestJob.findFirst({where:{workspaceId:input.workspaceId,requestedById:input.userId,metadata:{path:["clientRequestId"],equals:input.clientRequestId}},include:{sourceItem:true}});
      if(existing) {
        const metadata=existing.metadata && typeof existing.metadata==="object" && !Array.isArray(existing.metadata)?existing.metadata:{};
        if(!("requestDigest" in metadata) || metadata.requestDigest!==requestDigest)throw new SourceServiceError("IDEMPOTENCY_KEY_REUSED");
        return {sourceItem:existing.sourceItem,ingestJob:existing};
      }
    }
    if (redFoxSource) { const release = await reserveExperienceUsage({ ...input, operation: "SEARCH" }); await release(); }
    const sourceItem = await tx.sourceItem.create({
      data: {
        workspaceId: input.workspaceId,
        createdById: input.userId,
        sourceType,
        sourcePlatform,
        sourceUrl,
        canonicalUrl,
        externalId: input.source.kind === "REDFOX" ? input.source.externalId?.trim() || null : null,
        sourceProvider: redFoxSource ? "REDFOX" : provider,
        title,
        author: input.source.kind === "REDFOX" ? input.source.author?.trim() || null : null,
        description,
        thumbnailUrl: input.source.kind === "REDFOX" ? input.source.thumbnailUrl?.trim() || null : null,
        rawText,
        metadata: input.source.kind === "REDFOX" && input.source.externalMetadata
          ? createSourceMetadataEnvelope(input.source.externalMetadata)
          : undefined,
        status: "PENDING",
      },
    });
    const ingestJob = await tx.ingestJob.create({
      data: {
        workspaceId: input.workspaceId,
        sourceItemId: sourceItem.id,
        requestedById: input.userId,
        jobType,
        provider,
        providerMode,
        status: "QUEUED",
        maxAttempts: 3,
        metadata: input.clientRequestId ? {clientRequestId:input.clientRequestId,requestDigest,...(input.autoTranscribe?{autoTranscribe:true}:{})} : input.autoTranscribe ? {autoTranscribe:true} : undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: "source.created",
        resourceType: "source_item",
        resourceId: sourceItem.id,
        metadata: { sourceType, sourcePlatform, jobId: ingestJob.id, providerMode },
      },
    });
    return { sourceItem, ingestJob };
  });

  try {
    if (created.ingestJob.status !== "QUEUED") return created;
    await (dependencies.enqueue ?? enqueueContentIngest)(
      {
        jobId: created.ingestJob.id,
        workspaceId: input.workspaceId,
        sourceItemId: created.sourceItem.id,
        requestedById: input.userId,
      },
      created.ingestJob.maxAttempts,
    );
  } catch {
    console.error("CONTENT_INGEST_QUEUE_ERROR", {
      jobId: created.ingestJob.id,
      workspaceId: input.workspaceId,
      sourceItemId: created.sourceItem.id,
    });
    await markDispatchPending(created.ingestJob.id, input.workspaceId);

  }
  return created;
}
