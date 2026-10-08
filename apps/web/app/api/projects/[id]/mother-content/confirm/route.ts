import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { buildDraftWarnings, warningKey } from "@/server/ai/draft-warnings";
import { confirmMotherContent, MotherContentConfirmationError } from "@/server/mother-content-service";
import { db } from "@content-center/db";

const schema = z.object({ version: z.number().int().positive() });

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try {
    const mother = await db.motherContent.findFirst({ where: { projectId: id, workspaceId: context.workspace.id }, select: { body: true, confirmedWarnings: true } });
    if (!mother) return apiError("MOTHER_CONTENT_NOT_FOUND", 404, "口播稿不存在。");
    const warnings = await buildDraftWarnings({ workspaceId: context.workspace.id, projectId: id, body: mother.body });
    const currentWarningKeys = warnings.map(warningKey);
    const warningKeys = Array.isArray(mother.confirmedWarnings) ? mother.confirmedWarnings.filter((value): value is string => typeof value === "string") : [];
    const content = await confirmMotherContent({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, version: parsed.data.version, warningKeys, currentWarningKeys });
    return NextResponse.json({ version: content.confirmedVersion });
  } catch (error) { if (error instanceof MotherContentConfirmationError) return apiError(error.code, 409, error.message); return apiError("MOTHER_CONFIRMATION_FAILED", 500, "口播稿确认失败，请稍后重试。"); }
}
