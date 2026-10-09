import "server-only";
import { db } from "@content-center/db";
import { parseMasterEncryptionKey } from "@content-center/integrations";
import { createHealthQueue } from "@content-center/worker/queue-producer";
import { queuePrefix } from "@content-center/worker/redis-connection";
import { FFmpegMediaProcessor } from "@content-center/providers";
async function materialTasksReady() {
  const queue = createHealthQueue();
  try {
    const client = await queue.backend.client;
    await new FFmpegMediaProcessor().checkAvailability();
    const leases = await client.zrange(`${queuePrefix()}:worker-mode`, 0, -1, { WITHSCORES: true });
    return leases.some((value, index) => index % 2 === 1 && Number(value) > Date.now());
  } catch { return false; }
  finally { await queue.close(); }
}
export type ReadinessChecks = { database: boolean; storage: boolean };
export async function releaseReadiness(dependencies: { database: () => Promise<boolean>; storage: (endpoint: string) => Promise<boolean>; background?: () => Promise<boolean> } = {
  database: async () => { try { await db.$queryRawUnsafe("SELECT 1"); return true; } catch { return false; } },
  storage: async endpoint => { try { const response = await fetch(new URL("/minio/health/ready", endpoint), { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(1500), redirect: "error" }); return response.status === 200; } catch { return false; } },
  background: materialTasksReady,
}) {
  const mode = process.env.LOCAL_RELEASE_PROFILE;
  const expected = mode === "daily" ? { port: "55432", db: "/content_center", storage: "http://127.0.0.1:9000", environment: "LOCAL_REAL" } : mode === "review" || mode === "live" ? { port: "55438", db: "/content_center_12_review", storage: "http://127.0.0.1:19020", environment: mode === "live" ? "LOCAL_LIVE" : "LOCAL_REVIEW" } : null;
  let valid: boolean;
  try {
    parseMasterEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY);
    const url = new URL(process.env.DATABASE_URL ?? "");
    valid = Boolean(expected && ["postgres:","postgresql:"].includes(url.protocol) && ["127.0.0.1","localhost"].includes(url.hostname) && url.port === expected.port && url.pathname === expected.db
      && process.env.ENVIRONMENT_ID === expected.environment && process.env.S3_ENDPOINT === expected.storage
      && process.env.STORAGE_DRIVER === "S3_COMPATIBLE" && process.env.FREE_WORKER_MODE === "false" && process.env.EXTERNAL_CALLS_DISABLED === (mode === "live" ? "false" : "true")
      && (mode !== "live" || (process.env.LOCAL_REVIEW_OFFLINE === "false" && process.env.WORKER_MODE === "embedded" && process.env.REDIS_URL === "redis://127.0.0.1:16379/0" && process.env.QUEUE_PREFIX === "content-center-12-material")));
  } catch { valid = false; }
  if (!valid || !expected) return { ready: false, checks: { configuration: false, database: false, storage: false }, backgroundTasks: "disabled" } as const;
  const [database, storage] = await Promise.all([dependencies.database().catch(() => false), dependencies.storage(expected.storage).catch(() => false)]);
  if (mode === "live") {
    const background = await (dependencies.background ?? materialTasksReady)().catch(() => false);
    return { ready: database && storage && background, checks: { configuration: true, database, storage, background }, backgroundTasks: background ? "enabled" : "unavailable", externalCalls: "enabled" } as const;
  }
  return { ready: database && storage, checks: { configuration: true, database, storage }, backgroundTasks: "disabled" } as const;
}
