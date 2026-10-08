import { db } from "@content-center/db";
import { withIngestExecution } from "../job-recovery";
import { acquireWorkerMode } from "../worker-mode";
import type { Job } from "bullmq";
import type { ContentIngestPayload } from "../queue-producer";
if (new URL(process.env.DATABASE_URL!).port !== "55436" || new URL(process.env.REDIS_URL!).port !== "56381" || !process.env.QUEUE_PREFIX?.startsWith("architecture-b-")) throw new Error("ISOLATED_FIXTURE_REQUIRED");
setInterval(() => {},1000);
if (process.argv[2] === "mode") {
  await acquireWorkerMode("independent", () => process.exit(2),1000);
  console.log("FIXTURE_MODE_READY");
} else {
  const data = JSON.parse(process.argv[2]!) as ContentIngestPayload;
  await withIngestExecution({data,attemptsMade:0} as Job<ContentIngestPayload>,async()=>{
    await db.ingestJob.update({where:{id:data.jobId},data:{status:"RUNNING",attempt:1,startedAt:new Date()}});
    console.log("FIXTURE_PROVIDER_PHASE");
    return new Promise<never>(()=>{});
  });
}
