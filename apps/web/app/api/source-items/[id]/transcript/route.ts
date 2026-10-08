import { db, findSourceForUser } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

const updateTranscriptSchema = z.object({ fullText: z.string().trim().min(1).max(1_000_000), expectedUpdatedAt: z.string().optional() }).strict();
type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  const input = updateTranscriptSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("INVALID_INPUT", 400, "转写文字不能为空。");
  const source = await findSourceForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, sourceItemId: id });
  if (!source) return apiError("NOT_FOUND", 404, "资料不存在。");
  if(source.sourceProvider==="FEISHU")return apiError("FEISHU_MANAGED",409,"飞书文档请在飞书修改，并在资料库刷新索引。");
  if (source.status === "ARCHIVED") return apiError("SOURCE_ARCHIVED", 409, "请先恢复资料再编辑文字。");
  const version = source.transcript?.updatedAt || source.updatedAt;
  if (input.data.expectedUpdatedAt && version.toISOString() !== input.data.expectedUpdatedAt) return apiError("VERSION_CONFLICT", 409, "文字内容已更新，请刷新后重新编辑。");
  const transcript = await db.$transaction(async (tx) => {
    const updated = source.transcript
      ? await tx.transcript.update({ where: { sourceItemId: source.id, updatedAt: version }, data: { fullText: input.data.fullText, ...(source.transcript.fullText !== input.data.fullText ? { segments: [] } : {}) } })
      : await tx.sourceItem.update({ where: { id: source.id, updatedAt: version }, data: { rawText: input.data.fullText } });
    await tx.auditLog.create({ data: { workspaceId: context.workspace.id, userId: context.session.user.id, action: "transcript.updated", resourceType: "transcript", resourceId: updated.id, metadata: { sourceItemId: source.id } } });
    return updated;
  }).catch((error: unknown) => { if (error && typeof error === "object" && "code" in error && error.code === "P2025") return null; throw error; });
  if (!transcript) return apiError("VERSION_CONFLICT", 409, "文字内容已更新，请刷新后重新编辑。");
  return NextResponse.json({ id: transcript.id, updatedAt: transcript.updatedAt.toISOString() });
}
