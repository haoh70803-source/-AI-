import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { buildDraftWarnings, warningKey } from "@/server/ai/draft-warnings";
import { draftApiError } from "@/server/drafts/api";
import { confirmDraftRevision, getDraftBranch } from "@/server/drafts/service";

const schema = z.object({ expectedVersion: z.number().int().min(0), warningKeys: z.array(z.string().max(500)).max(100) }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string; draftId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id, draftId } = await route.params;
  try {
    const draft = await getDraftBranch({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, branchId: draftId });
    if (!draft.currentRevision) return apiError("DRAFT_EMPTY", 400, "稿件还没有可确认的内容。");
    const warnings = await buildDraftWarnings({ workspaceId: context.workspace.id, projectId: id, body: draft.currentRevision.body });
    return NextResponse.json(await confirmDraftRevision({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, branchId: draftId, expectedVersion: parsed.data.expectedVersion, warningKeys: parsed.data.warningKeys, currentWarningKeys: warnings.map(warningKey) }));
  } catch (error) { return draftApiError(error) ?? apiError("DRAFT_CONFIRM_FAILED", 500, "稿件确认失败。"); }
}
