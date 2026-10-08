import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { SUPPORTED_PLATFORMS } from "@/lib/platforms";
import { platformApiError } from "@/server/platforms/platform-api";
import { getPlatformVariant, updatePlatformVariant } from "@/server/platforms/platform-variant-service";

const platformSchema = z.enum(SUPPORTED_PLATFORMS);
const jsonObject = z.record(z.string(), z.unknown());
const updateSchema = z.object({ title: z.string().max(2_000).nullable().optional(), body: z.string().max(500_000), hook: z.string().max(2_000).nullable().optional(), summary: z.string().max(5_000).nullable().optional(), hashtags: z.array(z.string().min(1).max(200)).max(50), mediaPlan: jsonObject.optional(), metadata: jsonObject.optional(), status: z.enum(["DRAFT", "READY", "ARCHIVED"]).optional(), expectedVersion: z.number().int().min(1) }).strict();

export async function GET(_request: Request, route: { params: Promise<{ id: string; platform: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const params = await route.params;
  const platform = platformSchema.safeParse(params.platform);
  if (!platform.success) return apiError("INVALID_PLATFORM", 400);
  try { return NextResponse.json(await getPlatformVariant({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: params.id, platform: platform.data })); }
  catch (error) { return platformApiError(error); }
}

export async function PUT(request: Request, route: { params: Promise<{ id: string; platform: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const params = await route.params;
  const [platform, body] = [platformSchema.safeParse(params.platform), updateSchema.safeParse(await request.json().catch(() => null))];
  if (!platform.success || !body.success) return apiError("INVALID_INPUT", 400);
  const { expectedVersion, ...data } = body.data;
  try { return NextResponse.json(await updatePlatformVariant({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: params.id, platform: platform.data, expectedVersion, data })); }
  catch (error) { return platformApiError(error); }
}
