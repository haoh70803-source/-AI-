import { db, type Prisma } from "@content-center/db";
import { UnrecoverableError, type Job } from "bullmq";
import { createContentIngestQueue, deliveryKey, CONTENT_INGEST, ANALYZE_MATERIAL, DISTILL_MATERIAL, type ContentIngestPayload } from "./queue-producer";
import { createTranscribeSourceQueue, TRANSCRIBE_SOURCE } from "./transcription-queue";

export function dispatchRevision(metadata: unknown) {
  const value = metadata && typeof metadata === "object" && !Array.isArray(metadata) && "dispatchRevision" in metadata ? metadata.dispatchRevision : 0;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export async function markDispatchPending(jobId: string, workspaceId: string) {
  await db.ingestJob.updateMany({ where: { id: jobId, workspaceId, status: "QUEUED" }, data: { errorCode: "DISPATCH_PENDING", errorMessage: "任务已保存，等待队列恢复。", finishedAt: null } });
}

export async function executionLock(tx: Prisma.TransactionClient, workspaceId: string, jobId: string) {
  const key = JSON.stringify(["ingest-execution", workspaceId, jobId]);
  const [row] = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", key);
  return row?.locked === true;
}

export async function withIngestExecution<T>(job: Job<ContentIngestPayload>, execute: () => Promise<T>) {
  // Only an advisory lock is held across provider I/O; processor row transactions remain short.
  // Each running job reserves one additional DB connection, bounded by worker concurrency.
  return db.$transaction(async tx => {
    if (!await executionLock(tx, job.data.workspaceId, job.data.jobId)) return { status: "already-running" };
    const record = await tx.ingestJob.findFirst({ where: { id: job.data.jobId, workspaceId: job.data.workspaceId, sourceItemId: job.data.sourceItemId, requestedById: job.data.requestedById }, include: { sourceItem: { select: { workspaceId: true, status: true } } } });
    if (!record || record.sourceItem.workspaceId !== record.workspaceId) throw new UnrecoverableError("Job scope mismatch");
    if (dispatchRevision(record.metadata) !== (job.data.dispatchRevision ?? 0)) return { status: "obsolete-delivery" };
    if (record.status === "SUCCEEDED") return { status: "already-succeeded" };
    if (record.status === "CANCELLED" || record.sourceItem.status === "ARCHIVED") return { status: "cancelled" };
    if (record.status === "FAILED") throw new UnrecoverableError("Job requires explicit retry");
    const [user,workspace,member] = await Promise.all([
      tx.user.findUnique({where:{id:record.requestedById},select:{disabledAt:true}}),
      tx.workspace.findUnique({where:{id:record.workspaceId},select:{disabledAt:true}}),
      tx.workspaceMember.findFirst({where:{workspaceId:record.workspaceId,userId:record.requestedById},select:{role:true}}),
    ]);
    if(!user || user.disabledAt || !workspace || workspace.disabledAt || !member || member.role==="VIEWER") {
      await tx.ingestJob.update({where:{id:record.id},data:{status:"FAILED",errorCode:"TASK_AUTHORIZATION_REVOKED",errorMessage:"当前账号或空间已不能执行该任务。",finishedAt:new Date()}});
      await settleRelated(tx,record,"TASK_AUTHORIZATION_REVOKED");
      return {status:"authorization-revoked"};
    }
    if (record.status === "RUNNING" && record.provider !== "MANUAL") {
      await tx.ingestJob.updateMany({ where: { id: record.id, workspaceId: record.workspaceId, status: "RUNNING" }, data: { status: "FAILED", errorCode: "RECOVERY_REVIEW_REQUIRED", errorMessage: "任务中断，外部调用结果需要人工核对后重试。", finishedAt: new Date() } });
      await settleRelated(tx,record,"RECOVERY_REVIEW_REQUIRED");
      return { status: "recovery-review-required" };
    }
    if (record.attempt >= record.maxAttempts) throw new UnrecoverableError("Job attempt budget exhausted");
    return execute();
  }, { timeout: 15 * 60 * 1000, maxWait: 10000 });
}

function queueName(type: string) {
  if (type === "TRANSCRIBE") return TRANSCRIBE_SOURCE;
  if (type === "ANALYZE_MATERIAL") return ANALYZE_MATERIAL;
  if (type === "DISTILL_MATERIAL") return DISTILL_MATERIAL;
  return CONTENT_INGEST;
}

export async function reconcileJobs(input: { workspaceId?: string; limit?: number; minimumAgeMs?: number; afterJobId?: string } = {}) {
  const rows = await db.ingestJob.findMany({ where: { ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}), status: { in: ["QUEUED", "RUNNING"] }, updatedAt: { lte: new Date(Date.now() - (input.minimumAgeMs ?? 10000)) } }, ...(input.afterJobId?{cursor:{id:input.afterJobId},skip:1}:{}), orderBy: [{createdAt:"asc"},{id:"asc"}], take: Math.min(Math.max(input.limit ?? 50, 1), 100), include: { sourceItem: { select: { workspaceId: true, status: true } } } });
  const results: Array<{ jobId: string; status: string }> = [];
  for (const record of rows) {
    if (record.sourceItem.workspaceId !== record.workspaceId) { results.push({ jobId: record.id, status: "scope-rejected" }); continue; }
    if (record.sourceItem.status === "ARCHIVED") {
      const cancelled=await db.$transaction(async tx=>{
        if(!await executionLock(tx,record.workspaceId,record.id))return false;
        const changed=await tx.ingestJob.updateMany({where:{id:record.id,workspaceId:record.workspaceId,status:{in:["QUEUED","RUNNING"]}},data:{status:"CANCELLED",finishedAt:new Date()}});
        if(changed.count)await settleRelated(tx,record,"CANCELLED");
        return true;
      });
      results.push({jobId:record.id,status:cancelled?"cancelled":"archive-awaiting-active-execution"});continue;
    }
    const queue = record.jobType === "TRANSCRIBE" ? createTranscribeSourceQueue() : createContentIngestQueue();
    try {
      const name = queueName(record.jobType);
      const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata : {};
      const mediaAssetId = "mediaAssetId" in metadata && typeof metadata.mediaAssetId === "string" ? metadata.mediaAssetId : undefined;
      const payload = { jobId: record.id, workspaceId: record.workspaceId, sourceItemId: record.sourceItemId, requestedById: record.requestedById, dispatchRevision: dispatchRevision(record.metadata), ...(record.jobType === "TRANSCRIBE" ? {mediaAssetId} : {}) };
      const existing = await queue.getJob(deliveryKey(name, payload));
      if (existing) {
        const state = await existing.getState();
        if (["failed", "completed"].includes(state)) {
          // Never silently replay an ended queue receipt with an unconfirmed business result.
          await db.$transaction(async tx=>{
            if(!await executionLock(tx,record.workspaceId,record.id))return;
            const changed=await tx.ingestJob.updateMany({ where: { id: record.id, workspaceId: record.workspaceId, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "FAILED", errorCode: "QUEUE_RECEIPT_REVIEW_REQUIRED", errorMessage: "队列已结束，但业务结果尚未确认，请核对后重试。", finishedAt: new Date() } });
            if(changed.count)await settleRelated(tx,record,"QUEUE_RECEIPT_REVIEW_REQUIRED");
          });
        }
        results.push({ jobId: record.id, status: "existing-" + state }); continue;
      }
      await queue.add(name, payload, { jobId: deliveryKey(name, payload), attempts: Math.max(1, record.maxAttempts - record.attempt), backoff: { type: "exponential", delay: 500 }, removeOnComplete: { age: 86400, count: 10000 }, removeOnFail: { age: 604800, count: 10000 } });
      results.push({ jobId: record.id, status: "dispatched" });
    } catch { await markDispatchPending(record.id, record.workspaceId); results.push({ jobId: record.id, status: "pending" }); }
    finally { await queue.close(); }
  }
  return results;
}

