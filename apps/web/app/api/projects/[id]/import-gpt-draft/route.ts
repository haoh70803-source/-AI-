import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deepContentApiError } from "@/server/deep-content/api";
import { importGPTWebDraft } from "@/server/deep-content/gpt-draft-import";

const schema = z.object({ title: z.string().min(1).max(2_000), body: z.string().min(1).max(1_000_000), note: z.string().max(5_000).optional(), confirmReplace: z.boolean() }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  try { return NextResponse.json({ motherContent: await importGPTWebDraft({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data }) }, { status: 201 }); }
  catch (error) { return deepContentApiError(error); }
}
