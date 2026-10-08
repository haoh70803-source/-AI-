import { getApiWorkspaceContext, apiError } from "@/server/api-access";
import { searchContextReferences } from "@/server/assistant/references";
import { assistantApiError } from "@/server/assistant/api";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await params;
  try { return Response.json({ items: await searchContextReferences({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id }, new URL(request.url).searchParams.get("q") || "") }); }
  catch (error) { return assistantApiError(error); }
}
