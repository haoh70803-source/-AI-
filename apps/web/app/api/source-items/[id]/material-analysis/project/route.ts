import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { materialAnalysisApiError } from "@/server/material-analysis/api";
import { createProjectFromMaterial } from "@/server/material-analysis/service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await params;
  try {
    return NextResponse.json(await createProjectFromMaterial({ workspaceId: context.workspace.id, sourceItemId: id, userId: context.session.user.id }), { status: 201 });
  } catch (error) {
    return materialAnalysisApiError(error) ?? apiError("PROJECT_CREATE_FAILED", 500, "无法创建内容项目。");
  }
}
