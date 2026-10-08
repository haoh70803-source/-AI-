import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { SUPPORTED_PLATFORMS } from "@/lib/platforms";
import { platformApiError } from "@/server/platforms/platform-api";
import { generatePlatformPreviews } from "@/server/platforms/platform-variant-service";

const parameters = z.object({ duration: z.union([z.literal(30), z.literal(60), z.literal(90)]).optional(), style: z.enum(["VIEWPOINT", "EXPERIENCE", "LIST"]).optional(), variantType: z.enum(["SHORT", "VIEWPOINT", "STORY"]).optional() }).strict();
const schema = z.object({ platforms: z.array(z.enum(SUPPORTED_PLATFORMS)).min(1).max(5).refine((items) => new Set(items).size === items.length), parameters: z.object({ DOUYIN: parameters.optional(), XIAOHONGSHU: parameters.optional(), WECHAT_MOMENTS: parameters.optional(), WECHAT_CHANNELS: parameters.optional(), WECHAT_OFFICIAL: parameters.optional() }).strict().optional() }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json(await generatePlatformPreviews({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data }), { status: 201 }); }
  catch (error) { return platformApiError(error); }
}
