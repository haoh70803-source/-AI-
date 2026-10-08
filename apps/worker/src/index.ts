import { acquireWorkerMode, assertWorkerMode } from "./worker-mode";
import { startJobReconciler, recordTerminalQueueFailure } from "./job-recovery";
import type { Job } from "bullmq";
import type { ContentIngestPayload } from "./queue-producer";
import { createServer } from "node:http";
import { createContentIngestWorker, createHealthWorker, createTranscribeSourceWorker } from "./queue";
import { cleanupExpiredAsrAudio } from "./transcription";

assertWorkerMode("independent");
const modeLease = await acquireWorkerMode("independent", () => { console.warn("WORKER_MODE_LEASE_LOST"); void shutdown(1); });
const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? "3010");
let ready = false;
const healthServer = createServer((request, response) => {
  if (request.url !== "/" && request.url !== "/health") {
    response.writeHead(404);
    response.end();
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
  response.end(request.method === "HEAD" ? undefined : JSON.stringify({ status: ready ? "READY" : "STARTING" }));
});
healthServer.listen(healthPort, "127.0.0.1");

const worker = createHealthWorker();
const ingestWorker = createContentIngestWorker();
const transcriptionWorker = createTranscribeSourceWorker();
// Reflect terminal queue failures (including lost/stalled workers) in the persisted UI state.
for (const processor of [ingestWorker, transcriptionWorker]) processor.on("failed", (job, error) => {
  if (!job || !("jobId" in job.data)) return;
  void recordTerminalQueueFailure(job as Job<ContentIngestPayload>,error).catch(() => console.warn("JOB_FAILURE_STATE_UPDATE_FAILED"));
});
await Promise.all([worker.waitUntilReady(), ingestWorker.waitUntilReady(), transcriptionWorker.waitUntilReady()]);
ready = true;
console.info("WORKER_CONNECTED");
const stopReconciler = startJobReconciler();

const audioCleanupTimer = setInterval(() => {
  void cleanupExpiredAsrAudio().catch(() => console.warn("ASR_AUDIO_CLEANUP_RUN_FAILED"));
}, 60 * 60 * 1_000);
audioCleanupTimer.unref();

async function shutdown(exitCode = 0) {
  ready = false;
  clearInterval(audioCleanupTimer);
  stopReconciler();
  await new Promise<void>((resolve) => {
    if (!healthServer.listening) {
      resolve();
      return;
    }
    healthServer.close(() => resolve());
  });
  await Promise.all([worker.close(), ingestWorker.close(), transcriptionWorker.close()]);
  await modeLease.close();
  process.exit(exitCode);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
