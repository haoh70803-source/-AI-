import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { projectApiError } from "@/server/project-api";
import { removeProjectSource } from "@/server/project-service";

export async function DELETE(_request: Request, route: { params: Promise<{ id: string; sourceId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id, sourceId } = await route.params;
  try {
    await removeProjectSource({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, sourceItemId: sourceId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return projectApiError(error) ?? apiError("PROJECT_SOURCE_REMOVE_FAILED", 500);
  }
}
