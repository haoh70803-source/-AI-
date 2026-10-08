import { randomUUID } from "node:crypto";
import { QueueEvents } from "bullmq";
import { describe, expect, it } from "vitest";
import { createHealthQueue, createHealthWorker, SYSTEM_HEALTH_CHECK, SYSTEM_QUEUE } from "./queue";
import { createRedisConnection, queuePrefix } from "./redis-connection";

describe("Redis / BullMQ integration", () => {
  it("moves a web-created health job through Redis to the worker", async () => {
    const queue = createHealthQueue();
    const worker = createHealthWorker();
    const events = new QueueEvents(SYSTEM_QUEUE, { connection: createRedisConnection(), prefix: queuePrefix() });

    try {
      await Promise.all([worker.waitUntilReady(), events.waitUntilReady()]);
      const job = await queue.add(SYSTEM_HEALTH_CHECK, { requestedBy: "integration-test" }, {
        jobId: randomUUID(),
        removeOnComplete: true,
      });
      await expect(job.waitUntilFinished(events, 10_000)).resolves.toMatchObject({ status: "ok" });
    } finally {
      await Promise.all([queue.close(), worker.close(), events.close()]);
    }
  });
});
