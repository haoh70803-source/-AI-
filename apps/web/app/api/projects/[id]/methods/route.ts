import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { getProjectMethodState, methodSelectionSchema, ProjectMethodError, setProjectMethodSelections } from "@/server/project-methods/service";

function projectMethodApiError(error: unknown) {
  if (!(error instanceof ProjectMethodError)) return null;
  const status = error.code === "PROJECT_NOT_FOUND" || error.code === "METHOD_SELECTION_FORBIDDEN" ? 404 : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try {
    return NextResponse.json(await getProjectMethodState({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id }));
  } catch (error) {
    return projectMethodApiError(error) ?? apiError("PROJECT_METHODS_READ_FAILED", 500, "无法读取本次使用的方法。");
  }
}

export async function PUT(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = methodSelectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_METHOD_SELECTION", 400, "当前版本最多加载 3 个 Skill（兼容限制），请减少后重试。");
  const { id } = await route.params;
  try {
    return NextResponse.json(await setProjectMethodSelections({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, methodVersionIds: parsed.data.methodVersionIds }));
  } catch (error) {
    return projectMethodApiError(error) ?? apiError("PROJECT_METHODS_UPDATE_FAILED", 500, "无法保存本次使用的方法。");
  }
}
