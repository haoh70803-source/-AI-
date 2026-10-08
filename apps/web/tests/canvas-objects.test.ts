import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db, hasSourceDeletionReferences } from "@content-center/db";
import { createCanvasMaterialObject, createCanvasTextObject, listCanvasObjects, restoreCanvasObject, softDeleteCanvasObject, updateCanvasLayout, updateCanvasText } from "../server/canvas/service";

describe("Phase 9C-1 canvas object service", () => {
  const suffix = randomUUID();
  const ownerId = `canvas-owner-${suffix}`;
  const editorId = `canvas-editor-${suffix}`;
  const viewerId = `canvas-viewer-${suffix}`;
  const foreignId = `canvas-foreign-${suffix}`;
  let workspaceId = "";
  let foreignWorkspaceId = "";
  let projectId = "";
  let otherProjectId = "";
  let foreignProjectId = "";
  let sourceId = "";
  let imageAssetId = "";
  let textObjectId = "";

  const layout = { positionX: 100, positionY: 120, width: 380, height: 220, zIndex: 1 };

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: ownerId, name: "Canvas Owner", email: `${ownerId}@example.test` },
      { id: editorId, name: "Canvas Editor", email: `${editorId}@example.test` },
      { id: viewerId, name: "Canvas Viewer", email: `${viewerId}@example.test` },
      { id: foreignId, name: "Canvas Foreign", email: `${foreignId}@example.test` },
    ] });
    const [workspace, foreignWorkspace] = await Promise.all([
      db.workspace.create({ data: { name: "Canvas Workspace", slug: `canvas-${suffix}`, members: { create: [
        { userId: ownerId, role: "OWNER" },
        { userId: editorId, role: "EDITOR" },
        { userId: viewerId, role: "VIEWER" },
      ] } } }),
      db.workspace.create({ data: { name: "Canvas Foreign", slug: `canvas-foreign-${suffix}`, members: { create: { userId: foreignId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id;
    foreignWorkspaceId = foreignWorkspace.id;
    const [project, otherProject, foreignProject] = await Promise.all([
      db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Canvas Project" } }),
      db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Other Canvas Project" } }),
      db.contentProject.create({ data: { workspaceId: foreignWorkspaceId, createdById: foreignId, title: "Foreign Canvas Project" } }),
    ]);
    projectId = project.id;
    otherProjectId = otherProject.id;
    foreignProjectId = foreignProject.id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "IMAGE", sourcePlatform: "GENERIC", status: "READY", title: "真实图片资料", rawText: "这段原始资料不能复制到 CanvasObject。" } });
    sourceId = source.id;
    imageAssetId = (await db.sourceAsset.create({ data: { workspaceId, sourceItemId: source.id, assetType: "IMAGE", sourceProvider: "TEST", status: "STORED", storageKey: `tests/${suffix}/image.png`, mimeType: "image/png" } })).id;
    await db.projectSource.create({ data: { projectId, sourceItemId: source.id, role: "REFERENCE" } });
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, editorId, viewerId, foreignId] } } });
    await db.$disconnect();
  });

  it("keeps Viewer read-only and allows Editor text creation", async () => {
    await expect(createCanvasTextObject({ workspaceId, userId: viewerId, projectId, textContent: "不可创建", layout })).rejects.toMatchObject({ code: "CANVAS_FORBIDDEN" });
    const object = await createCanvasTextObject({ workspaceId, userId: editorId, projectId, title: "自由文本", textContent: "第一版正文", layout });
    textObjectId = object.id;
    expect(object).toMatchObject({ objectType: "TEXT", textContent: "第一版正文", contentVersion: 1, layoutVersion: 1 });
    expect(await db.canvasObject.count({ where: { projectId } })).toBe(1);
  });

  it("rejects foreign workspace and project writes", async () => {
    await expect(createCanvasTextObject({ workspaceId, userId: editorId, projectId: foreignProjectId, textContent: "跨 Workspace", layout })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(updateCanvasText({ workspaceId, userId: editorId, projectId: otherProjectId, objectId: textObjectId, expectedContentVersion: 1, textContent: "跨项目" })).rejects.toMatchObject({ code: "CANVAS_OBJECT_NOT_FOUND" });
  });

  it("uses independent optimistic versions for content and layout", async () => {
    const content = await updateCanvasText({ workspaceId, userId: editorId, projectId, objectId: textObjectId, expectedContentVersion: 1, title: "更新标题", textContent: "第二版正文" });
    expect(content).toMatchObject({ contentVersion: 2, layoutVersion: 1, textContent: "第二版正文" });
    await expect(updateCanvasText({ workspaceId, userId: editorId, projectId, objectId: textObjectId, expectedContentVersion: 1, textContent: "过期正文" })).rejects.toMatchObject({ code: "CANVAS_CONTENT_CONFLICT" });
    const moved = await updateCanvasLayout({ workspaceId, userId: editorId, projectId, objectId: textObjectId, expectedLayoutVersion: 1, layout: { positionX: 480, positionY: 360, width: 420, height: 260, zIndex: 2 } });
    expect(moved).toMatchObject({ contentVersion: 2, layoutVersion: 2, positionX: 480, width: 420 });
    await expect(updateCanvasLayout({ workspaceId, userId: editorId, projectId, objectId: textObjectId, expectedLayoutVersion: 1, layout })).rejects.toMatchObject({ code: "CANVAS_LAYOUT_CONFLICT" });
  });

  it("soft deletes, excludes from active loading, and restores in place", async () => {
    const deleted = await softDeleteCanvasObject({ workspaceId, userId: editorId, projectId, objectId: textObjectId, expectedContentVersion: 2 });
    expect(deleted.deletedAt).toBeTruthy();
    expect(await listCanvasObjects({ workspaceId, userId: viewerId, projectId })).toHaveLength(0);
    const restored = await restoreCanvasObject({ workspaceId, userId: editorId, projectId, objectId: textObjectId, expectedContentVersion: deleted.contentVersion });
    expect(restored).toMatchObject({ deletedAt: null, positionX: 480, positionY: 360, width: 420, height: 260 });
  });

  it("creates real material and image references without copying source text", async () => {
    const material = await createCanvasMaterialObject({ workspaceId, userId: editorId, projectId, objectType: "MATERIAL_REFERENCE", sourceItemId: sourceId, layout: { ...layout, positionX: 900 } });
    expect(material).toMatchObject({ objectType: "MATERIAL_REFERENCE", textContent: null, materialReference: { sourceItem: { id: sourceId }, sourceAsset: null } });
    expect(material.textContent).toBeNull();
    const image = await createCanvasMaterialObject({ workspaceId, userId: editorId, projectId, objectType: "IMAGE_REFERENCE", sourceItemId: sourceId, sourceAssetId: imageAssetId, layout: { ...layout, positionX: 1_320, height: 260 } });
    expect(image).toMatchObject({ objectType: "IMAGE_REFERENCE", materialReference: { sourceItem: { id: sourceId }, sourceAsset: { id: imageAssetId, assetType: "IMAGE" } } });
    await expect(hasSourceDeletionReferences(db, sourceId)).resolves.toBe(true);
    expect(await db.canvasRelation.count({ where: { projectId } })).toBe(0);
  });

  it("loads active material references and never turns system cards into CanvasObjects", async () => {
    const objects = await listCanvasObjects({ workspaceId, userId: viewerId, projectId });
    expect(objects.map(({ objectType }) => objectType)).toEqual(expect.arrayContaining(["TEXT", "MATERIAL_REFERENCE", "IMAGE_REFERENCE"]));
    expect(objects.some(({ id }) => ["brief", "sources", "facts", "methods", "suggestion", "draft"].includes(id))).toBe(false);
    expect(objects.find(({ objectType }) => objectType === "MATERIAL_REFERENCE")?.materialReference?.sourceItem.id).toBe(sourceId);
  });
});
