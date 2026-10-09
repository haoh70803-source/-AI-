import "server-only";
import { createHash } from "node:crypto";
import { RedisConnection } from "bullmq";
import { createRedisConnection } from "@content-center/worker/redis-connection";

export interface AssistantCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

let connection: RedisConnection | undefined;
let retryAt = 0;
function unavailable() {
  const failed = connection;
  connection = undefined;
  retryAt = Date.now() + 30_000;
  void failed?.close(true).catch(() => {});
}
async function client() {
  const endpoint = process.env.ASSISTANT_REDIS_URL || process.env.REDIS_URL;
  if (!endpoint || process.env.LOCAL_REVIEW_OFFLINE === "true" || Date.now() < retryAt) return null;
  try {
    if (!connection) {
      connection = new RedisConnection({ ...createRedisConnection(endpoint), connectTimeout: 300, commandTimeout: 300, enableOfflineQueue: false, retryStrategy: () => null }, { blocking: false, skipVersionCheck: true });
      connection.on("error", () => {});
    }
    return await connection.client;
  } catch {
    unavailable();
    return null;
  }
}

/** Shared acceleration only. Callers must reauthorize and rehydrate cached IDs. */
export const assistantCache: AssistantCache = {
  async get(key) { try { return await (await client())?.get(key) ?? null; } catch { unavailable(); return null; } },
  async set(key, value, ttlSeconds) { try { await (await client())?.set(key, value, { EX: ttlSeconds }); } catch { unavailable(); } },
};

export function assistantCacheKey(namespace: string, scope: unknown) {
  return `assistant:${namespace}:v1:${createHash("sha256").update(JSON.stringify(scope)).digest("hex")}`;
}
