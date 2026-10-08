import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { getCreationModels } from "@/server/creation/models";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  return Response.json(await getCreationModels(context.workspace.id));
}
