import { db } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createInternalPlatformUser } from "@/server/account-space";
import { accountApiError } from "@/server/account-api";
import { apiError, getSystemAdminApiContext } from "@/server/api-access";

import { rejectCrossOrigin } from "@/server/account-api";

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(128),
});

export async function GET() {
  const context = await getSystemAdminApiContext();
  if ("response" in context) return context.response;
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, systemRole: true, disabledAt: true, createdAt: true, workspaceMemberships: { select: { role: true, workspace: { select: { id: true, name: true } } } }, sessions: { take: 1, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ users: users.map((user) => ({ ...user, status: user.disabledAt ? "DISABLED" as const : "ACTIVE" as const })) });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getSystemAdminApiContext();
  if ("response" in context) return context.response;
  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_USER", 400, "姓名、邮箱或初始密码格式不正确。");
  try { return NextResponse.json({ user: await createInternalPlatformUser(context.user.id, parsed.data) }, { status: 201 }); }
  catch (error) { return accountApiError(error); }
}
