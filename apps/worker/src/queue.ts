import { freeWorkerMode, runFreeTask } from "./free-runtime";
import { experienceLimitsEnabled, reserveExperienceUsage, ExperienceLimitError } from "./experience-limits";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { processContentIngestJob } from "./ingest";
import { processMaterialAnalysisJob } from "./material-analysis";
import { processBenchmarkStudyJob } from "./benchmark-analysis";
import { processBenchmarkPlaybookJob } from "./benchmark-playbook";
import { processBenchmarkCreatorProfileJob } from "./benchmark-creator-profile";
import { processBenchmarkCollectionRunJob } from "./benchmark-collection";
import { processMaterialDistillationJob } from "./material-distillation";
import { createRedisConnection } from "./redis-connection";
import { db } from "@content-center/db";
import { processTranscribeSourceJob, requestSourceTranscription, TranscriptionAlreadyRunningError } from "./transcription";
import {
  transcriptionQueueConnection,
  TRANSCRIBE_SOURCE,
  TRANSCRIBE_SOURCE_QUEUE,
  type TranscribeSourcePayload,
} from "./transcription-queue";

export {
  createTranscribeSourceQueue,
  enqueueTranscribeSource,
  TRANSCRIBE_SOURCE,
  TRANSCRIBE_SOURCE_QUEUE,
  type TranscribeSourcePayload,
} from "./transcription-queue";

import { withIngestExecution } from "./job-recovery";
import { queuePrefix } from "./redis-connection";
import { SYSTEM_QUEUE, SYSTEM_HEALTH_CHECK, CONTENT_INGEST_QUEUE, CONTENT_INGEST, ANALYZE_MATERIAL, ANALYZE_BENCHMARK, IDENTIFY_BENCHMARK_PLAYBOOKS, GENERATE_BENCHMARK_CREATOR_PROFILE, DISTILL_MATERIAL, COLLECT_BENCHMARK_RUN, type ContentIngestPayload, type ContentIngestJobPayload, type BenchmarkStudyPayload, type BenchmarkCollectionPayload } from "./queue-producer";
export * from "./queue-producer";
export function createHealthWorker() {
  return new Worker(
    SYSTEM_QUEUE,
    async (job) => {
      if (job.name !== SYSTEM_HEALTH_CHECK) {
        throw new Error(`Unsupported job: ${job.name}`);
      }

      const result = { status: "ok" as const, processedAt: new Date().toISOString() };
      console.info("SYSTEM_HEALTH_CHECK_COMPLETED", { jobId: job.id });
      return result;
    },
    { connection: createRedisConnection(), prefix: queuePrefix() },
  );
}

export function createContentIngestWorker() {
  return new Worker<ContentIngestJobPayload>(
    CONTENT_INGEST_QUEUE,
    async (job) => runFreeTask(() => "jobId" in job.data ? withIngestExecution(job as Job<ContentIngestPayload>, () => dispatch(job)) : dispatch(job)),
    { connection: createRedisConnection(), prefix: queuePrefix(), concurrency: freeWorkerMode() ? 1 : 2 },
  );
}
async function dispatch(job: Job<ContentIngestJobPayload>) {
      const release = job.name !== CONTENT_INGEST && job.name !== COLLECT_BENCHMARK_RUN ? await reserveExperienceUsage({ workspaceId: job.data.workspaceId, userId: job.data.requestedById, operation: "AI" }).catch(error => { throw error instanceof ExperienceLimitError ? new UnrecoverableError(error.message) : error; }) : async () => {};
      try {
      if (job.name === CONTENT_INGEST) {
        const ingestJob = job as Job<ContentIngestPayload>;
        const result = await processContentIngestJob(ingestJob);
        const record = await db.ingestJob.findUnique({where:{id:ingestJob.data.jobId},select:{status:true,metadata:true}});
        const auto = record?.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) && record.metadata.autoTranscribe === true;
        if (record?.status === "SUCCEEDED" && auto && !await db.transcript.findUnique({where:{sourceItemId:ingestJob.data.sourceItemId},select:{id:true}})) {
          try { await requestSourceTranscription({...ingestJob.data}); }
          catch (error) {
            if (!(error instanceof TranscriptionAlreadyRunningError)) await db.ingestJob.create({data:{workspaceId:ingestJob.data.workspaceId,sourceItemId:ingestJob.data.sourceItemId,requestedById:ingestJob.data.requestedById,jobType:"TRANSCRIBE",provider:"AUTO",providerMode:"REAL",status:"FAILED",errorCode:"AUTO_TRANSCRIPTION_FAILED",errorMessage:error instanceof ExperienceLimitError ? error.message : "采集完成，但自动转写未能启动，请检查转写配置后重试。",finishedAt:new Date()}});
          }
        }
        return result;
      }
      if (job.name === ANALYZE_MATERIAL) return await processMaterialAnalysisJob(job as Job<ContentIngestPayload>);
      if (job.name === ANALYZE_BENCHMARK) return await processBenchmarkStudyJob(job as Job<BenchmarkStudyPayload>);
      if (job.name === IDENTIFY_BENCHMARK_PLAYBOOKS) return await processBenchmarkPlaybookJob(job as Job<BenchmarkStudyPayload>);
      if (job.name === GENERATE_BENCHMARK_CREATOR_PROFILE) return await processBenchmarkCreatorProfileJob(job as Job<BenchmarkStudyPayload>);
      if (job.name === COLLECT_BENCHMARK_RUN) return await processBenchmarkCollectionRunJob(job as Job<BenchmarkCollectionPayload>);
      if (job.name === DISTILL_MATERIAL) return await processMaterialDistillationJob(job as Job<ContentIngestPayload>);
      throw new UnrecoverableError(`Unsupported job: ${job.name}`);
      } finally { await release(); }
}


export function createTranscribeSourceWorker() {
  return new Worker<TranscribeSourcePayload>(
    TRANSCRIBE_SOURCE_QUEUE,
    async (job) => runFreeTask(() => withIngestExecution(job, async () => {
      if (job.name !== TRANSCRIBE_SOURCE) throw new UnrecoverableError(`Unsupported job: ${job.name}`);
      return await processTranscribeSourceJob(job);
    })),
    { connection: transcriptionQueueConnection(), prefix: queuePrefix(), concurrency: freeWorkerMode() ? 1 : experienceLimitsEnabled() ? 2 : 1 },
  );
}
