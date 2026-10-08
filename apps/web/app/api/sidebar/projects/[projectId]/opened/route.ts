import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { sidebarApiError } from "@/server/sidebar/api";
import { recordProjectOpened } from "@/server/sidebar/service";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { projectId } = await route.params;
  try {
    return NextResponse.json(await recordProjectOpened({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId }));
  } catch (error) {
    return sidebarApiError(error) ?? apiError("SIDEBAR_PROJECT_OPEN_FAILED", 500);
  }
}
