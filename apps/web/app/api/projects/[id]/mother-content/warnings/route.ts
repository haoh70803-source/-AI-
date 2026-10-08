import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { buildDraftWarnings } from "@/server/ai/draft-warnings";

const schema = z.object({ body: z.string().max(1_000_000) });

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json({ warnings: await buildDraftWarnings({ workspaceId: context.workspace.id, projectId: id, body: parsed.data.body }) }); }
  catch { return apiError("MOTHER_WARNING_CHECK_FAILED", 500, "暂时无法检查需要确认的内容。"); }
}
