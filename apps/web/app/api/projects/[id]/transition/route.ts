import { CONTENT_PROJECT_STATUSES, type ContentProjectStatus } from "@content-center/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { projectApiError } from "@/server/project-api";
import { transitionProjectStatus } from "@/server/project-service";

const schema = z.object({ to: z.enum(CONTENT_PROJECT_STATUSES) });

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try {
    const project = await transitionProjectStatus({
      workspaceId: context.workspace.id,
      userId: context.session.user.id,
      projectId: id,
      to: parsed.data.to as ContentProjectStatus,
    });
    return NextResponse.json({ id: project.id, status: project.status });
  } catch (error) {
    return projectApiError(error) ?? apiError("PROJECT_TRANSITION_FAILED", 500);
  }
}
