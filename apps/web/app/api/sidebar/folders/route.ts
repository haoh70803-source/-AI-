import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { sidebarApiError } from "@/server/sidebar/api";
import { createProjectFolder } from "@/server/sidebar/service";

const createSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("SIDEBAR_INVALID_INPUT", 400, "请输入 1 到 80 个字的文件夹名称。");
  try {
    return NextResponse.json(await createProjectFolder({ workspaceId: context.workspace.id, userId: context.session.user.id, name: parsed.data.name }), { status: 201 });
  } catch (error) {
    return sidebarApiError(error) ?? apiError("SIDEBAR_FOLDER_CREATE_FAILED", 500);
  }
}
