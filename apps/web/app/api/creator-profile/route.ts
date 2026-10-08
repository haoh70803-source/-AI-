import { isExperienceAccount } from "@/server/experience-account";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { getCreatorProfile, saveCreatorProfile } from "@/server/creator-profile-service";

const text = z.string().max(10_000);
const lines = z.array(z.string().trim().min(1).max(2_000)).max(200);
const schema = z.object({
  displayName: text, positioning: text, targetAudience: text, tone: text, preferredStyle: text, forbiddenStyle: text,
  coreTopics: lines, personalViews: lines, brandTerms: lines, forbiddenTerms: lines, hookPreferences: lines,
  structurePreferences: lines, ctaPreferences: lines, examplePhrases: lines, notes: text,
}).strict();

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  return NextResponse.json(await getCreatorProfile(context.workspace.id, context.session.user.id));
}

export async function PUT(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (isExperienceAccount(context.session.user)) return apiError("EXPERIENCE_READ_ONLY", 403, "体验账号只能查看设置。");
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请检查创作画像字段长度。");
  return NextResponse.json(await saveCreatorProfile({ workspaceId: context.workspace.id, userId: context.session.user.id, data: parsed.data }));
}
