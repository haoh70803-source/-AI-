import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { ContextBuilderV2 } from "../server/ai/control/context-builder-v2";
import { getMaterialReadableContent } from "../server/material-detail/readable-content";

describe("Material readable content boundary", () => {
  const ownerId = `material-reader-${randomUUID()}`;
  const outsiderId = `${ownerId}-outsider`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let imageId = "";
  let pdfId = "";
  let videoId = "";
  let manualVideoId = "";
  let manualAudioId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: ownerId, name: "Material reader", email: `${ownerId}@example.test` },
      { id: outsiderId, name: "Outsider", email: `${outsiderId}@example.test` },
    ] });
    workspaceId = (await db.workspace.create({ data: { name: "Readable material", slug: ownerId, members: { create: { userId: ownerId, role: "OWNER" } } } })).id;
    otherWorkspaceId = (await db.workspace.create({ data: { name: "Other", slug: outsiderId, members: { create: { userId: outsiderId, role: "OWNER" } } } })).id;
    const image = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "IMAGE", title: "Image", status: "READY" } });
    imageId = image.id;
    await db.sourceUnderstanding.create({ data: {
      workspaceId, sourceItemId: imageId, assetId: "image-asset", sourceType: "IMAGE", status: "COMPLETED",
      text: "图片中的文字", pages: [{ page: 1, text: "图片中的文字" }], provider: "DEEPSEEK", model: "deepseek-flash",
    } });
    const pdf = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "DOCUMENT", title: "PDF", rawText: "原生 PDF 正文", status: "READY" } });
    pdfId = pdf.id;
    await db.sourceUnderstanding.create({ data: {
      workspaceId, sourceItemId: pdfId, assetId: "pdf-asset", sourceType: "DOCUMENT", status: "COMPLETED", text: "识别后的正文",
    } });
    const video = await db.sourceItem.create({ data: {
      workspaceId, createdById: ownerId, sourceType: "VIDEO", title: "Video", status: "READY",
      transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "人工转录正文", segments: [] } },
    } });
    videoId = video.id;
    manualVideoId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", title: "Manual video", rawText: "人工补充视频文字", status: "READY" } })).id;
    manualAudioId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "AUDIO", title: "Manual audio", rawText: "人工补充音频文字", status: "READY" } })).id;
  });
  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (otherWorkspaceId) await db.workspace.delete({ where: { id: otherWorkspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, outsiderId] } } });
    await db.$disconnect();
  });
  const read = (sourceItemId: string) => getMaterialReadableContent({ workspaceId, userId: ownerId, sourceItemId });

  it("returns visual text with page and provider provenance, including the last good result after a failed retry", async () => {
    expect(await read(imageId)).toMatchObject({
      contentText: "图片中的文字", contentSource: "SOURCE_UNDERSTANDING", assetId: "image-asset",
      pageNumbers: [1], provider: "DEEPSEEK", model: "deepseek-flash", understandingStatus: "COMPLETED",
    });
    await db.sourceUnderstanding.update({ where: { sourceItemId: imageId }, data: { status: "FAILED", errorCode: "VISION_FAILED" } });
    expect(await read(imageId)).toMatchObject({ contentText: "图片中的文字", understandingStatus: "FAILED" });
  });

  it("prefers native PDF text and media transcripts over a visual result", async () => {
    expect(await read(pdfId)).toMatchObject({ contentText: "原生 PDF 正文", contentSource: "EXTRACTED_TEXT" });
    expect(await read(videoId)).toMatchObject({ contentText: "人工转录正文", contentSource: "TRANSCRIPT" });
    await db.sourceItem.update({ where: { id: pdfId }, data: { rawText: null } });
    expect(await read(pdfId)).toMatchObject({ contentText: "识别后的正文", contentSource: "SOURCE_UNDERSTANDING" });
  });

  it("exposes manually saved media text and prefers Transcript when both exist", async () => {
    expect(await read(manualVideoId)).toMatchObject({ contentText: "人工补充视频文字", contentSource: "EXTRACTED_TEXT", transcriptId: null });
    expect(await read(manualAudioId)).toMatchObject({ contentText: "人工补充音频文字", contentSource: "EXTRACTED_TEXT", transcriptId: null });
    await db.sourceItem.update({ where: { id: videoId }, data: { rawText: "旧的人工文字" } });
    expect(await read(videoId)).toMatchObject({ contentText: "人工转录正文", contentSource: "TRANSCRIPT" });
  });

  it("enforces workspace membership and source scope before returning content", async () => {
    expect(await getMaterialReadableContent({ workspaceId, userId: outsiderId, sourceItemId: imageId })).toBeNull();
    expect(await getMaterialReadableContent({ workspaceId: otherWorkspaceId, userId: outsiderId, sourceItemId: imageId })).toBeNull();
    expect(await read("unknown-source")).toBeNull();
  });
  it("supplies an explicitly selected video's transcript to the existing Agent context", async () => {
    const project = await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Transcript reading", sources: { create: { sourceItemId: videoId, role: "REFERENCE" } } } });
    const context = await new ContextBuilderV2().build({ workspaceId, userId: ownerId, projectId: project.id, taskType: "GENERAL_QUERY", action: "PROJECT_ASSISTANT", selectedObjects: [{ objectType: "SOURCE_ITEM", objectId: videoId, ownership: "EXTERNAL", whySelected: "用户引用视频" }] });
    expect(JSON.stringify(context?.manifest.items)).toContain("人工转录正文");
    expect(JSON.stringify(context?.manifest.items)).toContain("TRANSCRIPT");
  });
});
