import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { updateIdeaSchema } from "@/server/discovery/schemas";
import { getIdea, updateIdea } from "@/server/discovery/service";

export async function GET(_request: Request, { params }: RouteContext<"/api/discovery/ideas/[id]">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await params;
  const idea = await getIdea(context.workspace.id, id);
  return idea ? NextResponse.json({ idea }) : apiError("NOT_FOUND", 404);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/discovery/ideas/[id]">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    const { id } = await params;
    const data = updateIdeaSchema.parse(await request.json().catch(() => null));
    return NextResponse.json({ idea: await updateIdea({ workspaceId: context.workspace.id, userId: context.session.user.id, ideaId: id, data }) });
  } catch (error) {
    return discoveryApiError(error);
  }
}
