import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { artifactApiError } from "@/server/artifacts/api";
import { createTextArtifact, listArtifacts } from "@/server/artifacts/service";

const createSchema = z.object({ type: z.literal("TEXT"), title: z.string().trim().min(1).max(200), sourceMessageId: z.string().min(1).max(200) }).strict();
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id: projectId } = await route.params;
  try { return Response.json({ items: await listArtifacts({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId }) }); }
  catch (error) { return artifactApiError(error); }
}

export async function POST(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("ARTIFACT_INVALID_INPUT", 400, "请提供有效的文本产出标题和来源回复。");
  const { id: projectId } = await route.params;
  try { return Response.json(await createTextArtifact({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId, title: parsed.data.title, sourceMessageId: parsed.data.sourceMessageId }), { status: 201 }); }
  catch (error) { return artifactApiError(error); }
}
