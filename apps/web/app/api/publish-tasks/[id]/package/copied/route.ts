import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { publishApiError } from "@/server/publishing/publish-api";
import { recordPublishPackageCopied } from "@/server/publishing/publish-task-service";

export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try { return NextResponse.json(await recordPublishPackageCopied({ workspaceId: context.workspace.id, userId: context.session.user.id, taskId: id })); }
  catch (error) { return publishApiError(error); }
}
