import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { draftApiError } from "@/server/drafts/api";
import { createDraftBranch, listDraftBranches } from "@/server/drafts/service";

const createSchema = z.object({ title: z.string().min(1).max(120), copyFromBranchId: z.string().min(1).max(200).nullable().optional() }).strict();
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try { return NextResponse.json({ drafts: await listDraftBranches({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id }) }); }
  catch (error) { return draftApiError(error) ?? apiError("DRAFT_LIST_FAILED", 500, "稿件列表加载失败。"); }
}

export async function POST(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请填写稿件名称。");
  const { id } = await route.params;
  try { return NextResponse.json({ draft: await createDraftBranch({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, ...parsed.data }) }, { status: 201 }); }
  catch (error) { return draftApiError(error) ?? apiError("DRAFT_CREATE_FAILED", 500, "新建稿件失败。"); }
}
