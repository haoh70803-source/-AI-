import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deleteEvidence, moveEvidence, updateEvidence } from "@/server/evidence-service";
import { projectApiError } from "@/server/project-api";

const updateSchema = z.union([
  z.object({ direction: z.enum(["UP", "DOWN"]) }),
  z.object({
    type: z.enum(["FACT", "VIEWPOINT", "CASE", "DATA", "QUOTE", "EXPERIENCE", "QUESTION", "OTHER"]).optional(),
    sourceItemId: z.string().trim().min(1).nullable().optional(),
    excerpt: z.string().trim().max(20_000).optional(),
    claim: z.string().trim().max(5_000).optional(),
    note: z.string().trim().max(5_000).optional(),
    sourceUrl: z.string().trim().url().max(2_000).or(z.literal("")).optional(),
  }).refine((value) => Object.keys(value).length > 0),
]);

type Context = { params: Promise<{ id: string; evidenceId: string }> };

export async function PATCH(request: Request, route: Context) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id, evidenceId } = await route.params;
  try {
    if ("direction" in parsed.data) {
      await moveEvidence({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, evidenceId, direction: parsed.data.direction });
      return NextResponse.json({ moved: true });
    }
    const evidence = await updateEvidence({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, evidenceId, data: parsed.data });
    return NextResponse.json(evidence);
  } catch (error) {
    return projectApiError(error) ?? apiError("EVIDENCE_UPDATE_FAILED", 500);
  }
}

export async function DELETE(_request: Request, route: Context) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id, evidenceId } = await route.params;
  try {
    await deleteEvidence({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, evidenceId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return projectApiError(error) ?? apiError("EVIDENCE_DELETE_FAILED", 500);
  }
}
