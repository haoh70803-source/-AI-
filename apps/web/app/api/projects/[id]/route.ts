import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deleteProject, getProjectForUser, updateProject } from "@/server/project-service";
import { projectApiError } from "@/server/project-api";

type Context = { params: Promise<{ id: string }> };
const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5_000).optional(),
  goal: z.string().trim().max(2_000).optional(),
  audience: z.string().trim().max(2_000).optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function GET(_request: Request, route: Context) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  const project = await getProjectForUser({ userId: context.session.user.id, workspaceId: context.workspace.id, projectId: id });
  if (!project) return apiError("NOT_FOUND", 404);
  return NextResponse.json(project);
}

export async function PATCH(request: Request, route: Context) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try {
    const project = await updateProject({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, data: parsed.data });
    return NextResponse.json(project);
  } catch (error) {
    return projectApiError(error) ?? apiError("PROJECT_UPDATE_FAILED", 500);
  }
}

export async function DELETE(_request: Request, route: Context) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  try {
    await deleteProject({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return projectApiError(error) ?? apiError("PROJECT_DELETE_FAILED", 500);
  }
}
