import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { saveMotherWarningConfirmations, MotherContentConfirmationError } from "@/server/mother-content-service";

const schema = z.object({ version: z.number().int().positive(), warningKeys: z.array(z.string().max(500)).max(100) });

export async function PUT(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { await saveMotherWarningConfirmations({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data }); return NextResponse.json({ ok: true }); }
  catch (error) { if (error instanceof MotherContentConfirmationError) return apiError(error.code, 409, error.message); return apiError("MOTHER_CONFIRMATION_SAVE_FAILED", 500, "确认状态保存失败。"); }
}
