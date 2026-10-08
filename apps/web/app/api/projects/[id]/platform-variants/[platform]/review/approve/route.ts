import { NextResponse } from "next/server";
import { z } from "zod";
import { SUPPORTED_PLATFORMS } from "@/lib/platforms";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { reviewApiError } from "@/server/reviews/review-api";
import { approvePlatformVariant } from "@/server/reviews/review-service";

const bodySchema = z.object({ comment: z.string().max(5_000).optional(), confirmWarnings: z.boolean().optional() }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string; platform: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const params = await route.params;
  const [platform, body] = [z.enum(SUPPORTED_PLATFORMS).safeParse(params.platform), bodySchema.safeParse(await request.json().catch(() => ({})))];
  if (!platform.success || !body.success) return apiError("INVALID_INPUT", 400);
  try { return NextResponse.json(await approvePlatformVariant({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: params.id, platform: platform.data, ...body.data }), { status: 201 }); }
  catch (error) { return reviewApiError(error); }
}
