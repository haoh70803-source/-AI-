import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { queuePrefix } from "./redis-connection";

export type WorkerMode = "disabled" | "independent" | "embedded";
export function configuredWorkerMode(env: NodeJS.ProcessEnv = process.env): WorkerMode {
  const mode = env.WORKER_MODE ?? (env.FREE_WORKER_MODE === "true" ? "embedded" : "disabled");
  if (!["disabled", "independent", "embedded"].includes(mode)) throw new Error("INVALID_WORKER_MODE");
  if (env.FREE_WORKER_MODE === "true" && mode !== "embedded") throw new Error("WORKER_MODE_CONFLICT");
  return mode as WorkerMode;
}
export function assertWorkerMode(expected: Exclude<WorkerMode,"disabled">) {
  if (configuredWorkerMode() !== expected) throw new Error("WORKER_MODE_NOT_ENABLED");
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL_REQUIRED");
}
const leaseScript = [
  "local clock=redis.call('TIME')",
  "local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)",
  "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)",
  "local members=redis.call('ZRANGE', KEYS[1], 0, -1)",
  "for _,member in ipairs(members) do if string.sub(member,1,string.len(ARGV[1])) ~= ARGV[1] then return 0 end end",
  "redis.call('ZADD', KEYS[1], now+tonumber(ARGV[2]), ARGV[3])",
  "redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2])*2)",
  "return 1"
].join("\n");

export async function acquireWorkerMode(mode: Exclude<WorkerMode,"disabled">, onLost: () => void, ttlMs = 30000) {
  assertWorkerMode(mode);
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true, connectTimeout: 2000, retryStrategy: () => null });
  redis.on("error", () => console.warn("WORKER_MODE_CONNECTION_FAILED"));
  await redis.connect();
  const key = queuePrefix() + ":worker-mode", member = mode + "|" + randomUUID();
  let stopped = false, renewing = false;
  const renew = async () => {
    if (Number(await redis.eval(leaseScript, 1, key, mode + "|", ttlMs, member)) !== 1) throw new Error("WORKER_MODE_ALREADY_ACTIVE");
  };
  try { await renew(); } catch (error) { redis.disconnect(); throw error; }
  const timer = setInterval(() => {
    if (stopped || renewing) return;
    renewing = true;
    void renew().catch(() => { if (!stopped) { stopped = true; clearInterval(timer); onLost(); } }).finally(() => { renewing = false; });
  }, Math.max(100, Math.floor(ttlMs / 3)));
  timer.unref();
  return { member, close: async () => { stopped = true; clearInterval(timer); try { await redis.zrem(key, member); } finally { redis.disconnect(); } } };
}
