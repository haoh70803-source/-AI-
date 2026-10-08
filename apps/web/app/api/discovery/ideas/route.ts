import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { createIdeaSchema } from "@/server/discovery/schemas";
import { createIdea, listIdeas } from "@/server/discovery/service";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  return NextResponse.json({ items: await listIdeas(context.workspace.id) });
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    const input = createIdeaSchema.parse(await request.json().catch(() => null));
    const idea = await createIdea({ workspaceId: context.workspace.id, userId: context.session.user.id, ...input });
    return NextResponse.json({ idea }, { status: 201 });
  } catch (error) {
    return discoveryApiError(error);
  }
}
