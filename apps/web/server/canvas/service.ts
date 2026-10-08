import type { CanvasLayoutInput, CanvasMaterialReferenceDTO, CanvasObjectDTO } from "../../lib/contracts/canvas";
export type { CanvasLayoutInput, CanvasMaterialReferenceDTO, CanvasObjectDTO } from "../../lib/contracts/canvas";
import "server-only";

import { db, type CanvasObjectType, type Prisma } from "@content-center/db";

const MAX_TEXT_LENGTH = 500_000;
const MAX_COORDINATE = 1_000_000;
const MIN_WIDTH = 160;
const MAX_WIDTH = 1_200;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 1_600;







export class CanvasServiceError extends Error {
  constructor(readonly code: "PROJECT_NOT_FOUND" | "CANVAS_FORBIDDEN" | "CANVAS_OBJECT_NOT_FOUND" | "CANVAS_OBJECT_INVALID" | "CANVAS_CONTENT_CONFLICT" | "CANVAS_LAYOUT_CONFLICT" | "CANVAS_SOURCE_NOT_FOUND" | "CANVAS_SOURCE_INVALID", message: string) {
    super(message);
    this.name = "CanvasServiceError";
  }
}

const canvasObjectInclude = {
  materialReference: {
    include: {
      sourceItem: { select: { id: true, title: true, description: true, sourceType: true, sourcePlatform: true, status: true, thumbnailUrl: true, updatedAt: true } },
      sourceAsset: { select: { id: true, assetType: true, status: true, mimeType: true } },
    },
  },
  targetRelations: { where: { relationType: "GENERATED_FROM" }, include: { sourceObject: { select: { id: true, title: true, deletedAt: true } }, sourceSnapshot: { select: { id: true, title: true } } } },
} satisfies Prisma.CanvasObjectInclude;

type CanvasObjectRow = Prisma.CanvasObjectGetPayload<{ include: typeof canvasObjectInclude }>;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function materialReferenceDTO(reference: NonNullable<CanvasObjectRow["materialReference"]>): CanvasMaterialReferenceDTO {
  return {
    id: reference.id,
    purpose: reference.purpose,
    excerpt: reference.excerpt,
    sourceTitleSnapshot: reference.sourceTitleSnapshot,
    sourceTypeSnapshot: reference.sourceTypeSnapshot,
    sourceUpdatedAtAtAttach: reference.sourceUpdatedAtAtAttach?.toISOString() ?? null,
    sourceItem: { ...reference.sourceItem, updatedAt: reference.sourceItem.updatedAt.toISOString() },
    sourceAsset: reference.sourceAsset,
  };
}

function objectDTO(row: CanvasObjectRow): CanvasObjectDTO {
  return {
    id: row.id,
    objectType: row.objectType,
    title: row.title,
    textContent: row.textContent,
    positionX: row.positionX,
    positionY: row.positionY,
    width: row.width,
    height: row.height,
    zIndex: row.zIndex,
    contentVersion: row.contentVersion,
    layoutVersion: row.layoutVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    materialReference: row.materialReference ? materialReferenceDTO(row.materialReference) : null,
    generatedFrom: row.targetRelations.map((relation) => ({ sourceObjectId: relation.sourceObjectId, sourceTitle: relation.sourceObject.title || relation.sourceSnapshot.title || "未命名内容", sourceDeleted: Boolean(relation.sourceObject.deletedAt), sourceSnapshotId: relation.sourceSnapshotId })),
  };
}

function validNumber(value: number, maximum = MAX_COORDINATE) {
  return Number.isFinite(value) && Math.abs(value) <= maximum;
}

function layoutData(input: CanvasLayoutInput) {
  if (!validNumber(input.positionX) || !validNumber(input.positionY)
    || !validNumber(input.width, MAX_WIDTH) || input.width < MIN_WIDTH
    || !validNumber(input.height, MAX_HEIGHT) || input.height < MIN_HEIGHT
    || (input.zIndex !== undefined && (!Number.isInteger(input.zIndex) || Math.abs(input.zIndex) > 100_000))) {
    throw new CanvasServiceError("CANVAS_OBJECT_INVALID", "节点位置或尺寸无效。");
  }
  return { positionX: input.positionX, positionY: input.positionY, width: input.width, height: input.height, zIndex: input.zIndex ?? 0 };
}

async function projectForUser(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } },
    select: { id: true, workspaceId: true, workspace: { select: { members: { where: { userId: input.userId }, take: 1, select: { role: true } } } } },
  });
  const role = project?.workspace.members[0]?.role;
  if (!project || !role) throw new CanvasServiceError("PROJECT_NOT_FOUND", "项目不存在。");
  return { id: project.id, workspaceId: project.workspaceId, role };
}

