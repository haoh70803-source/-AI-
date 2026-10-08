import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { createProject, listProjects } from "@/server/project-service";
import { projectApiError } from "@/server/project-api";
import { creationModelSchema } from "@/server/creation/models";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000).optional(),
  goal: z.string().trim().max(2_000).optional(),
  audience: z.string().trim().max(2_000).optional(),
  sourceItemId: z.string().trim().min(1).optional(),
  sourceItemIds: z.array(z.string().trim().min(1)).max(8).optional(),
  clientRequestId: z.uuid().optional(),
  folderId: z.string().trim().min(1).optional(),
  methodVersionIds: z.array(z.string().min(1).max(200)).max(1).optional(),
  modelSelection: creationModelSchema.nullable().optional(),
});

export async function GET(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  return NextResponse.json(await listProjects(context.workspace.id, query));
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请填写项目名称并检查字段长度。");
  try {
    const project = await createProject({ workspaceId: context.workspace.id, userId: context.session.user.id, ...parsed.data });
    return NextResponse.json({ id: project.id, status: project.status }, { status: 201 });
  } catch (error) {
    return projectApiError(error) ?? apiError("PROJECT_CREATE_FAILED", 500, "无法创建内容项目。");
  }
}
