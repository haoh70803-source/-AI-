import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { publishApiError } from "@/server/publishing/publish-api";
import { schedulePublishTask } from "@/server/publishing/publish-task-service";
import { schedulePublishTaskSchema } from "@/server/publishing/schemas";

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const body = schedulePublishTaskSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json(await schedulePublishTask({ workspaceId: context.workspace.id, userId: context.session.user.id, taskId: id, scheduledAt: new Date(body.data.scheduledAt) })); }
  catch (error) { return publishApiError(error); }
}
