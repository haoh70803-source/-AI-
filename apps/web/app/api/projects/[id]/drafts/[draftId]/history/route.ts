import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { draftApiError } from "@/server/drafts/api";
import { getDraftHistory } from "@/server/drafts/service";

export async function GET(_request: Request, route: { params: Promise<{ id: string; draftId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id, draftId } = await route.params;
  try { return NextResponse.json({ history: await getDraftHistory({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, branchId: draftId }) }); }
  catch (error) { return draftApiError(error) ?? apiError("DRAFT_HISTORY_FAILED", 500, "历史记录加载失败。"); }
}
