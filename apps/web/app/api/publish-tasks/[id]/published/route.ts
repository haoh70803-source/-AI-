import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { publishApiError } from "@/server/publishing/publish-api";
import { markPublishTaskPublished } from "@/server/publishing/publish-task-service";
import { markPublishedSchema } from "@/server/publishing/schemas";

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const body = markPublishedSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json(await markPublishTaskPublished({ workspaceId: context.workspace.id, userId: context.session.user.id, taskId: id, ...body.data, publishedAt: body.data.publishedAt ? new Date(body.data.publishedAt) : undefined })); }
  catch (error) { return publishApiError(error); }
}
