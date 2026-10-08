import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@content-center/providers", async (original) => ({ ...await original<typeof import("@content-center/providers")>(), getStorageProvider: () => ({ getSignedUrl: vi.fn(async () => ({ data: { url: "https://storage.example.test/private" } })) }) }));
import { db } from "@content-center/db";
import { ModelRouter } from "../server/ai/control/model-router";
import { readUnderstandingAsset, understandSource, UNDERSTANDING_LEASE_MS } from "../server/material-detail/understanding";
import { getSourceWorkspaceModel } from "../server/material-detail/read-model";
import { listLibrarySources } from "../server/library";
import { renderPdfForUnderstanding } from "@content-center/providers";
import { materialPdf, tinyPng } from "./fixtures/material-files";

describe("Material source understanding", () => {
  const userId = `vision-${randomUUID()}`;
  const viewerId = `${userId}-viewer`;
  let workspaceId = "";
  let sourceItemId = "";
  let assetId = "";
  const stream = vi.fn();
  const route = vi.spyOn(ModelRouter.prototype, "route");
  const input = () => ({ workspaceId, userId, sourceItemId });
  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userId, name: "Owner", email: `${userId}@example.test` }, { id: viewerId, name: "Viewer", email: `${viewerId}@example.test` }] });
    workspaceId = (await db.workspace.create({ data: { name: "Vision gate", slug: userId, members: { create: [{ userId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } })).id;
  });
  beforeEach(async () => {
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "IMAGE", status: "READY", title: "Image", assets: { create: { workspaceId, assetType: "IMAGE", sourceProvider: "LOCAL_UPLOAD", status: "STORED", mimeType: "image/png", storageKey: "private/image", sizeBytes: 100n } } }, include: { assets: true } });
    sourceItemId = source.id; assetId = source.assets[0]!.id;
    stream.mockReset().mockResolvedValue({ data: { text: "可检索的视觉文字", finishReason: "stop" } });
    route.mockReset().mockResolvedValue({ runtime: { provider: { streamText: stream }, model: "fixture-vision" }, receipt: { selectedProvider: "FIXTURE", selectedModel: "fixture-vision" } } as unknown as Awaited<ReturnType<ModelRouter["route"]>>);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(tinyPng)));
  });
  afterAll(async () => { vi.unstubAllGlobals(); await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [userId, viewerId] } } }); await db.$disconnect(); });

  it("reading never invokes vision; explicit understanding persists separately and is searchable", async () => {
    const model = await getSourceWorkspaceModel({ ...input(), role: "OWNER" });
    expect(model?.workspace.understanding?.status).toBe("NOT_STARTED");
    expect(stream).not.toHaveBeenCalled();
    await understandSource(input());
    expect(stream).toHaveBeenCalledOnce();
    expect(stream.mock.calls[0]![0].content[1].source).toMatchObject({ type: "base64", mediaType: "image/jpeg" });
    expect(stream.mock.calls[0]![1]).toMatchObject({ onDelta: expect.any(Function) });
    const source = await db.sourceItem.findUniqueOrThrow({ where: { id: sourceItemId }, include: { transcript: true, sourceUnderstanding: true, materialAnalyses: true } });
    expect(source.rawText).toBeNull(); expect(source.transcript).toBeNull(); expect(source.materialAnalyses).toEqual([]);
    expect(source.sourceUnderstanding).toMatchObject({ status: "COMPLETED", text: "可检索的视觉文字", provider: "FIXTURE" });
    expect((await listLibrarySources(workspaceId, { search: "可检索的视觉文字" })).items.map((item) => item.id)).toContain(sourceItemId);
  });

  it("rejects viewer, non-member, wrong workspace and mismatched asset scope before model invocation", async () => {
    await expect(understandSource({ ...input(), userId: viewerId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(understandSource({ ...input(), userId: "outsider" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(understandSource({ ...input(), workspaceId: "another" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const foreign = await db.workspace.create({ data: { name: "Foreign", slug: `${userId}-${randomUUID()}` } });
    try {
      await db.sourceAsset.update({ where: { id: assetId }, data: { workspaceId: foreign.id } });
      await expect(understandSource(input())).rejects.toMatchObject({ code: "VISION_ASSET_UNAVAILABLE" });
    } finally { await db.workspace.delete({ where: { id: foreign.id } }); }
    expect(stream).not.toHaveBeenCalled();
  });

  it("prevents concurrent billable work and permits retry after failure without losing original or prior text", async () => {
    let release!: () => void;
    stream.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve({ data: { text: "第一次成功" } }); }));
    const first = understandSource(input());
    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
    await expect(understandSource(input())).rejects.toMatchObject({ code: "VISION_RUNNING" });
    release(); await first;
    stream.mockRejectedValueOnce(new Error("private provider failure"));
    await expect(understandSource(input())).rejects.toMatchObject({ code: "VISION_FAILED" });
    expect(await db.sourceUnderstanding.findUnique({ where: { sourceItemId } })).toMatchObject({ status: "FAILED", text: "第一次成功" });
    expect(await db.sourceItem.findUnique({ where: { id: sourceItemId } })).toMatchObject({ status: "READY" });
    await understandSource(input());
    expect(await db.sourceUnderstanding.findUnique({ where: { sourceItemId } })).toMatchObject({ status: "COMPLETED" });
  });

  it("reports absent vision explicitly and recovers interrupted runs", async () => {
    route.mockRejectedValueOnce(new Error("no vision"));
    await expect(understandSource(input())).rejects.toMatchObject({ code: "VISION_UNAVAILABLE" });
    expect(stream).not.toHaveBeenCalled();
    await db.sourceUnderstanding.create({ data: { workspaceId, sourceItemId, sourceType: "IMAGE", assetId, status: "RUNNING", updatedAt: new Date(Date.now() - UNDERSTANDING_LEASE_MS - 1000) } });
    expect((await getSourceWorkspaceModel({ ...input(), role: "OWNER" }))?.workspace.understanding).toMatchObject({ status: "FAILED" });
    await understandSource(input());
  });

  it("renders every PDF page within limits and preserves page provenance", async () => {
    await db.sourceItem.update({ where: { id: sourceItemId }, data: { sourceType: "DOCUMENT" } });
    await db.sourceAsset.update({ where: { id: assetId }, data: { assetType: "DOCUMENT", mimeType: "application/pdf" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(materialPdf(2))));
    await understandSource(input());
    expect(stream).toHaveBeenCalledTimes(2);
    expect(await db.sourceUnderstanding.findUnique({ where: { sourceItemId } })).toMatchObject({ text: expect.stringContaining("第 2 页"), pages: [{ page: 1, text: "可检索的视觉文字" }, { page: 2, text: "可检索的视觉文字" }] });
    stream.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(materialPdf(5))));
    await expect(understandSource(input())).rejects.toMatchObject({ code: "VISION_PAGE_LIMIT" });
    expect(stream).not.toHaveBeenCalled();
    expect(await db.sourceItem.findUnique({ where: { id: sourceItemId } })).toMatchObject({ status: "READY" });
  });

  it("bounds stored bytes and rendered resolution before making a model request", async () => {
    await expect(readUnderstandingAsset({ id: assetId, workspaceId, sourceItemId, storageKey: "private", sizeBytes: 26n * 1024n * 1024n })).rejects.toMatchObject({ code: "VISION_FILE_TOO_LARGE" });
    const pages = await renderPdfForUnderstanding(materialPdf());
    expect(pages).toHaveLength(1);
    expect(pages[0]!.data.byteLength).toBeGreaterThan(0);
    expect(stream).not.toHaveBeenCalled();
  });
});
