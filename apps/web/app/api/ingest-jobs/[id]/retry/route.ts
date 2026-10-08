import { db, findIngestJobForUser } from "@content-center/db";
import { enqueueContentIngest } from "@content-center/worker/queue-producer";
import { dispatchRevision, executionLock, markDispatchPending } from "@content-center/worker/job-recovery";
import { requestSourceTranscription } from "@content-center/worker/transcription";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  const job = await findIngestJobForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, jobId: id });
  if (!job) return apiError("NOT_FOUND", 404);
  if (job.status !== "FAILED") return apiError("JOB_NOT_RETRYABLE", 409);
  const source = await db.sourceItem.findFirst({
    where: { id: job.sourceItemId, workspaceId: context.workspace.id, status: { not: "ARCHIVED" } },
    select: { id: true },
  });
  if (!source) return apiError("SOURCE_NOT_RETRYABLE", 409);
  if (job.jobType === "TRANSCRIBE") {
    try {
      const queued = await requestSourceTranscription({ workspaceId: job.workspaceId, sourceItemId: job.sourceItemId, requestedById: context.session.user.id });
      return NextResponse.json({ jobId: queued.job.id, status: "QUEUED" }, { status: 202 });
    } catch {
      return apiError("TRANSCRIPTION_RETRY_FAILED", 503, "转写重试暂时无法开始，请稍后再试。");
    }
  }
  // Analysis/distillation must use their own request services, never the ingest processor.
  if (!["EXTRACT_TEXT","FETCH_URL","PROCESS_MEDIA"].includes(job.jobType)) return apiError("JOB_RETRY_REQUIRES_REQUEST_SERVICE",409);
  const revision = dispatchRevision(job.metadata) + 1;
  const changed = await db.$transaction(async tx => {
    if (!await executionLock(tx,job.workspaceId,job.id)) return false;
    await tx.$queryRawUnsafe('SELECT "id" FROM "SourceItem" WHERE "id"=$1 AND "workspaceId"=$2 FOR UPDATE',job.sourceItemId,job.workspaceId);
    if(!await tx.sourceItem.findFirst({where:{id:job.sourceItemId,workspaceId:job.workspaceId,status:{not:"ARCHIVED"}},select:{id:true}}))return false;
    const metadata = job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata) ? job.metadata : {};
    const updated = await tx.ingestJob.updateMany({where:{id:job.id,workspaceId:job.workspaceId,status:"FAILED"},data:{requestedById:context.session.user.id,status:"QUEUED",progress:0,attempt:0,errorCode:null,errorMessage:null,startedAt:null,finishedAt:null,metadata:{...metadata,dispatchRevision:revision}}});
    if (!updated.count) return false;
    await tx.sourceItem.updateMany({where:{id:job.sourceItemId,workspaceId:job.workspaceId,status:{not:"ARCHIVED"}},data:{status:"PENDING"}});
    await tx.auditLog.create({data:{workspaceId:job.workspaceId,userId:context.session.user.id,action:"ingest.retried",resourceType:"ingest_job",resourceId:job.id,metadata:{dispatchRevision:revision}}});
    return true;
  });
  if (!changed) return apiError("JOB_NOT_RETRYABLE",409);
  try {
    await enqueueContentIngest({ jobId: job.id, workspaceId: job.workspaceId, sourceItemId: job.sourceItemId, requestedById: context.session.user.id, dispatchRevision: revision }, job.maxAttempts);
  } catch {
    await markDispatchPending(job.id, job.workspaceId);

  }
  return NextResponse.json({ jobId: job.id, status: "QUEUED" }, { status: 202 });
}
