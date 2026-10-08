import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { createProjectFromContentSchema } from "@/server/discovery/schemas";
import { createProjectFromExternalContent } from "@/server/discovery/service";

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    const input = createProjectFromContentSchema.parse(await request.json().catch(() => null));
    const result = await createProjectFromExternalContent({ workspaceId: context.workspace.id, userId: context.session.user.id, content: input.content });
    return NextResponse.json({ projectId: result.project.id, sourceItemId: result.sourceItem.id }, { status: 201 });
  } catch (error) {
    return discoveryApiError(error);
  }
}
