import type { ConnectionOptions } from "bullmq";

export function createRedisConnection(
  redisUrlValue = process.env.REDIS_URL,
): ConnectionOptions {
  if (!redisUrlValue) throw new Error("REDIS_URL_REQUIRED");
  const redisUrl = new URL(redisUrlValue);
  if (!["redis:","rediss:"].includes(redisUrl.protocol)) throw new Error("INVALID_REDIS_PROTOCOL");

  return {
    host: redisUrl.hostname,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: Number(redisUrl.pathname.slice(1) || 0),
    ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function queuePrefix() {
  const prefix = process.env.QUEUE_PREFIX ?? "bull";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(prefix)) throw new Error("INVALID_QUEUE_PREFIX");
  return prefix;
}
