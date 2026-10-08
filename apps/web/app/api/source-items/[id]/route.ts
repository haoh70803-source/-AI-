import {ensureFeishuSource,FeishuError} from "@content-center/integrations";
import { db, findSourceForUser, hasSourceDeletionReferences } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { getStorageProvider, readSourceMetadataEnvelope } from "@content-center/providers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try{await ensureFeishuSource({workspaceId:context.workspace.id,userId:context.session.user.id},id);}catch(e){if(e instanceof FeishuError)return apiError("FEISHU_SOURCE_UNAVAILABLE",e.status,e.message);return apiError("FEISHU_SOURCE_UNAVAILABLE",503);}
  const source = await findSourceForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, sourceItemId: id });
  if (!source) return apiError("NOT_FOUND", 404);
  return NextResponse.json({
    ...source,
    metadata: readSourceMetadataEnvelope(source.metadata),
    assets: source.assets.map(({ remoteUrl: _remoteUrl, storageKey: _storageKey, sizeBytes, ...asset }) => ({
      ...asset,
      sizeBytes: sizeBytes?.toString() ?? null,
    })),
  });
}

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  const source = await findSourceForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, sourceItemId: id });
  if (!source) return apiError("NOT_FOUND", 404);
  if(source.sourceProvider==="FEISHU")return apiError("FEISHU_MANAGED",409,"请在飞书资料页停止或恢复订阅，正文在飞书编辑。");
  const text = await request.text();
  let input: unknown;
  try { input = text ? JSON.parse(text) : {}; } catch { return apiError("INVALID_INPUT", 400); }
  const parsed = z.object({ action: z.enum(["ARCHIVE", "RESTORE", "UPDATE"]).default("ARCHIVE"), title: z.string().trim().min(1).max(300).optional(), author: z.string().trim().max(200).optional() }).safeParse(input);
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  if (parsed.data.action === "UPDATE") {
    if (parsed.data.title === undefined && parsed.data.author === undefined) return apiError("INVALID_INPUT", 400);
    const { title, author } = parsed.data;
    await db.$transaction([
      db.sourceItem.update({ where: { id: source.id }, data: { ...(title !== undefined ? { title } : {}), ...(author !== undefined ? { author: author || null } : {}) } }),
      db.auditLog.create({ data: { workspaceId: context.workspace.id, userId: context.session.user.id, action: "source.updated", resourceType: "source_item", resourceId: source.id } }),
    ]);
    return NextResponse.json({ id: source.id });
  }
  if (parsed.data.action === "RESTORE") {
    if (source.status !== "ARCHIVED") return NextResponse.json({ status: source.status });
    const restored = await db.$transaction(async (tx) => {
      const archive = await tx.auditLog.findFirst({ where: { workspaceId: context.workspace.id, resourceId: source.id, action: "source.archived" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true } });
      const previous = (archive?.metadata as { from?: string } | null)?.from;
      // Cancelled processing is not resurrected; the user must explicitly retry it.
      const status = previous === "READY" ? "READY" : previous === "FAILED" || previous === "PROCESSING" || previous === "PENDING" ? "FAILED" : source.transcript || source.rawText?.trim() ? "READY" : "FAILED";
      const changed = await tx.sourceItem.updateMany({ where: { id: source.id, workspaceId: context.workspace.id, status: "ARCHIVED" }, data: { status } });
      if (!changed.count) return null;
      await tx.auditLog.create({ data: { workspaceId: context.workspace.id, userId: context.session.user.id, action: "source.restored", resourceType: "source_item", resourceId: source.id, metadata: { from: "ARCHIVED", to: status } } });
      return { status };
    });
    return restored ? NextResponse.json(restored) : apiError("SOURCE_CONFLICT", 409, "资料状态已变化，请刷新后重试。");
  }
  if (source.status === "ARCHIVED") return NextResponse.json({ status: "ARCHIVED" });
  const archived = await db.$transaction(async (tx) => {
    const changed = await tx.sourceItem.updateMany({ where: { id: source.id, workspaceId: context.workspace.id, status: source.status }, data: { status: "ARCHIVED" } });
    if (!changed.count) return false;
    await tx.ingestJob.updateMany({
      where: { sourceItemId: source.id, workspaceId: context.workspace.id, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    await tx.auditLog.create({ data: { workspaceId: context.workspace.id, userId: context.session.user.id, action: "source.archived", resourceType: "source_item", resourceId: source.id, metadata: { from: source.status } } });
    return true;
  });
  return archived ? NextResponse.json({ status: "ARCHIVED" }) : apiError("SOURCE_CONFLICT", 409, "资料状态已变化，请刷新后重试。");
}

export async function DELETE(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  const source = await findSourceForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, sourceItemId: id });
  if (!source) return apiError("NOT_FOUND", 404);
  if (await hasSourceDeletionReferences(db, source.id)) return apiError("SOURCE_IN_USE", 409, "这条素材已经被项目、研究结果、方法或画布引用，暂时不能永久删除。你可以先归档。");
  const storedAssets = source.assets.filter((asset) => asset.storageKey);
  const storage = storedAssets.length > 0 ? getStorageProvider() : null;
  for (const asset of storedAssets) {
    if (!asset.storageKey) continue;
    try {
      await storage!.delete(asset.storageKey!, {
        workspaceId: context.workspace.id,
        sourceItemId: source.id,
        assetId: asset.id,
      });
    } catch {
      await db.auditLog.create({
        data: {
          workspaceId: context.workspace.id,
          userId: context.session.user.id,
          action: "source_asset.delete_failed",
          resourceType: "source_asset",
          resourceId: asset.id,
          metadata: { sourceItemId: source.id },
        },
      });
      return apiError("STORAGE_DELETE_FAILED", 502, "媒体对象删除失败，素材记录未删除，请重试。");
    }
  }
  await db.$transaction(async (tx) => {
    for (const asset of source.assets) {
      await tx.auditLog.create({
        data: {
          workspaceId: context.workspace.id,
          userId: context.session.user.id,
          action: "source_asset.deleted",
          resourceType: "source_asset",
          resourceId: asset.id,
          metadata: { sourceItemId: source.id, assetType: asset.assetType },
        },
      });
    }
    await tx.auditLog.create({ data: { workspaceId: context.workspace.id, userId: context.session.user.id, action: "source.deleted", resourceType: "source_item", resourceId: source.id } });
    await tx.sourceItem.delete({ where: { id: source.id } });
  });
  return new NextResponse(null, { status: 204 });
}
