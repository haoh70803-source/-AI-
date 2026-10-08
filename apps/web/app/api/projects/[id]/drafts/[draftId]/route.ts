import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { draftApiError } from "@/server/drafts/api";
import { getDraftBranch, renameDraftBranch, saveDraftWorkingState, softDeleteDraftBranch } from "@/server/drafts/service";

const revisionSchema = z.object({ expectedVersion: z.number().int().min(0), title: z.string().max(2_000), body: z.string().max(1_000_000), outline: z.array(z.string().max(5_000)).max(200) }).strict();
const renameSchema = z.object({ expectedVersion: z.number().int().min(0), title: z.string().min(1).max(120) }).strict();
const deleteSchema = z.object({ expectedVersion: z.number().int().min(0) }).strict();
type RouteContext = { params: Promise<{ id: string; draftId: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id, draftId } = await route.params;
  try { return NextResponse.json({ draft: await getDraftBranch({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, branchId: draftId }) }); }
  catch (error) { return draftApiError(error) ?? apiError("DRAFT_LOAD_FAILED", 500, "稿件加载失败。"); }
}

export async function PUT(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = revisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请检查稿件内容。");
  const { id, draftId } = await route.params;
  try { return NextResponse.json(await saveDraftWorkingState({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, branchId: draftId, ...parsed.data })); }
  catch (error) { return draftApiError(error) ?? apiError("DRAFT_SAVE_FAILED", 500, "稿件保存失败。"); }
}

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请填写稿件名称。");
  const { id, draftId } = await route.params;
  try { return NextResponse.json({ draft: await renameDraftBranch({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, branchId: draftId, ...parsed.data }) }); }
  catch (error) { return draftApiError(error) ?? apiError("DRAFT_RENAME_FAILED", 500, "稿件重命名失败。"); }
}

export async function DELETE(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id, draftId } = await route.params;
  try { return NextResponse.json(await softDeleteDraftBranch({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, branchId: draftId, ...parsed.data })); }
  catch (error) { return draftApiError(error) ?? apiError("DRAFT_DELETE_FAILED", 500, "稿件删除失败。"); }
}
