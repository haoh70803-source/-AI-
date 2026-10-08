import { headers } from "next/headers";
import { db } from "@content-center/db";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiError } from "@/server/api-access";
import { rejectCrossOrigin } from "@/server/account-api";
import { listAccountSessions, revokeAccountSessions } from "@/server/account-sessions";
async function actor() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !await db.user.findFirst({ where: { id: session.user.id, disabledAt: null }, select: { id: true } })) return null;
  return session;
}
export async function GET() {
  const session = await actor(); if (!session) return apiError("UNAUTHORIZED", 401, "请重新登录。");
  return Response.json({ sessions: await listAccountSessions(session.user.id, session.session.id) }, { headers: { "cache-control": "no-store" } });
}
export async function DELETE(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const session = await actor(); if (!session) return apiError("UNAUTHORIZED", 401, "请重新登录。");
  const data = z.union([z.object({ allOthers: z.literal(true) }).strict(), z.object({ id: z.string().min(1).max(200) }).strict()]).safeParse(await request.json().catch(() => null));
  if (!data.success) return apiError("INVALID_INPUT", 400, "请选择需要退出的设备。");
  const result = await revokeAccountSessions(session.user.id, session.session.id, "id" in data.data ? data.data.id : undefined);
  return Response.json({ count: result.count, message: result.count ? "所选登录已退出，相关设备需要重新登录。" : "该登录已失效或不属于当前账号。" });
}
