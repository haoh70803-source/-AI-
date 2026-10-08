import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deepContentApiError } from "@/server/deep-content/api";
import { getGPTTaskPackage, GPT_CONTENT_TYPES } from "@/server/deep-content/gpt-task-package";

const querySchema = z.object({ contentType: z.enum(GPT_CONTENT_TYPES).default("SPOKEN_60"), customRequirements: z.string().max(5_000).optional() });

export async function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ contentType: url.searchParams.get("contentType") || undefined, customRequirements: url.searchParams.get("customRequirements") || undefined });
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json(await getGPTTaskPackage({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data })); }
  catch (error) { return deepContentApiError(error); }
}
