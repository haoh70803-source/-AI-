import "server-only";
import { db } from "@content-center/db";
import { parseMasterEncryptionKey } from "@content-center/integrations";
export type ReadinessChecks = { database: boolean; storage: boolean };
export async function releaseReadiness(dependencies: { database: () => Promise<boolean>; storage: (endpoint: string) => Promise<boolean> } = {
  database: async () => { try { await db.$queryRawUnsafe("SELECT 1"); return true; } catch { return false; } },
  storage: async endpoint => { try { const response = await fetch(new URL("/minio/health/ready", endpoint), { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(1500), redirect: "error" }); return response.status === 200; } catch { return false; } },
}) {
  const mode = process.env.LOCAL_RELEASE_PROFILE;
  const expected = mode === "daily" ? { port: "55432", db: "/content_center", storage: "http://127.0.0.1:9000", environment: "LOCAL_REAL" } : mode === "review" ? { port: "55438", db: "/content_center_12_review", storage: "http://127.0.0.1:19020", environment: "LOCAL_REVIEW" } : null;
  let valid: boolean;
  try {
    parseMasterEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY);
    const url = new URL(process.env.DATABASE_URL ?? "");
    valid = Boolean(expected && ["postgres:","postgresql:"].includes(url.protocol) && ["127.0.0.1","localhost"].includes(url.hostname) && url.port === expected.port && url.pathname === expected.db
      && process.env.ENVIRONMENT_ID === expected.environment && process.env.S3_ENDPOINT === expected.storage
      && process.env.STORAGE_DRIVER === "S3_COMPATIBLE" && process.env.FREE_WORKER_MODE === "false" && process.env.EXTERNAL_CALLS_DISABLED === "true");
  } catch { valid = false; }
  if (!valid || !expected) return { ready: false, checks: { configuration: false, database: false, storage: false }, backgroundTasks: "disabled" } as const;
  const [database, storage] = await Promise.all([dependencies.database().catch(() => false), dependencies.storage(expected.storage).catch(() => false)]);
  return { ready: database && storage, checks: { configuration: true, database, storage }, backgroundTasks: "disabled" } as const;
}
