import { prismaAdapter } from "@better-auth/prisma-adapter";
import { db } from "@content-center/db";
import { betterAuth } from "better-auth";
import { securityAudit } from "../server/account-security";
import { authRateLimitStorage } from "../server/auth-rate-limit";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "./password-policy";

function trustedAuthOrigins(configuredUrl: string | undefined) {
  if (!configuredUrl) return [];
  try {
    const configured = new URL(configuredUrl);
    const origins = new Set([configured.origin]);
    if (configured.hostname === "localhost" || configured.hostname === "127.0.0.1") {
      const alternate = new URL(configured);
      alternate.hostname = configured.hostname === "localhost" ? "127.0.0.1" : "localhost";
      origins.add(alternate.origin);
    }
    return [...origins];
  } catch {
    return [configuredUrl];
  }
}

export const auth = betterAuth({
  advanced: { cookiePrefix: process.env.AUTH_COOKIE_PREFIX || "better-auth", ipAddress: { ipAddressHeaders: [] } },
  appName: "AI 内容生产中心",
  baseURL: process.env.APP_URL,
  secret: process.env.AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN_LENGTH, maxPasswordLength: PASSWORD_MAX_LENGTH, revokeSessionsOnPasswordReset: true },
  // Explicit in development too; persistent storage works with the daily Redis disabled.
  rateLimit: { enabled: true, customStorage: authRateLimitStorage, window: 60, max: 100, customRules: {
    "/sign-in/email": { window: 60, max: 10 },
    "/request-password-reset": { window: 60, max: 3 },
    "/reset-password": { window: 60, max: 5 },
    "/change-password": { window: 60, max: 5 },
    "/send-verification-email": { window: 60, max: 3 },
  } },
  databaseHooks: {
    account: { update: { after: async (account, context) => {
      if (context?.path === "/change-password") await db.$transaction(tx => securityAudit(tx, account.userId, "account.password_changed"));
    } } },
    session: {
      create: {
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { disabledAt: true } });
          if (!user || user.disabledAt) return false;
        },
      },
    },
  },
  trustedOrigins: trustedAuthOrigins(process.env.APP_URL),
});
