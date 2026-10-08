import { NextResponse } from "next/server";
import { z } from "zod";
import { SUPPORTED_PLATFORMS } from "@/lib/platforms";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { publishApiError } from "@/server/publishing/publish-api";
import { createPublishTask, listPublishTasks } from "@/server/publishing/publish-task-service";
import { createPublishTaskSchema, publishStatusSchema } from "@/server/publishing/schemas";

const querySchema = z.object({
  platform: z.enum(SUPPORTED_PLATFORMS).optional(),
  status: publishStatusSchema.optional(),
  creatorId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  try {
    return NextResponse.json(await listPublishTasks({ workspaceId: context.workspace.id, userId: context.session.user.id }, { ...parsed.data, from: parsed.data.from ? new Date(parsed.data.from) : undefined, to: parsed.data.to ? new Date(parsed.data.to) : undefined }));
  } catch (error) { return publishApiError(error); }
}
export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const body = createPublishTaskSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("INVALID_INPUT", 400);
  try {
    const task = await createPublishTask({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: body.data.projectId, platform: body.data.platform, scheduledAt: body.data.scheduledAt ? new Date(body.data.scheduledAt) : null });
    return NextResponse.json(task, { status: 201 });
  } catch (error) { return publishApiError(error); }
}
