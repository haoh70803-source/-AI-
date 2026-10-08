import { canManageWorkspace } from "@content-center/core";
import { db } from "@content-center/db";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { accountApiError, rejectCrossOrigin } from "@/server/account-api";
import { createMember } from "@/server/account-space";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401, "请重新登录或选择可用的公司空间。");
  if (!canManageWorkspace(context.role)) return apiError("FORBIDDEN", 403, "你没有权限查看成员信息。");
  return Response.json({ members: await db.workspaceMember.findMany({ where: { workspaceId: context.workspace.id }, select: { id: true, role: true, disabledAt: true, createdAt: true, user: { select: { id: true, name: true, email: true, disabledAt: true } } }, orderBy: { createdAt: "asc" } }) });
}
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401, "请重新登录或选择可用的公司空间。");
  if (!canManageWorkspace(context.role)) return apiError("FORBIDDEN", 403, "你没有权限添加成员。");
  try { return Response.json(await createMember(context.workspace.id, context.session.user.id, await request.json()), { status: 201 }); }
  catch (error) { return accountApiError(error); }
}
