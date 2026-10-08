import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { restoreProject } from "@/server/project-service";
import { projectApiError } from "@/server/project-api";

export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  try { return NextResponse.json(await restoreProject({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id })); }
  catch (error) { return projectApiError(error) ?? apiError("PROJECT_RESTORE_FAILED", 500, "恢复失败，请稍后重试。"); }
}