async function editableProject(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await projectForUser(input);
  if (project.role === "VIEWER") throw new CanvasServiceError("CANVAS_FORBIDDEN", "当前权限只能查看画布。");
  return project;
}

async function objectState(input: { workspaceId: string; projectId: string; objectId: string }) {
  return db.canvasObject.findFirst({ where: { id: input.objectId, workspaceId: input.workspaceId, projectId: input.projectId }, include: canvasObjectInclude });
}

async function conflictOrMissing(input: { workspaceId: string; projectId: string; objectId: string; expectedVersion: number; kind: "content" | "layout"; requireDeleted?: boolean }): Promise<never> {
  const object = await objectState(input);
  if (!object || (input.requireDeleted ? !object.deletedAt : Boolean(object.deletedAt))) throw new CanvasServiceError("CANVAS_OBJECT_NOT_FOUND", "节点不存在或已经不可用。");
  const actual = input.kind === "content" ? object.contentVersion : object.layoutVersion;
  if (actual !== input.expectedVersion) throw new CanvasServiceError(input.kind === "content" ? "CANVAS_CONTENT_CONFLICT" : "CANVAS_LAYOUT_CONFLICT", "节点已经在其他位置更新，请刷新后重试。");
  throw new CanvasServiceError("CANVAS_OBJECT_INVALID", "节点无法完成这项操作。");
}

