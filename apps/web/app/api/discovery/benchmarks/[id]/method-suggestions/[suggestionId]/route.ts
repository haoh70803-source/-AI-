import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { learningSuggestionApiError } from "@/server/learning-suggestions/api";
import { decideMethodSuggestion } from "@/server/learning-suggestions/service";

const lines = z.array(z.string().trim().min(1).max(500)).min(1).max(8);
const schema = z.discriminatedUnion("decision", [z.object({ decision: z.literal("REJECT") }).strict(), z.object({ decision: z.literal("SAVE"), title: z.string().trim().min(1).max(200), steps: lines, applicableScenarios: lines, boundaries: lines }).strict()]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; suggestionId: string }> }) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401); const { id, suggestionId } = await params; const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("INVALID_INPUT", 400, "请检查方法内容。");
  try { return NextResponse.json(await decideMethodSuggestion({ workspaceId: context.workspace.id, userId: context.session.user.id, benchmarkAccountId: id, suggestionId, ...parsed.data })); } catch (error) { return learningSuggestionApiError(error) ?? apiError("METHOD_SUGGESTION_UPDATE_FAILED", 500, "暂时无法处理这条方法建议。"); }
}
