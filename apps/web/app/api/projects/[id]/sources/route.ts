import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { projectApiError } from "@/server/project-api";
import { addProjectSource } from "@/server/project-service";

const schema = z.object({
  sourceItemId: z.string().trim().min(1),
  role: z.enum(["REFERENCE", "EVIDENCE", "INSPIRATION", "OWN_MATERIAL"]).default("REFERENCE"),
});

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try {
    const relation = await addProjectSource({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data });
    return NextResponse.json(relation, { status: 201 });
  } catch (error) {
    return projectApiError(error) ?? apiError("PROJECT_SOURCE_ADD_FAILED", 500);
  }
}
