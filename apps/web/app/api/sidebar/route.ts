import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { getProjectListView } from "@/server/sidebar/service";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  return NextResponse.json(await getProjectListView({ workspaceId: context.workspace.id, userId: context.session.user.id }));
}
