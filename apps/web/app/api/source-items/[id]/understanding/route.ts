import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { SourceUnderstandingError, understandSource } from "@/server/material-detail/understanding";

export const maxDuration = 900;

export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    return NextResponse.json(await understandSource({ workspaceId: context.workspace.id, userId: context.session.user.id, sourceItemId: (await route.params).id }));
  } catch (error) {
    if (error instanceof SourceUnderstandingError) return apiError(error.code, error.status, error.message);
    return apiError("VISION_FAILED", 500, "理解服务暂时不可用，请稍后重试。原件仍然保留。");
  }
}
