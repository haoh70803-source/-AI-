import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { aiApiError } from "@/server/ai/ai-api";
import { runAIAction } from "@/server/ai/ai-run-service";
import { AI_ACTIONS, studioQuickActionSchema } from "@/server/ai/schemas";
import { runUnifiedCreativeAnalysis } from "@/server/unified-analysis/service";
import { runStudioQuickAction } from "@/server/studio/quick-actions";

const schema = z.union([
  z.object({ action: z.enum(["UNIFIED_CREATIVE_ANALYSIS", ...AI_ACTIONS]), selectedText: z.string().max(20_000).optional(), instruction: z.string().max(5_000).optional() }).strict(),
  z.object({ studioAction: studioQuickActionSchema, instruction: z.string().max(5_000).optional(), selectedText: z.string().max(20_000).optional(), selectionStart: z.number().int().nonnegative().optional(), selectionEnd: z.number().int().nonnegative().optional() }).strict(),
]);

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try {
    if ("studioAction" in parsed.data) return NextResponse.json(await runStudioQuickAction({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, studioAction: parsed.data.studioAction, instruction: parsed.data.instruction, selectedText: parsed.data.selectedText, selectionStart: parsed.data.selectionStart, selectionEnd: parsed.data.selectionEnd }), { status: 201 });
    const { action, selectedText, instruction } = parsed.data;
    if (action === "UNIFIED_CREATIVE_ANALYSIS") return NextResponse.json(await runUnifiedCreativeAnalysis({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id }), { status: 201 });
    return NextResponse.json(await runAIAction({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, action, selectedText, instruction }), { status: 201 });
  }
  catch (error) { return aiApiError(error); }
}
