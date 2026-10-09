import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Prisma } from "@content-center/db";
const rate = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("../server/auth-rate-limit", () => ({ authRateLimitStorage: { consume: rate } }));
import { assistantLimit, assertAssistantCapacity, consumeAssistantRequest } from "../server/assistant/capacity";
const lock = vi.fn(), count = vi.fn();
const tx = { $executeRaw: lock, assistantMessage: { count } } as unknown as Prisma.TransactionClient;
beforeEach(() => { lock.mockResolvedValue(undefined); count.mockResolvedValue(0); rate.mockResolvedValue({ allowed: true, retryAfter: null }); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it("takes a distributed DB admission lock, counts live slots at all scopes and allows capacity", async () => {
  await assertAssistantCapacity(tx, { workspaceId: "w", userId: "u" });
  expect(lock).toHaveBeenCalledOnce(); expect(count).toHaveBeenCalledTimes(3);
  expect(count.mock.calls[1]![0].where.thread).toEqual({ workspaceId: "w" });
  expect(count.mock.calls[2]![0].where.thread).toEqual({ workspaceId: "w", createdById: "u" });
});
it.each([{ counts: [32], scope: "global" }, { counts: [0, 8], scope: "workspace" }, { counts: [0, 0, 2], scope: "user" }])("rejects full $scope capacity without admitting a new run", async ({ counts }) => {
  counts.forEach(n => count.mockResolvedValueOnce(n));
  await expect(assertAssistantCapacity(tx, { workspaceId: "w", userId: "u" })).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true });
});
it("excludes expired crash records but includes heartbeating long runs", async () => {
  const now = new Date("2026-10-09T00:00:00Z"); await assertAssistantCapacity(tx, { workspaceId: "w", userId: "u" }, now);
  expect(count.mock.calls[0]![0].where.updatedAt.gte.toISOString()).toBe("2026-10-08T23:50:00.000Z");
});
it("consumes an isolated per-user quota and reports retry time", async () => {
  rate.mockResolvedValue({ allowed: false, retryAfter: 12 });
  await expect(consumeAssistantRequest("w", "u")).rejects.toMatchObject({ code: "RATE_LIMITED", message: expect.stringContaining("12") });
  expect(rate).toHaveBeenCalledWith("assistant:w:u", { window: 60, max: 20 });
});
it("validates configurable limits instead of silently disabling protection", () => {
  for (const value of ["0", "-1", "NaN", "2.5", "10001"]) { vi.stubEnv("ASSISTANT_GLOBAL_CONCURRENCY", value); expect(assistantLimit("ASSISTANT_GLOBAL_CONCURRENCY", 32)).toBe(32); }
  vi.stubEnv("ASSISTANT_GLOBAL_CONCURRENCY", "16"); expect(assistantLimit("ASSISTANT_GLOBAL_CONCURRENCY", 32)).toBe(16);
});