export function startJobReconciler() {
  let stopped = false, running = false, afterJobId: string | undefined;
  const run = async () => { if (stopped || running) return; running = true; try { const page=await reconcileJobs({afterJobId});afterJobId=page.length===50?page.at(-1)?.jobId:undefined; } catch { console.warn("JOB_RECONCILIATION_FAILED"); } finally { running = false; } };
  const timer = setInterval(() => { void run(); }, 30000); timer.unref(); void run();
  return () => { stopped = true; clearInterval(timer); };
}

export async function cancelIngestJob(input: ContentIngestPayload) {
  return db.$transaction(async tx => {
    const locked = await executionLock(tx, input.workspaceId, input.jobId);
    const record = await tx.ingestJob.findFirst({ where: { id: input.jobId, workspaceId: input.workspaceId, sourceItemId: input.sourceItemId } });
    if (!record) return { status: "not-found" as const };
    if (!["QUEUED", "RUNNING"].includes(record.status)) return { status: "not-cancellable" as const };
    if (!locked && record.provider !== "MANUAL") return { status: "external-in-flight" as const };
    await tx.ingestJob.update({ where: { id: record.id }, data: { status: "CANCELLED", finishedAt: new Date(), errorCode: null, errorMessage: null } });
    await settleRelated(tx,record,"CANCELLED");
    await tx.auditLog.create({ data: { workspaceId: record.workspaceId, userId: input.requestedById, action: "ingest.cancelled", resourceType: "ingest_job", resourceId: record.id } });
    return { status: "cancelled" as const };
  });
}

