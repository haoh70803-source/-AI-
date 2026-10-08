import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { sidebarApiError } from "@/server/sidebar/api";
import { deleteProjectFolder, updateProjectFolder } from "@/server/sidebar/service";

type RouteContext = { params: Promise<{ folderId: string }> };
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("RENAME"), name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.enum(["MOVE_UP", "MOVE_DOWN", "MOVE_TOP"]) }).strict(),
]);

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("SIDEBAR_INVALID_INPUT", 400);
  const { folderId } = await route.params;
  try {
    return NextResponse.json(await updateProjectFolder({ workspaceId: context.workspace.id, userId: context.session.user.id, folderId, command: parsed.data }));
  } catch (error) {
    return sidebarApiError(error) ?? apiError("SIDEBAR_FOLDER_UPDATE_FAILED", 500);
  }
}

export async function DELETE(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { folderId } = await route.params;
  try {
    return NextResponse.json(await deleteProjectFolder({ workspaceId: context.workspace.id, userId: context.session.user.id, folderId }));
  } catch (error) {
    return sidebarApiError(error) ?? apiError("SIDEBAR_FOLDER_DELETE_FAILED", 500);
  }
}
