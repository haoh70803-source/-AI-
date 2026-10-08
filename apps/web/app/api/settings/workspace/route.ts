import { isExperienceAccount } from "@/server/experience-account";
import { db } from "@content-center/db";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { rejectCrossOrigin } from "@/server/account-api";

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return apiError("UNAUTHORIZED", 401);
  const input = z.object({ workspaceId: z.string().min(1) }).strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("INVALID_INPUT", 400);
  const member = await db.workspaceMember.findFirst({ where: { userId: session.user.id, workspaceId: input.data.workspaceId, disabledAt: null, user: { disabledAt: null }, workspace: { disabledAt: null } } });
  if (!member) return apiError("FORBIDDEN", 403, "该公司空间不可用，或你的成员资格已停用。");
  await db.session.updateMany({ where: { id: session.session.id, userId: session.user.id }, data: { activeWorkspaceId: member.workspaceId } });
  return Response.json({ ok: true });
}
export async function PATCH(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (isExperienceAccount(context.session.user)) return apiError("EXPERIENCE_READ_ONLY", 403, "体验账号只能查看设置。");
  if (!["OWNER", "ADMIN"].includes(context.role)) return apiError("FORBIDDEN", 403, "你没有权限修改这个设置。");
  const input = z.object({ name: z.string().trim().min(2).max(80) }).strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("INVALID_INPUT", 400, "公司名称需要 2–80 个字符。");
  await db.workspace.update({ where: { id: context.workspace.id }, data: input.data });
  return Response.json({ ok: true });
}
