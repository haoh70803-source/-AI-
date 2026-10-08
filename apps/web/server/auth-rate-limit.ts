import { createHash } from "node:crypto";
import { db } from "@content-center/db";

/** Reuse Verification with isolated, hashed keys; no RateLimit migration or Redis. */
export const authRateLimitStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    const id = "auth-rate:" + createHash("sha256").update(key).digest("hex");
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
      const now = Date.now();
      const previous = await tx.verification.findUnique({ where: { id } });
      const state = previous && previous.expiresAt.getTime() > now ? JSON.parse(previous.value) as { count: number; startedAt: number } : { count: 0, startedAt: now };
      if (state.count >= rule.max) return { allowed: false, retryAfter: Math.max(1, Math.ceil((state.startedAt + rule.window * 1000 - now) / 1000)) };
      state.count += 1;
      await tx.verification.upsert({ where: { id }, create: { id, identifier: id, value: JSON.stringify(state), expiresAt: new Date(state.startedAt + rule.window * 1000) }, update: { value: JSON.stringify(state), expiresAt: new Date(state.startedAt + rule.window * 1000) } });
      return { allowed: true, retryAfter: null };
    });
  },
};
