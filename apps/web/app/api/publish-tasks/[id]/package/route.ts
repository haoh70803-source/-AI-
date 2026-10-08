import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { publishApiError } from "@/server/publishing/publish-api";
import { getPublishTask } from "@/server/publishing/publish-task-service";

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try { const task = await getPublishTask({ workspaceId: context.workspace.id, userId: context.session.user.id }, id); return NextResponse.json(task.package); }
  catch (error) { return publishApiError(error); }
}
