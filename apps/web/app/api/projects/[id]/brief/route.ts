import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { saveBrief } from "@/server/brief-service";
import { projectApiError } from "@/server/project-api";

const schema = z.object({
  topic: z.string().max(2_000),
  angle: z.string().max(5_000),
  audience: z.string().max(2_000),
  coreMessage: z.string().max(10_000),
  coreQuestion: z.string().max(5_000).optional(),
  background: z.string().max(10_000).optional(),
  keyPoints: z.array(z.string().max(5_000)).max(100),
  structure: z.array(z.string().max(5_000)).max(100),
  tone: z.string().max(2_000),
  risks: z.array(z.string().max(5_000)).max(100),
  expectedVersion: z.number().int().min(0),
});

export async function PUT(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try {
    const brief = await saveBrief({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, data: parsed.data });
    return NextResponse.json({ id: brief.id, version: brief.version, updatedAt: brief.updatedAt });
  } catch (error) {
    return projectApiError(error) ?? apiError("BRIEF_SAVE_FAILED", 500);
  }
}
