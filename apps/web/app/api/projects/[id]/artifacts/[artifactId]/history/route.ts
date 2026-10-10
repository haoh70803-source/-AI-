import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { artifactApiError } from "@/server/artifacts/api";
import { getArtifactHistoryPage, restoreArtifactRevision } from "@/server/artifacts/service";
type Context = { params: Promise<{ id: string; artifactId: string }> };
export async function GET(request: Request, context: Context) {
  const actor = await getApiWorkspaceContext(); if (!actor) return apiError("UNAUTHORIZED", 401);
  const { id: projectId, artifactId } = await context.params;
  const parsed = z.coerce.number().int().positive().optional().safeParse(new URL(request.url).searchParams.get("before") ?? undefined);
  if (!parsed.success) return apiError("ARTIFACT_INVALID_INPUT", 400);
  try { return Response.json(await getArtifactHistoryPage({ workspaceId: actor.workspace.id, userId: actor.session.user.id, projectId, artifactId, beforeRevision: parsed.data })); }
  catch (error) { return artifactApiError(error); }
}
export async function POST(request: Request, context: Context) {
  const actor = await getApiWorkspaceContext(); if (!actor) return apiError("UNAUTHORIZED", 401);
  const parsed = z.object({ revisionId: z.string().min(1).max(200), expectedVersion: z.number().int().positive() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("ARTIFACT_INVALID_INPUT", 400);
  const { id: projectId, artifactId } = await context.params;
  try { return Response.json(await restoreArtifactRevision({ workspaceId: actor.workspace.id, userId: actor.session.user.id, projectId, artifactId, ...parsed.data })); }
  catch (error) { return artifactApiError(error); }
}
