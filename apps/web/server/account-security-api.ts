import { db } from "@content-center/db";
import { auth } from "../lib/auth";
import { apiError } from "./api-access";
import { authRateLimitStorage } from "./auth-rate-limit";
export async function accountSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !await db.user.findFirst({ where: { id: session.user.id, disabledAt: null }, select: { id: true } })) return null;
  return session;
}
export async function accountRequestLimit(request: Request, action: string) {
  const body = await request.clone().json().catch(() => null) as { email?: unknown } | null;
  const account = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0,320) : "no-email";
  // This loopback-only runtime does not trust client-supplied forwarded IP headers.
  for (const [key,max] of [["account-endpoint:" + action, 30], ["account-endpoint:" + action + ":" + account, 5]] as const) {
    const result = await authRateLimitStorage.consume(key, { window: 60, max });
    if (!result.allowed) return apiError("RATE_LIMITED", 429, "请求过于频繁，请一分钟后重试。");
  }
  return null;
}
