import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { RedisConnection } from "bullmq";
import { createRedisConnection } from "@content-center/worker/redis-connection";
import { assistantCache, assistantCacheKey } from "../server/assistant/cache";
let inspector: RedisConnection;
const prefix = randomUUID();
beforeAll(() => {
  const url = process.env.ASSISTANT_REDIS_URL;
  if (url !== "redis://127.0.0.1:16380/15") throw Error("ISOLATED_ASSISTANT_REDIS_REQUIRED");
  vi.stubEnv("LOCAL_REVIEW_OFFLINE", "false");
  inspector = new RedisConnection(createRedisConnection(url), { blocking: false }); inspector.on("error", () => {});
});
afterAll(async () => { await inspector.close(true); vi.unstubAllEnvs(); });
it("shares ID retrieval across clients, honors TTL, and isolates user scopes", async () => {
  const key = assistantCacheKey("test", { prefix, workspaceId: "w", userId: "u", projectId: "p" });
  const foreign = assistantCacheKey("test", { prefix, workspaceId: "w", userId: "other", projectId: "p" });
  await assistantCache.set(key, '["record"]', 30);
  const client = await inspector.client;
  // BullMQ's minimal client interface omits TTL; the underlying Redis client supports it.
  const ttlClient = client as typeof client & { ttl(key: string): Promise<number> };
  try {
    expect(await client.get(key)).toBe('["record"]'); expect(await assistantCache.get(key)).toBe('["record"]');
    expect(await assistantCache.get(foreign)).toBeNull();
    expect(await ttlClient.ttl(key)).toBeGreaterThan(0); expect(await ttlClient.ttl(key)).toBeLessThanOrEqual(30);
  } finally { await client.del(key); }
});
