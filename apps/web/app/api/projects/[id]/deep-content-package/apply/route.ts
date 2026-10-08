import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deepContentApiError } from "@/server/deep-content/api";
import { applyDeepContentPackagePreview } from "@/server/deep-content/service";

const schema = z.object({ runId: z.string().min(1) }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json({ package: await applyDeepContentPackagePreview({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, runId: parsed.data.runId }) }); }
  catch (error) { return deepContentApiError(error); }
}
