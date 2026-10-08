import { isExperienceAccount } from "@/server/experience-account";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { learningSuggestionApiError } from "@/server/learning-suggestions/api";
import { generateCreatorProfileSuggestions, listCreatorProfileSuggestions } from "@/server/learning-suggestions/service";

export async function GET() { const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401); return NextResponse.json({ items: await listCreatorProfileSuggestions({ workspaceId: context.workspace.id, userId: context.session.user.id }) }); }
export async function POST() { const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  if (isExperienceAccount(context.session.user)) return apiError("EXPERIENCE_READ_ONLY", 403, "体验账号只能查看设置。"); try { return NextResponse.json(await generateCreatorProfileSuggestions({ workspaceId: context.workspace.id, userId: context.session.user.id })); } catch (error) { return learningSuggestionApiError(error) ?? apiError("PROFILE_SUGGESTIONS_FAILED", 500, "暂时无法整理最近的表达变化。"); } }
