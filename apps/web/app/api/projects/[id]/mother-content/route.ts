import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { listMotherContentVersions, saveMotherContent } from "@/server/mother-content-service";
import { projectApiError } from "@/server/project-api";

const schema = z.object({
  title: z.string().max(2_000),
  body: z.string().max(1_000_000),
  outline: z.array(z.string().max(5_000)).max(200),
  expectedVersion: z.number().int().min(0),
});

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try { return NextResponse.json(await listMotherContentVersions({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id })); }
  catch (error) { return projectApiError(error) ?? apiError("MOTHER_CONTENT_HISTORY_FAILED", 500); }
}

export async function PUT(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try {
    const content = await saveMotherContent({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, data: parsed.data });
    return NextResponse.json({ id: content.id, version: content.version, updatedAt: content.updatedAt });
  } catch (error) {
    return projectApiError(error) ?? apiError("MOTHER_CONTENT_SAVE_FAILED", 500);
  }
}
