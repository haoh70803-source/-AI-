import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { startIdeaSchema } from "@/server/discovery/schemas";
import { startIdeaProject } from "@/server/discovery/service";

export async function POST(request: Request, { params }: RouteContext<"/api/discovery/ideas/[id]/start">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    const { id } = await params;
    const input = startIdeaSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await startIdeaProject({ workspaceId: context.workspace.id, userId: context.session.user.id, ideaId: id, collectMissing: input.collectMissing }));
  } catch (error) {
    return discoveryApiError(error);
  }
}
