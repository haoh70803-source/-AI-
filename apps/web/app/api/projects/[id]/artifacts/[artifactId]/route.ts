import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { artifactApiError } from "@/server/artifacts/api";
import { z } from "zod";
import { getArtifact, saveTextArtifact } from "@/server/artifacts/service";

type RouteContext = { params: Promise<{ id: string; artifactId: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id: projectId, artifactId } = await route.params;
  try { return Response.json(await getArtifact({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId, artifactId })); }
  catch (error) { return artifactApiError(error); }
}

const saveSchema = z.object({ expectedVersion: z.number().int().min(1), title: z.string().trim().min(1).max(200), body: z.string().max(1_000_000) }).strict();
export async function PUT(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("ARTIFACT_INVALID_INPUT", 400, "请检查成果标题、正文和版本。");
  const { id: projectId, artifactId } = await route.params;
  try { return Response.json(await saveTextArtifact({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId, artifactId, ...parsed.data })); }
  catch (error) { return artifactApiError(error); }
}
