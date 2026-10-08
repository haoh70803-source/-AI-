import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { CreationFeedbackError, getCreationFeedbackContext, upsertCreationFeedback } from "@/server/creation-feedback/service";

function feedbackApiError(error: unknown) {
  if (!(error instanceof CreationFeedbackError)) return null;
  const status = error.code === "FEEDBACK_PROJECT_NOT_FOUND" ? 404 : error.code === "FEEDBACK_FORBIDDEN" ? 403 : error.code === "FEEDBACK_UNAVAILABLE" || error.code === "FEEDBACK_METHOD_INVALID" ? 409 : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  try {
    const { id } = await route.params;
    return NextResponse.json(await getCreationFeedbackContext({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id }));
  } catch (error) {
    return feedbackApiError(error) ?? apiError("CREATION_FEEDBACK_READ_FAILED", 500, "暂时无法读取反馈。");
  }
}

export async function PUT(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "当前权限不能保存反馈。");
  try {
    const { id } = await route.params;
    return NextResponse.json(await upsertCreationFeedback({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, data: await request.json().catch(() => null) }));
  } catch (error) {
    return feedbackApiError(error) ?? apiError("CREATION_FEEDBACK_SAVE_FAILED", 500, "暂时无法保存反馈。");
  }
}
