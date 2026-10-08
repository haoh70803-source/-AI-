import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { createEvidence } from "@/server/evidence-service";
import { projectApiError } from "@/server/project-api";

const evidenceSchema = z.object({
  type: z.enum(["FACT", "VIEWPOINT", "CASE", "DATA", "QUOTE", "EXPERIENCE", "QUESTION", "OTHER"]),
  sourceItemId: z.string().trim().min(1).nullable().optional(),
  excerpt: z.string().trim().max(20_000).optional(),
  claim: z.string().trim().max(5_000).optional(),
  note: z.string().trim().max(5_000).optional(),
  sourceUrl: z.string().trim().url().max(2_000).or(z.literal("")).optional(),
}).refine((value) => Boolean(value.excerpt || value.claim || value.note), { message: "至少填写摘录、观点或备注。" });

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = evidenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "Evidence 至少需要摘录、观点或备注。");
  const { id } = await route.params;
  try {
    const evidence = await createEvidence({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, data: parsed.data });
    return NextResponse.json(evidence, { status: 201 });
  } catch (error) {
    return projectApiError(error) ?? apiError("EVIDENCE_CREATE_FAILED", 500);
  }
}
