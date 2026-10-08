import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { recommendationApiError } from "@/server/discovery/recommendations/api";
import { generateRecommendationBatch, getCurrentRecommendationBatch, publicRecommendationBatch } from "@/server/discovery/recommendations/service";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const batch = await getCurrentRecommendationBatch({ workspaceId: context.workspace.id, userId: context.session.user.id });
  return NextResponse.json({ batch: batch ? publicRecommendationBatch(batch) : null });
}

export async function POST() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法生成今日内容线索。");
  try {
    const batch = await generateRecommendationBatch({ workspaceId: context.workspace.id, userId: context.session.user.id, force: true });
    return NextResponse.json({ batch: publicRecommendationBatch(batch) });
  } catch (error) { return recommendationApiError(error); }
}
