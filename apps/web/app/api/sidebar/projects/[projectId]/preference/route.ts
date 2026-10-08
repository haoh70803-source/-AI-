import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { sidebarApiError } from "@/server/sidebar/api";
import { updateProjectPreference } from "@/server/sidebar/service";

type RouteContext = { params: Promise<{ projectId: string }> };
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["PIN", "UNPIN", "MOVE_UP", "MOVE_DOWN", "MOVE_TOP"]) }).strict(),
  z.object({ action: z.literal("MOVE"), folderId: z.string().min(1).max(200).nullable() }).strict(),
]);

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("SIDEBAR_INVALID_INPUT", 400);
  const { projectId } = await route.params;
  try {
    return NextResponse.json(await updateProjectPreference({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId, command: parsed.data }));
  } catch (error) {
    return sidebarApiError(error) ?? apiError("SIDEBAR_PROJECT_PREFERENCE_FAILED", 500);
  }
}
