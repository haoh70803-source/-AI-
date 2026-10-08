import { freeWorkerMode } from "./free-runtime";
import { experienceLimitsEnabled } from "./experience-limits";
import { Queue, type ConnectionOptions } from "bullmq";
import { deliveryKey } from "./queue-producer";
import { createRedisConnection, queuePrefix } from "./redis-connection";

export const TRANSCRIBE_SOURCE_QUEUE = "transcribe-source";
export const TRANSCRIBE_SOURCE = "TRANSCRIBE_SOURCE";

export type TranscribeSourcePayload = {
  jobId: string;
  dispatchRevision?: number;
  workspaceId: string;
  sourceItemId: string;
  mediaAssetId?: string;
  videoAssetId?: string;
  requestedById: string;
};

function connection(): ConnectionOptions {
  return createRedisConnection();
}

export function createTranscribeSourceQueue() {
  const queue = new Queue<TranscribeSourcePayload>(TRANSCRIBE_SOURCE_QUEUE, { connection: { ...connection(), maxRetriesPerRequest: 1, retryStrategy: () => null }, prefix: queuePrefix() });
  queue.on("error", () => console.warn("QUEUE_CONNECTION_FAILED"));
  return queue;
}

export async function enqueueTranscribeSource(payload: TranscribeSourcePayload, maxAttempts = 3) {
  const queue = createTranscribeSourceQueue();
  try {
    if (experienceLimitsEnabled()) await queue.setGlobalConcurrency(freeWorkerMode() ? 1 : 2);
    return await queue.add(TRANSCRIBE_SOURCE, payload, {
      jobId: deliveryKey(TRANSCRIBE_SOURCE, payload),
      attempts: maxAttempts,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 10000 },
    });
  } finally {
    await queue.close();
  }
}

export function transcriptionQueueConnection(): ConnectionOptions {
  return connection();
}
