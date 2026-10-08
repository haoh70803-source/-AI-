import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { publishApiError } from "@/server/publishing/publish-api";
import { getPublishTask, updatePublishTask } from "@/server/publishing/publish-task-service";
import { updatePublishTaskSchema } from "@/server/publishing/schemas";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: Context) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try { return NextResponse.json(await getPublishTask({ workspaceId: context.workspace.id, userId: context.session.user.id }, id)); }
  catch (error) { return publishApiError(error); }
}
export async function PATCH(request: Request, route: Context) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const body = updatePublishTaskSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json(await updatePublishTask({ workspaceId: context.workspace.id, userId: context.session.user.id, taskId: id, ...body.data })); }
  catch (error) { return publishApiError(error); }
}
