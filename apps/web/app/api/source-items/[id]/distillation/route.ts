import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { MaterialDistillationError, getMaterialDistillation, materialDistillationRequestSchema, requestMaterialDistillation } from "@/server/material-distillation/service";

function distillationApiError(error: unknown) {
  if (!(error instanceof MaterialDistillationError)) return null;
  const status = error.code === "SOURCE_NOT_FOUND" || error.code === "DISTILLATION_NOT_FOUND" ? 404 : error.code === "DISTILLATION_FORBIDDEN" ? 403 : error.code === "DISTILLATION_ALREADY_PROCESSING" ? 409 : error.code === "VIDEO_REQUIRED" || error.code === "TRANSCRIPT_REQUIRED" || error.code === "INVALID_INPUT" ? 400 : 503;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  try {
    const { id } = await route.params;
    return NextResponse.json(await getMaterialDistillation({ workspaceId: context.workspace.id, sourceItemId: id }));
  } catch (error) {
    return distillationApiError(error) ?? apiError("MATERIAL_DISTILLATION_READ_FAILED", 500, "无法读取精华提炼结果。");
  }
}

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = materialDistillationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_DISTILLATION_INPUT", 400, "请选择一种提炼方式。");
  try {
    const { id } = await route.params;
    return NextResponse.json(await requestMaterialDistillation({ workspaceId: context.workspace.id, sourceItemId: id, userId: context.session.user.id, mode: parsed.data.mode }), { status: 202 });
  } catch (error) {
    return distillationApiError(error) ?? apiError("MATERIAL_DISTILLATION_FAILED", 500, "精华提炼暂时无法开始。");
  }
}
