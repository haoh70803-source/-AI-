import { NextResponse } from "next/server";
import { z } from "zod";
import { SUPPORTED_PLATFORMS } from "@/lib/platforms";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { reviewApiError } from "@/server/reviews/review-api";
import { getPlatformReview } from "@/server/reviews/review-service";

export async function GET(_request: Request, route: { params: Promise<{ id: string; platform: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const params = await route.params;
  const platform = z.enum(SUPPORTED_PLATFORMS).safeParse(params.platform);
  if (!platform.success) return apiError("INVALID_PLATFORM", 400);
  try { return NextResponse.json(await getPlatformReview({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: params.id, platform: platform.data })); }
  catch (error) { return reviewApiError(error); }
}
