import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deleteMethod, getMethod, MethodError, methodStatusSchema, updateMethodContent, updateMethodSchema, updateMethodStatus } from "@/server/methods/service";

function methodApiError(error: unknown) {
  if (!(error instanceof MethodError)) return null;
  const status = error.code === "METHOD_NOT_FOUND" ? 404 : error.code === "METHOD_VERSION_CONFLICT" ? 409 : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  const method = await getMethod({ workspaceId: context.workspace.id, ownerUserId: context.session.user.id, methodId: id });
  if (!method) return apiError("NOT_FOUND", 404);
  return NextResponse.json(method);
}

export async function PUT(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = updateMethodSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_METHOD_INPUT", 400, "请检查方法名称、步骤和适用边界。");
  const { id } = await route.params;
  try {
    return NextResponse.json(await updateMethodContent({ ...parsed.data, workspaceId: context.workspace.id, ownerUserId: context.session.user.id, methodId: id }));
  } catch (error) {
    return methodApiError(error) ?? apiError("METHOD_UPDATE_FAILED", 500, "无法保存方法。");
  }
}

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = z.object({ status: methodStatusSchema }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_METHOD_STATUS", 400, "请选择有效的方法状态。");
  const { id } = await route.params;
  try {
    return NextResponse.json(await updateMethodStatus({ workspaceId: context.workspace.id, ownerUserId: context.session.user.id, methodId: id, status: parsed.data.status }));
  } catch (error) {
    return methodApiError(error) ?? apiError("METHOD_STATUS_UPDATE_FAILED", 500, "无法更新方法状态。");
  }
}

export async function DELETE(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  try {
    await deleteMethod({ workspaceId: context.workspace.id, ownerUserId: context.session.user.id, methodId: id });
    return NextResponse.json({ deleted: true });
  } catch (error) { return methodApiError(error) ?? apiError("METHOD_DELETE_FAILED", 500, "暂时无法删除 Skill，请重试。"); }
}
