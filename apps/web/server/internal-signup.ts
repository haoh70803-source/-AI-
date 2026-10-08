import { createHash, timingSafeEqual } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../lib/auth";

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(128),
  inviteCode: z.string().min(1).max(200),
});

export function isDirectSignupRequest(request: Request) {
  return /\/sign-up\/email\/?$/.test(new URL(request.url).pathname);
}

export function inviteCodeMatches(input: string, expected: string | undefined) {
  if (!expected) return false;
  const supplied = createHash("sha256").update(input, "utf8").digest();
  const configured = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(supplied, configured);
}

export async function registerInternalUser(request: Request) {
  if (process.env.INTERNAL_SIGNUP_ENABLED !== "true") {
    return NextResponse.json({ code: "INTERNAL_SIGNUP_DISABLED", message: "内部注册暂未开放。" }, { status: 403 });
  }
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_SIGNUP", message: "请完整填写姓名、邮箱、密码和公司邀请码。" }, { status: 400 });
  }
  const { inviteCode, ...credentials } = parsed.data;
  if (!inviteCodeMatches(inviteCode, process.env.INTERNAL_SIGNUP_INVITE_CODE)) {
    return NextResponse.json({ code: "INVALID_INVITE_CODE", message: "公司邀请码不正确。" }, { status: 403 });
  }

  const response = await auth.api.signUpEmail({ body: credentials, headers: request.headers, asResponse: true });
  if (!response.ok) return response;
  const result = await response.clone().json() as { user?: { id?: string } };
  if (!result.user?.id) {
    return NextResponse.json({ code: "SIGNUP_FAILED", message: "账号创建失败，请重试。" }, { status: 500 });
  }
  await db.user.update({ where: { id: result.user.id }, data: { systemRole: "USER" } });
  await ensurePersonalWorkspaceForUser(db, { userId: result.user.id });
  return response;
}