export async function listCanvasObjects(input: { workspaceId: string; userId: string; projectId: string }) {
  await projectForUser(input);
  const rows = await db.canvasObject.findMany({
    where: { workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null },
    include: canvasObjectInclude,
    orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(objectDTO);
}

export async function createCanvasTextObject(input: { workspaceId: string; userId: string; projectId: string; title?: string | null; textContent?: string; layout: CanvasLayoutInput }) {
  const project = await editableProject(input);
  const title = input.title?.trim() || null;
  const textContent = input.textContent ?? "";
  if ((title?.length ?? 0) > 200 || textContent.length > MAX_TEXT_LENGTH) throw new CanvasServiceError("CANVAS_OBJECT_INVALID", "文本内容过长。");
  const layout = layoutData(input.layout);
  const row = await db.$transaction(async (tx) => {
    const created = await tx.canvasObject.create({
      data: { workspaceId: project.workspaceId, projectId: project.id, objectType: "TEXT", title, textContent, ...layout, createdById: input.userId, updatedById: input.userId },
      include: canvasObjectInclude,
    });
    await tx.auditLog.create({ data: { workspaceId: project.workspaceId, userId: input.userId, action: "canvas_object.created", resourceType: "canvas_object", resourceId: created.id, metadata: json({ projectId: project.id, objectType: created.objectType }) } });
    return created;
  });
  return objectDTO(row);
}

export async function createCanvasMaterialObject(input: { workspaceId: string; userId: string; projectId: string; objectType: Extract<CanvasObjectType, "MATERIAL_REFERENCE" | "IMAGE_REFERENCE">; sourceItemId: string; sourceAssetId?: string | null; excerpt?: string | null; layout: CanvasLayoutInput }) {
  const project = await editableProject(input);
  const source = await db.sourceItem.findFirst({
    where: { id: input.sourceItemId, workspaceId: project.workspaceId, status: { not: "ARCHIVED" }, projects: { some: { projectId: project.id } } },
    select: { id: true, title: true, description: true, sourceType: true, updatedAt: true, assets: { where: input.sourceAssetId ? { id: input.sourceAssetId } : undefined, select: { id: true, sourceItemId: true, assetType: true } } },
  });
  if (!source) throw new CanvasServiceError("CANVAS_SOURCE_NOT_FOUND", "资料不存在或尚未加入当前项目。");
  const sourceAsset = input.sourceAssetId ? source.assets.find(({ id }) => id === input.sourceAssetId) : null;
  if (input.objectType === "IMAGE_REFERENCE" && (!sourceAsset || sourceAsset.assetType !== "IMAGE" || sourceAsset.sourceItemId !== source.id)) throw new CanvasServiceError("CANVAS_SOURCE_INVALID", "这条资料没有可用于画布的真实图片。");
  if (input.objectType === "MATERIAL_REFERENCE" && input.sourceAssetId) throw new CanvasServiceError("CANVAS_SOURCE_INVALID", "普通资料引用不能绑定图片资源。");
  const excerpt = input.excerpt?.trim() || null;
  if ((excerpt?.length ?? 0) > 5_000) throw new CanvasServiceError("CANVAS_OBJECT_INVALID", "资料摘录过长。");
  const layout = layoutData(input.layout);
  const sourceTitle = source.title?.trim() || source.description?.trim() || (input.objectType === "IMAGE_REFERENCE" ? "图片资料" : "未命名资料");
  const row = await db.$transaction(async (tx) => {
    const created = await tx.canvasObject.create({
      data: {
        workspaceId: project.workspaceId,
        projectId: project.id,
        objectType: input.objectType,
        title: sourceTitle,
        textContent: null,
        ...layout,
        createdById: input.userId,
        updatedById: input.userId,
        materialReference: { create: { workspaceId: project.workspaceId, projectId: project.id, sourceItemId: source.id, sourceAssetId: sourceAsset?.id ?? null, purpose: "PRIMARY", excerpt, sourceTitleSnapshot: sourceTitle, sourceTypeSnapshot: source.sourceType, sourceUpdatedAtAtAttach: source.updatedAt } },
      },
      include: canvasObjectInclude,
    });
    await tx.auditLog.create({ data: { workspaceId: project.workspaceId, userId: input.userId, action: "canvas_object.created", resourceType: "canvas_object", resourceId: created.id, metadata: json({ projectId: project.id, objectType: created.objectType, sourceItemId: source.id, ...(sourceAsset ? { sourceAssetId: sourceAsset.id } : {}) }) } });
    return created;
  });
  return objectDTO(row);
}

export async function updateCanvasText(input: { workspaceId: string; userId: string; projectId: string; objectId: string; expectedContentVersion: number; title?: string | null; textContent: string }) {
  await editableProject(input);
  const title = input.title?.trim() || null;
  if ((title?.length ?? 0) > 200 || input.textContent.length > MAX_TEXT_LENGTH) throw new CanvasServiceError("CANVAS_OBJECT_INVALID", "文本内容过长。");
  const updated = await db.canvasObject.updateMany({
    where: { id: input.objectId, workspaceId: input.workspaceId, projectId: input.projectId, objectType: "TEXT", deletedAt: null, contentVersion: input.expectedContentVersion },
    data: { title, textContent: input.textContent, updatedById: input.userId, contentVersion: { increment: 1 } },
  });
  if (updated.count !== 1) return conflictOrMissing({ ...input, expectedVersion: input.expectedContentVersion, kind: "content" });
  const row = await objectState(input);
  if (!row) throw new CanvasServiceError("CANVAS_OBJECT_NOT_FOUND", "节点不存在。");
  return objectDTO(row);
}

export async function updateCanvasLayout(input: { workspaceId: string; userId: string; projectId: string; objectId: string; expectedLayoutVersion: number; layout: CanvasLayoutInput }) {
  await editableProject(input);
  const layout = layoutData(input.layout);
  const updated = await db.canvasObject.updateMany({
    where: { id: input.objectId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null, layoutVersion: input.expectedLayoutVersion },
    data: { ...layout, updatedById: input.userId, layoutVersion: { increment: 1 } },
  });
  if (updated.count !== 1) return conflictOrMissing({ ...input, expectedVersion: input.expectedLayoutVersion, kind: "layout" });
  const row = await objectState(input);
  if (!row) throw new CanvasServiceError("CANVAS_OBJECT_NOT_FOUND", "节点不存在。");
  return objectDTO(row);
}

export async function softDeleteCanvasObject(input: { workspaceId: string; userId: string; projectId: string; objectId: string; expectedContentVersion: number }) {
  await editableProject(input);
  const now = new Date();
  const updated = await db.canvasObject.updateMany({
    where: { id: input.objectId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null, contentVersion: input.expectedContentVersion },
    data: { deletedAt: now, deletedById: input.userId, updatedById: input.userId, contentVersion: { increment: 1 } },
  });
  if (updated.count !== 1) return conflictOrMissing({ ...input, expectedVersion: input.expectedContentVersion, kind: "content" });
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "canvas_object.deleted", resourceType: "canvas_object", resourceId: input.objectId, metadata: json({ projectId: input.projectId }) } });
  const row = await objectState(input);
  if (!row) throw new CanvasServiceError("CANVAS_OBJECT_NOT_FOUND", "节点不存在。");
  return objectDTO(row);
}

export async function restoreCanvasObject(input: { workspaceId: string; userId: string; projectId: string; objectId: string; expectedContentVersion: number }) {
  await editableProject(input);
  const updated = await db.canvasObject.updateMany({
    where: { id: input.objectId, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: { not: null }, contentVersion: input.expectedContentVersion },
    data: { deletedAt: null, deletedById: null, updatedById: input.userId, contentVersion: { increment: 1 } },
  });
  if (updated.count !== 1) return conflictOrMissing({ ...input, expectedVersion: input.expectedContentVersion, kind: "content", requireDeleted: true });
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "canvas_object.restored", resourceType: "canvas_object", resourceId: input.objectId, metadata: json({ projectId: input.projectId }) } });
  const row = await objectState(input);
  if (!row) throw new CanvasServiceError("CANVAS_OBJECT_NOT_FOUND", "节点不存在。");
  return objectDTO(row);
}
