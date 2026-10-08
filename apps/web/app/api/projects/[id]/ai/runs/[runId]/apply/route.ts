import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { aiApiError } from "@/server/ai/ai-api";
import { applyAIResult } from "@/server/ai/ai-run-service";
import { applyStudioQuickAction } from "@/server/studio/quick-actions";

const schema = z.object({ expectedVersion: z.number().int().min(0).optional(), selectedIndex: z.number().int().min(0).optional(), selectedIndexes: z.array(z.number().int().min(0)).max(50).optional(), confirmReplace: z.boolean().optional(), selectionStart: z.number().int().min(0).optional(), selectionEnd: z.number().int().min(0).optional(), mode: z.enum(["REPLACE", "INSERT_AFTER"]).optional(), studioQuickAction: z.boolean().optional(), suggestionIndex: z.number().int().min(0).optional() }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string; runId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id, runId } = await route.params;
  try {
    if (parsed.data.studioQuickAction) return NextResponse.json(await applyStudioQuickAction({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, runId, expectedVersion: parsed.data.expectedVersion ?? 0, suggestionIndex: parsed.data.suggestionIndex }));
    return NextResponse.json(await applyAIResult({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, runId, ...parsed.data }));
  }
  catch (error) { return aiApiError(error); }
}
