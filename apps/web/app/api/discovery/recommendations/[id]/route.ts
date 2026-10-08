import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { recommendationApiError } from "@/server/discovery/recommendations/api";
import { recommendationActionSchema } from "@/server/discovery/recommendations/schemas";
import { actOnRecommendation, getRecommendationItem } from "@/server/discovery/recommendations/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await params;
  const item = await getRecommendationItem({ workspaceId: context.workspace.id, userId: context.session.user.id, itemId: id });
  if (!item) return apiError("RECOMMENDATION_NOT_FOUND", 404, "推荐内容不存在。");
  return NextResponse.json({ item });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法修改今日内容线索。");
  try {
    const { id } = await params;
    const input = recommendationActionSchema.parse(await request.json().catch(() => null));
    return NextResponse.json(await actOnRecommendation({ workspaceId: context.workspace.id, userId: context.session.user.id, itemId: id, ...input }));
  } catch (error) { return recommendationApiError(error); }
}
