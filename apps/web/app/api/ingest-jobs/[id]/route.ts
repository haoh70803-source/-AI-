import { db, findIngestJobForUser } from "@content-center/db";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function currentStage(job: { status: string; jobType: string; metadata: unknown }) {
  if (job.status === "SUCCEEDED") return "READY" as const;
  if (job.status === "FAILED" || job.status === "CANCELLED") return "FAILED" as const;
  if (job.status === "QUEUED") return "QUEUED" as const;
  const progressStage = metadataRecord(job.metadata).progressStage;
  if (job.jobType === "TRANSCRIBE" || progressStage === "EXTRACTING_AUDIO" || progressStage === "UPLOADING_AUDIO") return "TRANSCRIBING" as const;
  return "READING" as const;
}

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  const job = await findIngestJobForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, jobId: id });
  if (!job) return apiError("NOT_FOUND", 404);
  const stage = currentStage(job);
  return NextResponse.json({
    id: job.id,
    sourceItemId: job.sourceItemId,
    jobType: job.jobType,
    status: job.status,
    progress: job.status === "RUNNING" ? job.progress : undefined,
    currentStage: stage,
    userSafeMessage: stage === "FAILED" ? "处理失败，请点击重试处理。" : undefined,
  });
}
