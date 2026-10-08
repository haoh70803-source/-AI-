import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { materialAnalysisApiError } from "@/server/material-analysis/api";
import { getMaterialAnalysis, requestMaterialAnalysis } from "@/server/material-analysis/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await params;
  try {
    return NextResponse.json(await getMaterialAnalysis({ workspaceId: context.workspace.id, sourceItemId: id }));
  } catch (error) {
    return materialAnalysisApiError(error) ?? apiError("MATERIAL_ANALYSIS_READ_FAILED", 500, "无法读取智能整理结果。");
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await params;
  try {
    return NextResponse.json(await requestMaterialAnalysis({ workspaceId: context.workspace.id, sourceItemId: id, userId: context.session.user.id }), { status: 202 });
  } catch (error) {
    return materialAnalysisApiError(error) ?? apiError("MATERIAL_ANALYSIS_FAILED", 500, "智能整理失败，请重试。");
  }
}
