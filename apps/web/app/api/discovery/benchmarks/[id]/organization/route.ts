import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { ResearchAccessError, updateResearchOrganization } from "@/server/discovery/research-library";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  try {
    const { id } = await params;
    const data = await request.json().catch(() => null);
    const items = await updateResearchOrganization({ workspaceId: context.workspace.id, userId: context.session.user.id, accountId: id, data });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof ResearchAccessError) return apiError(error.status === 404 ? "NOT_FOUND" : "FORBIDDEN", error.status, error.message);
    return discoveryApiError(error);
  }
}
