import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { aiApiError } from "@/server/ai/ai-api";
import { discardAIResult } from "@/server/ai/ai-run-service";

export async function POST(_request: Request, route: { params: Promise<{ id: string; runId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id, runId } = await route.params;
  try { return NextResponse.json(await discardAIResult({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, runId })); }
  catch (error) { return aiApiError(error); }
}
