import { isExperienceAccount } from "@/server/experience-account";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { learningSuggestionApiError } from "@/server/learning-suggestions/api";
import { decideCreatorProfileSuggestion } from "@/server/learning-suggestions/service";

const schema = z.object({ decision: z.enum(["ACCEPT", "REJECT"]) }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ suggestionId: string }> }) { const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  if (isExperienceAccount(context.session.user)) return apiError("EXPERIENCE_READ_ONLY", 403, "体验账号只能查看设置。"); const { suggestionId } = await params; const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("INVALID_INPUT", 400); try { return NextResponse.json(await decideCreatorProfileSuggestion({ workspaceId: context.workspace.id, userId: context.session.user.id, suggestionId, decision: parsed.data.decision })); } catch (error) { return learningSuggestionApiError(error) ?? apiError("PROFILE_SUGGESTION_UPDATE_FAILED", 500, "暂时无法处理这条画像建议。"); } }