async function settleRelated(tx: Prisma.TransactionClient, record: {id:string;workspaceId:string;sourceItemId:string;metadata:unknown}, errorCode:string) {
  const metadata=record.metadata && typeof record.metadata==="object" && !Array.isArray(record.metadata)?record.metadata as Record<string,unknown>:{};
  if(typeof metadata.materialAnalysisId==="string") await tx.materialAnalysis.updateMany({where:{id:metadata.materialAnalysisId,workspaceId:record.workspaceId,sourceItemId:record.sourceItemId,status:"PROCESSING"},data:{status:"FAILED",errorCode,errorMessage:"后台任务已停止，请核对后重新请求。"}});
  if(typeof metadata.materialDistillationId==="string") await tx.materialDistillation.updateMany({where:{id:metadata.materialDistillationId,workspaceId:record.workspaceId,sourceItemId:record.sourceItemId,status:"PROCESSING"},data:{status:"FAILED",errorCode,errorMessage:"后台任务已停止，请核对后重新请求。"}});
}

export async function recordTerminalQueueFailure(job: Job<ContentIngestPayload>, error: Error) {
  const terminal = job.attemptsMade >= (job.opts.attempts || 1) || /stalled|unrecoverable/iu.test(error.message) || error.name === "UnrecoverableError";
  if (!terminal) return;
  await db.$transaction(async tx => {
    if (!await executionLock(tx,job.data.workspaceId,job.data.jobId)) return;
    const record=await tx.ingestJob.findFirst({where:{id:job.data.jobId,workspaceId:job.data.workspaceId,sourceItemId:job.data.sourceItemId,requestedById:job.data.requestedById,status:{in:["QUEUED","RUNNING"]}}});
    if(!record || dispatchRevision(record.metadata)!==(job.data.dispatchRevision ?? 0))return;
    await tx.ingestJob.update({where:{id:record.id},data:{status:"FAILED",errorCode:"WORKER_INTERRUPTED",errorMessage:"后台任务中断，请核对后重试。已保存资料不会丢失。",finishedAt:new Date()}});
    if(job.name===CONTENT_INGEST)await tx.sourceItem.updateMany({where:{id:record.sourceItemId,workspaceId:record.workspaceId,status:{in:["PENDING","PROCESSING"]}},data:{status:"FAILED"}});
    await tx.sourceAsset.updateMany({where:{sourceItemId:record.sourceItemId,workspaceId:record.workspaceId,status:"DOWNLOADING"},data:{status:"FAILED"}});
    await settleRelated(tx,record,"WORKER_INTERRUPTED");
  });
}
