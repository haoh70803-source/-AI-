import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { draftApiError } from "@/server/drafts/api";
import { checkpointDraftBranch } from "@/server/drafts/service";

const schema = z.object({ expectedVersion: z.number().int().min(0) }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string; draftId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id, draftId } = await route.params;
  try { return NextResponse.json(await checkpointDraftBranch({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, branchId: draftId, expectedVersion: parsed.data.expectedVersion })); }
  catch (error) { return draftApiError(error) ?? apiError("DRAFT_CHECKPOINT_FAILED", 500, "稿件历史保存失败。"); }
}
