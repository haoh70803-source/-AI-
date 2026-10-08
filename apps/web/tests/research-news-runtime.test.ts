import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises"; import path from "node:path"; import os from "node:os";
vi.mock("server-only", () => ({}));
import { newsRuntime, startNewsScheduler } from "../server/research/news/runtime";
import { NewsSync } from "../server/research/news/sync"; import { NewsStore, emptyNewsState } from "../server/research/news/store";
let root = ""; const globalNews = globalThis as typeof globalThis & { __xinPublicNews?: ReturnType<typeof newsRuntime> };
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "xin-news-clock-")); vi.stubEnv("AIHOT_NEWS_CACHE_ROOT", root); delete globalNews.__xinPublicNews; });
afterEach(async () => { if (globalNews.__xinPublicNews?.timer) clearInterval(globalNews.__xinPublicNews.timer); delete globalNews.__xinPublicNews; vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
it("starts no scheduler without the narrow permission, then creates only one process timer", async () => {
 vi.useFakeTimers(); vi.stubEnv("AIHOT_PUBLIC_NEWS_ENABLED", "false"); const runtime = newsRuntime();
 const run = vi.spyOn(runtime.sync, "run").mockResolvedValue(emptyNewsState());
 startNewsScheduler(); expect(run).not.toHaveBeenCalled(); expect(runtime.timer).toBeUndefined();
 vi.stubEnv("AIHOT_PUBLIC_NEWS_ENABLED", "true"); startNewsScheduler(); startNewsScheduler();
 expect(run).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(60000); expect(run).toHaveBeenCalledTimes(2);
 expect(runtime.timer?.hasRef()).toBe(false);
});
it("uses durable hourly due time across restart; six missed hours catch up once", async () => {
 let now = Date.parse("2026-10-06T10:00:00Z"), requests = 0; const store = new NewsStore(root);
 const transport = async (operation: string) => {
  requests++; return { status: 200, etag: null, retryAfter: null, body: operation === "snapshot" ? { schemaVersion: 1, asOf: new Date(now).toISOString(), cursor: "c1", count: 0, hasMore: false, nextPage: null, items: [] } : operation === "changes" ? { schemaVersion: 1, cursor: "c1", count: 0, hasMore: false, changes: [] } : { schemaVersion: 1, count: 0, items: [] } };
 };
 await new NewsSync(store, transport, () => now).run(); expect(requests).toBe(2);
 now += 59 * 60000; await new NewsSync(store, transport, () => now).run(); expect(requests).toBe(2);
 now += 6 * 3600000; const restarted = new NewsSync(store, transport, () => now);
 await restarted.run(); await restarted.run(); expect(requests).toBe(4); expect((await store.read()).nextAttempt).toBe(now + 3600000);
});

it("rejects relative cache roots and ambiguous deployment working directories", () => {
 vi.stubEnv("AIHOT_NEWS_CACHE_ROOT", "relative/cache");
 expect(() => newsRuntime()).toThrow("NEWS_CACHE_ROOT_MUST_BE_ABSOLUTE");
 vi.stubEnv("AIHOT_NEWS_CACHE_ROOT", ""); vi.stubEnv("LOCAL_RELEASE_PROFILE", "");
 expect(() => newsRuntime()).toThrow("NEWS_CACHE_CONFIGURATION_REQUIRED");
});
it("uses explicit portable roots or a validated local profile without machine drive constants", () => {
 vi.stubEnv("LOCAL_RELEASE_PROFILE", ""); expect(newsRuntime().store.root).toBe(root);
 delete globalNews.__xinPublicNews; vi.stubEnv("AIHOT_NEWS_CACHE_ROOT", ""); vi.stubEnv("LOCAL_RELEASE_PROFILE", "daily");
 expect(newsRuntime().store.root).toBe(path.resolve(process.cwd(), "../../output/research-news-private/daily"));
 delete globalNews.__xinPublicNews; vi.stubEnv("LOCAL_RELEASE_PROFILE", "review");
 expect(newsRuntime().store.root).toBe(path.resolve(process.cwd(), "../../output/research-news-private/review"));
});
