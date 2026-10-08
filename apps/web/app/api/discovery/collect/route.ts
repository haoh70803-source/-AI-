import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { collectExternalContentSchema } from "@/server/discovery/schemas";
import { collectExternalContent } from "@/server/discovery/service";

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    const input = collectExternalContentSchema.parse(await request.json().catch(() => null));
    const result = await collectExternalContent({ workspaceId: context.workspace.id, userId: context.session.user.id, content: input.content });
    return NextResponse.json({ sourceItemId: result.sourceItem.id, created: result.created, status: result.created ? "QUEUED" : result.sourceItem.status }, { status: result.created ? 202 : 200 });
  } catch (error) {
    return discoveryApiError(error);
  }
}
