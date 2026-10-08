import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { SUPPORTED_PLATFORMS } from "@/lib/platforms";
import { platformApiError } from "@/server/platforms/platform-api";
import { applyPlatformPreview } from "@/server/platforms/platform-variant-service";

const schema = z.object({ runId: z.string().min(1), expectedVersion: z.number().int().min(0) }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string; platform: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const params = await route.params;
  const [platform, body] = [z.enum(SUPPORTED_PLATFORMS).safeParse(params.platform), schema.safeParse(await request.json().catch(() => null))];
  if (!platform.success || !body.success) return apiError("INVALID_INPUT", 400);
  try { return NextResponse.json(await applyPlatformPreview({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: params.id, platform: platform.data, ...body.data })); }
  catch (error) { return platformApiError(error); }
}
