import { afterEach, expect, it, vi } from "vitest";
import { reviewDatabaseTarget } from "./review-target";
const constructed = vi.hoisted(() => vi.fn());
vi.mock("@prisma/client", async importOriginal => ({ ...await importOriginal<typeof import("@prisma/client")>(), PrismaClient: class { constructor() { constructed(); } } }));
const valid = { ENVIRONMENT_ID: "LOCAL_REVIEW", LOCAL_REVIEW_OFFLINE: "true", FREE_WORKER_MODE: "false", DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:55438/content_center_12_review" };
const cache = globalThis as typeof globalThis & { contentCenterDb?: unknown; contentCenterDbTarget?: string };
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); constructed.mockClear(); delete cache.contentCenterDb; delete cache.contentCenterDbTarget; });
it.each(["postgresql://fixture:fixture@127.0.0.1:55432/content_center", "postgresql://fixture:fixture@127.0.0.1:55435/content_center_agent_test_integration", "postgresql://fixture:fixture@remote.example.invalid:55438/content_center_12_review", "invalid"])("rejects a non-review target without exposing its value", target => {
  expect(() => reviewDatabaseTarget({ ...valid, DATABASE_URL: target })).toThrow("REVIEW_DATABASE_MISMATCH");
});
it("accepts only consistent review flags and leaves ordinary environments unchanged", () => {
  expect(reviewDatabaseTarget(valid)).toBe(valid.DATABASE_URL);
  expect(reviewDatabaseTarget({ ENVIRONMENT_ID: "LOCAL_REAL" })).toBeUndefined();
  expect(() => reviewDatabaseTarget({ ...valid, LOCAL_REVIEW_OFFLINE: "false" })).toThrow("REVIEW_SAFETY_FLAGS_REQUIRED");
  expect(() => reviewDatabaseTarget({ ...valid, ENVIRONMENT_ID: "LOCAL_REAL" })).toThrow("REVIEW_SAFETY_FLAGS_REQUIRED");
  expect(() => reviewDatabaseTarget({ ...valid, FREE_WORKER_MODE: "true" })).toThrow("REVIEW_SAFETY_FLAGS_REQUIRED");
});
it("rejects direct package initialization before constructing Prisma", async () => {
  for (const [key,value] of Object.entries({ ...valid, DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:55432/content_center" })) vi.stubEnv(key,value);
  await expect(import("./index")).rejects.toThrow("REVIEW_DATABASE_MISMATCH"); expect(constructed).not.toHaveBeenCalled();
});
it("rejects an inherited unknown database singleton", async () => {
  for (const [key,value] of Object.entries(valid)) vi.stubEnv(key,value);
  cache.contentCenterDb = {};
  await expect(import("./index")).rejects.toThrow("REVIEW_CACHED_DATABASE_MISMATCH"); expect(constructed).not.toHaveBeenCalled();
});
it("constructs the validated review client only once", async () => {
  for (const [key,value] of Object.entries(valid)) vi.stubEnv(key,value);
  vi.stubEnv("NODE_ENV", "test"); await import("./index"); vi.resetModules(); await import("./index"); expect(constructed).toHaveBeenCalledOnce();
});
