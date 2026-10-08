import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { platformApiError } from "@/server/platforms/platform-api";
import { listPlatformVariants } from "@/server/platforms/platform-variant-service";

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try { return NextResponse.json(await listPlatformVariants({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id })); }
  catch (error) { return platformApiError(error); }
}
