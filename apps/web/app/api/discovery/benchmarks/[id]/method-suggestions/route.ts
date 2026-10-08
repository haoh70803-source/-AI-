import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { learningSuggestionApiError } from "@/server/learning-suggestions/api";
import { generateMethodSuggestions, listMethodSuggestions } from "@/server/learning-suggestions/service";

const schema = z.object({ benchmarkStudyId: z.string().trim().min(1).max(200) }).strict();

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401); const { id } = await params;
  return NextResponse.json({ items: await listMethodSuggestions({ workspaceId: context.workspace.id, userId: context.session.user.id, benchmarkAccountId: id }) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401); const { id } = await params; const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("INVALID_INPUT", 400);
  try { return NextResponse.json(await generateMethodSuggestions({ workspaceId: context.workspace.id, userId: context.session.user.id, benchmarkAccountId: id, benchmarkStudyId: parsed.data.benchmarkStudyId })); } catch (error) { return learningSuggestionApiError(error) ?? apiError("METHOD_SUGGESTIONS_FAILED", 500, "暂时没整理出可复用的方法，可以稍后再试。"); }
}
