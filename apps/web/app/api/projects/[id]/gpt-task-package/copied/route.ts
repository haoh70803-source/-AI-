import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deepContentApiError } from "@/server/deep-content/api";
import { GPT_CONTENT_TYPES, recordGPTTaskPackageCopied } from "@/server/deep-content/gpt-task-package";

const schema = z.object({ packageId: z.string().min(1), contentType: z.enum(GPT_CONTENT_TYPES), characterCount: z.number().int().min(0).max(1_000_000) }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json(await recordGPTTaskPackageCopied({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data })); }
  catch (error) { return deepContentApiError(error); }
}
