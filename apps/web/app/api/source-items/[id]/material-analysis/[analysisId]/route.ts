import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { materialAnalysisApiError } from "@/server/material-analysis/api";
import { updateMaterialAnalysis } from "@/server/material-analysis/service";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; analysisId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id, analysisId } = await params;
  try {
    return NextResponse.json(await updateMaterialAnalysis({ workspaceId: context.workspace.id, sourceItemId: id, analysisId, userId: context.session.user.id, data: await request.json().catch(() => null) }));
  } catch (error) {
    return materialAnalysisApiError(error) ?? apiError("MATERIAL_ANALYSIS_UPDATE_FAILED", 500, "无法保存整理结果。");
  }
}
