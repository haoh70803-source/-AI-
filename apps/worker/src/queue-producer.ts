import { Queue } from "bullmq";
import { createHash } from "node:crypto";
import { createRedisConnection, queuePrefix } from "./redis-connection";
export function deliveryKey(name: string, payload: { jobId: string; workspaceId: string; dispatchRevision?: number }) {
  return createHash("sha256").update(JSON.stringify([name,payload.workspaceId,payload.jobId,payload.dispatchRevision ?? 0])).digest("hex");
}
export const SYSTEM_QUEUE = "system-health";
export const SYSTEM_HEALTH_CHECK = "SYSTEM_HEALTH_CHECK";
export const CONTENT_INGEST_QUEUE = "content-ingest";
export const CONTENT_INGEST = "CONTENT_INGEST";
export const ANALYZE_MATERIAL = "ANALYZE_MATERIAL";
export const ANALYZE_BENCHMARK = "ANALYZE_BENCHMARK";
export const IDENTIFY_BENCHMARK_PLAYBOOKS = "IDENTIFY_BENCHMARK_PLAYBOOKS";
export const GENERATE_BENCHMARK_CREATOR_PROFILE = "GENERATE_BENCHMARK_CREATOR_PROFILE";
export const DISTILL_MATERIAL = "DISTILL_MATERIAL";
export const COLLECT_BENCHMARK_RUN = "COLLECT_BENCHMARK_RUN";

export type ContentIngestPayload = {
  jobId: string;
  workspaceId: string;
  sourceItemId: string;
  requestedById: string;
  dispatchRevision?: number;
};

export type BenchmarkStudyPayload = {
  studyId: string;
  workspaceId: string;
  requestedById: string;
};

export type BenchmarkCollectionPayload = {
  runId: string;
  workspaceId: string;
  requestedById: string;
};

export type ContentIngestJobPayload = ContentIngestPayload | BenchmarkStudyPayload | BenchmarkCollectionPayload;
export function createHealthQueue() {
  const queue = new Queue(SYSTEM_QUEUE, { connection: { ...createRedisConnection(), maxRetriesPerRequest: 1, retryStrategy: () => null }, prefix: queuePrefix() });
  queue.on("error", () => console.warn("QUEUE_CONNECTION_FAILED"));
  return queue;
}

export function createContentIngestQueue() {
  const queue = new Queue<ContentIngestJobPayload>(CONTENT_INGEST_QUEUE, { connection: { ...createRedisConnection(), maxRetriesPerRequest: 1, retryStrategy: () => null }, prefix: queuePrefix() });
  queue.on("error", () => console.warn("QUEUE_CONNECTION_FAILED"));
  return queue;
}

async function enqueueOnContentQueue(name: typeof CONTENT_INGEST | typeof ANALYZE_MATERIAL | typeof ANALYZE_BENCHMARK | typeof IDENTIFY_BENCHMARK_PLAYBOOKS | typeof GENERATE_BENCHMARK_CREATOR_PROFILE | typeof DISTILL_MATERIAL | typeof COLLECT_BENCHMARK_RUN, payload: ContentIngestJobPayload, maxAttempts: number) {
  const queue = createContentIngestQueue();
  try {
    const payloadId = "jobId" in payload ? payload.jobId : "studyId" in payload ? payload.studyId : payload.runId;
    return await queue.add(name, payload, {
      jobId: "jobId" in payload ? deliveryKey(name, payload) : `${payloadId}-${Date.now()}`,
      attempts: maxAttempts,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 10000 },
    });
  } finally {
    await queue.close();
  }
}

export async function enqueueMaterialAnalysis(payload: ContentIngestPayload, maxAttempts = 3) {
  return enqueueOnContentQueue(ANALYZE_MATERIAL, payload, maxAttempts);
}

export async function enqueueBenchmarkStudy(payload: BenchmarkStudyPayload, maxAttempts = 3) {
  return enqueueOnContentQueue(ANALYZE_BENCHMARK, payload, maxAttempts);
}

export async function enqueueBenchmarkPlaybookStudy(payload: BenchmarkStudyPayload, maxAttempts = 3) {
  return enqueueOnContentQueue(IDENTIFY_BENCHMARK_PLAYBOOKS, payload, maxAttempts);
}

export async function enqueueBenchmarkCreatorProfileStudy(payload: BenchmarkStudyPayload, maxAttempts = 3) {
  return enqueueOnContentQueue(GENERATE_BENCHMARK_CREATOR_PROFILE, payload, maxAttempts);
}

export async function enqueueBenchmarkCollectionRun(payload: BenchmarkCollectionPayload, maxAttempts = 1) {
  return enqueueOnContentQueue(COLLECT_BENCHMARK_RUN, payload, maxAttempts);
}

export async function enqueueMaterialDistillation(payload: ContentIngestPayload, maxAttempts = 3) {
  return enqueueOnContentQueue(DISTILL_MATERIAL, payload, maxAttempts);
}

export async function enqueueContentIngest(payload: ContentIngestPayload, maxAttempts = 3) {
  return enqueueOnContentQueue(CONTENT_INGEST, payload, maxAttempts);
}
