import { db } from "@content-center/db";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { understandingExpired } from "@/server/material-detail/understanding";

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  const source = await db.sourceItem.findFirst({
    where: { id, workspaceId: context.workspace.id },
    select: {
      status: true,
      updatedAt: true,
      transcript: { select: { id: true, updatedAt: true } },
      sourceUnderstanding: { select: { status: true, updatedAt: true } },
      ingestJobs: {
        where: { jobType: { in: ["EXTRACT_TEXT", "FETCH_URL", "TRANSCRIBE", "PROCESS_MEDIA"] }, status: { in: ["QUEUED", "RUNNING", "FAILED", "SUCCEEDED"] } },
        select: { id: true, jobType: true, status: true, progress: true, metadata: true, errorMessage: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!source) return apiError("NOT_FOUND", 404);
  const latestTranscription = source.ingestJobs.find((job) => job.jobType === "TRANSCRIBE");
  const latestReadJob = source.ingestJobs.find((job) => job.jobType !== "TRANSCRIBE");
  const busy = (source.sourceUnderstanding?.status === "RUNNING" && !understandingExpired(source.sourceUnderstanding)) || source.status === "PENDING"
    || source.status === "PROCESSING"
    || [latestTranscription, latestReadJob].some((job) => job?.status === "QUEUED" || job?.status === "RUNNING");
  const metadata = latestTranscription?.metadata;
  const stage = metadata && typeof metadata === "object" && !Array.isArray(metadata) && "progressStage" in metadata
    ? metadata.progressStage : null;
  const safeStage = typeof stage === "string" && ["QUEUED", "EXTRACTING_AUDIO", "UPLOADING_AUDIO", "TRANSCRIBING", "PERSISTING", "SUCCEEDED"].includes(stage)
    ? stage : null;
  return NextResponse.json({
    busy,
    sourceStatus: source.status,
    transcriptionStatus: latestTranscription?.status ?? null,
    transcription: latestTranscription ? {
      status: latestTranscription.status,
      progress: latestTranscription.progress,
      stage: safeStage,
      errorMessage: latestTranscription.status === "FAILED" ? latestTranscription.errorMessage?.slice(0, 200) ?? null : null,
    } : null,
    hasTranscript: Boolean(source.transcript),
    transcriptUpdatedAt: source.transcript?.updatedAt.toISOString() ?? null,
    fingerprint: [
      source.updatedAt.toISOString(),
      source.sourceUnderstanding?.updatedAt.toISOString() ?? "none",
      source.transcript?.updatedAt.toISOString() ?? "none",
      ...source.ingestJobs.map((job) => `${job.id}:${job.status}:${job.updatedAt.toISOString()}`),
    ].join("|"),
  });
}
