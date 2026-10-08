import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@content-center/db";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

const schema = z.object({ action: z.literal("DISMISS"), basisId: z.string().startsWith("source-gap:").max(100) }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  const project = await db.contentProject.findFirst({ where: { id, workspaceId: context.workspace.id }, select: { id: true } });
  if (!project) return apiError("PROJECT_NOT_FOUND", 404);
  await db.auditLog.create({ data: { workspaceId: context.workspace.id, userId: context.session.user.id, action: "creative_basis.dismissed", resourceType: "content_project", resourceId: project.id, metadata: { projectId: project.id, basisId: parsed.data.basisId } } });
  return NextResponse.json({ dismissed: true });
}
