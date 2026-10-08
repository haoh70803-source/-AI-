import { randomUUID, createHash } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { authRateLimitStorage } from "../server/auth-rate-limit";
import { rejectCrossOrigin } from "../server/account-api";
import { memberInput } from "../server/account-space";
const keys: string[] = [];
afterAll(async () => {
  await db.verification.deleteMany({ where: { id: { in: keys.map(key => "auth-rate:" + createHash("sha256").update(key).digest("hex")) } } });
});
it.each([7,8,128,129])("validates member password length %i with no character mixing rule", length => {
  expect(memberInput.safeParse({ name: "Fixture", email: "fixture@example.test", password: "a".repeat(length), role: "EDITOR" }).success).toBe(length >= 8 && length <= 128);
});
it("accepts same-origin JSON and rejects cross-origin, opaque origins and simple forged JSON", () => {
  const make = (headers: { origin?: string; "content-type": string; "sec-fetch-site"?: string }) => new Request("http://localhost:3000/api/admin/users", { method: "POST", headers: Object.fromEntries(Object.entries(headers).filter(([,value])=>value!==undefined)) as Record<string,string>, body: "{}" });
  expect(rejectCrossOrigin(make({ origin: "http://localhost:3000", "content-type": "application/json; charset=utf-8" }))).toBeNull();
  for (const headers of [{ origin: "https://other.invalid", "content-type": "application/json" }, { origin: "null", "content-type": "application/json" }, { "sec-fetch-site": "cross-site", "content-type": "application/json" }, { "content-type": "text/plain" }])
    expect([403,415]).toContain(rejectCrossOrigin(make(headers))?.status);
});
it("atomically caps concurrent requests, persists across calls and expires without extending lockout", async () => {
  const key = "account-rate-fixture-" + randomUUID(); keys.push(key);
  const outcomes = await Promise.all(Array.from({ length: 12 }, () => authRateLimitStorage.consume(key, { window: 60, max: 3 })));
  expect(outcomes.filter(x => x.allowed)).toHaveLength(3);
  expect(outcomes.filter(x => !x.allowed)).toHaveLength(9);
  const id = "auth-rate:" + createHash("sha256").update(key).digest("hex");
  const row = await db.verification.findUniqueOrThrow({ where: { id } });
  const denied = await authRateLimitStorage.consume(key, { window: 60, max: 3 });
  expect(denied.allowed).toBe(false); expect(denied.retryAfter).toBeGreaterThan(0);
  expect((await db.verification.findUniqueOrThrow({ where: { id } })).expiresAt).toEqual(row.expiresAt);
  await db.verification.update({ where: { id }, data: { expiresAt: new Date(0) } });
  expect((await authRateLimitStorage.consume(key, { window: 60, max: 3 })).allowed).toBe(true);
}, 30000);
