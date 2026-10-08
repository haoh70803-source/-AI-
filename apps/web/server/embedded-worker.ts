import { acquireWorkerMode } from "@content-center/worker/worker-mode";
import { startJobReconciler, recordTerminalQueueFailure } from "@content-center/worker/job-recovery";
import "server-only";
import type { Job } from "bullmq";
import type { ContentIngestPayload } from "@content-center/worker/queue-producer";
import { createContentIngestWorker, createTranscribeSourceWorker } from "@content-center/worker/queue";
let starting: Promise<void> | undefined;
export function startEmbeddedWorker() { return starting ??= start(); }
async function start() {
  let close = () => {};
  const lease = await acquireWorkerMode("embedded", () => close());
  const workers = [createContentIngestWorker(), createTranscribeSourceWorker()];
  for(const worker of workers) {
    worker.on("error",()=>console.warn("FREE_EXPERIENCE_WORKER_ERROR"));
    worker.on("failed",(job,error)=>{
      if(!job || !("jobId" in job.data))return;
      void recordTerminalQueueFailure(job as Job<ContentIngestPayload>,error).catch(()=>console.warn("EMBEDDED_WORKER_STATE_UPDATE_FAILED"));
    });
  }
  await Promise.all(workers.map(worker=>worker.waitUntilReady()));
  const stopReconciler = startJobReconciler();
  close=()=>{stopReconciler();void Promise.all(workers.map(worker=>worker.close())).then(()=>lease.close()).catch(()=>console.warn("EMBEDDED_WORKER_CLOSE_FAILED"))};
  process.once("SIGTERM",close);process.once("SIGINT",close);
  console.info("FREE_EXPERIENCE_WORKER_CONNECTED",{rssMB:Math.round(process.memoryUsage().rss/1024/1024)});
}
