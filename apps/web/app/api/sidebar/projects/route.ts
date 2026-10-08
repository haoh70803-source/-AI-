import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { BasicProjectError, createBasicProject } from "@/server/sidebar/basic-project";

const schema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(5_000).optional(), folderId: z.string().trim().min(1).optional() }).strict();

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请填写项目名称并检查字段长度。");
  try {
    const project = await createBasicProject({ workspaceId: context.workspace.id, userId: context.session.user.id, ...parsed.data });
    return Response.json({ id: project.id, status: project.status }, { status: 201 });
  } catch (error) {
    if (error instanceof BasicProjectError) return apiError(error.code, error.code === "FORBIDDEN" ? 403 : error.code === "FOLDER_NOT_FOUND" ? 404 : 400);
    throw error;
  }
}
