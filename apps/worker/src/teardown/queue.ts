import { Queue } from "bullmq";
import { createRedisConnection, queuePrefix } from "../redis-connection";
export const TEARDOWN_QUEUE = "research-teardown";
export type TeardownPayload = { runId: string; workspaceId: string; requestedById: string; version?: number };
export function teardownJobId(payload: TeardownPayload) { return (payload.version ?? 1) === 1 ? payload.runId : `${payload.runId}-v${payload.version}`; }
export function createTeardownQueue() {
  const queue = new Queue<TeardownPayload>(TEARDOWN_QUEUE, { connection: { ...createRedisConnection(), maxRetriesPerRequest: 1, retryStrategy: () => null }, prefix: queuePrefix() });
  queue.on("error", () => console.warn("TEARDOWN_QUEUE_CONNECTION_FAILED"));
  return queue;
}
export async function enqueueTeardown(payload: TeardownPayload) {
  const queue = createTeardownQueue();
  try {
    return await queue.add("TEARDOWN", payload, { jobId: teardownJobId(payload), attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 } });
  } finally { await queue.close(); }
}
export async function teardownWorkerReady() {
  const queue = createTeardownQueue();
  try { return (await queue.getWorkers()).length > 0; }
  catch { return false; }
  finally { await queue.close().catch(() => undefined); }
}
