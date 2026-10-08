import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { artifactApiError } from "@/server/artifacts/api";
import { applyTextArtifactRevision } from "@/server/artifacts/service";

const schema = z.object({ sourceMessageId: z.string().min(1).max(200), expectedVersion: z.number().int().min(1) }).strict();
type RouteContext = { params: Promise<{ id: string; artifactId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("ARTIFACT_INVALID_INPUT", 400, "请刷新产出后再应用修改。");
  const { id: projectId, artifactId } = await route.params;
  try { return Response.json(await applyTextArtifactRevision({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId, artifactId, sourceMessageId: parsed.data.sourceMessageId, expectedVersion: parsed.data.expectedVersion }), { status: 201 }); }
  catch (error) { return artifactApiError(error); }
}
