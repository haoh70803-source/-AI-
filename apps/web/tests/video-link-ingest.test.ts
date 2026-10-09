import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ plan: vi.fn(), context: vi.fn(), download: vi.fn(), resolve: vi.fn(), enqueue: vi.fn() }));
vi.mock("@content-center/worker/transcription", () => ({ resolveWorkspaceTranscriptionPlan: mocks.plan }));
vi.mock("@content-center/worker/queue-producer", () => ({ enqueueContentIngest: mocks.enqueue }));
vi.mock("@/server/api-access", () => ({ getApiWorkspaceContext: mocks.context, apiError: (error: string, status: number, message?: string) => Response.json({ error, message }, { status }) }));
vi.mock("@content-center/providers", async original => ({ ...await original<typeof import("@content-center/providers")>(), resolvePublicAddress: mocks.resolve, getStorageProvider: () => ({}), MediaFetcher: class { downloadToStorage = mocks.download; } }));
import { db } from "@content-center/db";
import { DoubaoError, RedFoxError } from "@content-center/providers";
import { createSourceAndJob } from "../server/source-service";
import { POST } from "../app/api/source-items/route";
import { processContentIngestJob } from "../../worker/src/ingest";
import type { ContentIngestPayload } from "../../worker/src/queue";
const userId = "video-link-test-" + randomUUID(); let workspaceId = "";
beforeAll(async () => {
  await db.user.create({ data: { id: userId, email: userId + "@example.test", name: "Link fixture" } });
  workspaceId = (await db.workspace.create({ data: { name: "Link fixture", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
});
afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });
beforeEach(() => { vi.resetAllMocks(); mocks.plan.mockResolvedValue({ provider: "DOUBAO_ASR" }); mocks.context.mockResolvedValue({ workspace: { id: workspaceId }, session: { user: { id: userId } }, role: "OWNER" }); mocks.download.mockResolvedValue({ storageKey: "fixture/video.mp4", mimeType: "video/mp4", sizeBytes: 16 }); });
function request(url: string) { return new Request("http://localhost/api/source-items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "MEDIA_URL", url, autoTranscribe: true }) }); }
function job(created: Awaited<ReturnType<typeof createSourceAndJob>>, workspace = workspaceId) { return { data: { jobId: created.ingestJob.id, sourceItemId: created.sourceItem.id, workspaceId: workspace, requestedById: userId }, attemptsMade: 0, opts: { attempts: 1 } } as Job<ContentIngestPayload>; }
it("rejects unauthenticated/viewer and private media URLs before creation", async () => {
  mocks.context.mockResolvedValue(null); expect((await POST(request("https://media.example/video.mp4"))).status).toBe(401);
  mocks.context.mockResolvedValue({ role: "VIEWER" }); expect((await POST(request("https://media.example/video.mp4"))).status).toBe(403);
  mocks.context.mockResolvedValue({ workspace: { id: workspaceId }, session: { user: { id: userId } }, role: "OWNER" }); mocks.resolve.mockRejectedValue(new Error("PRIVATE_ADDRESS"));
  expect((await POST(request("http://127.0.0.1/video.mp4"))).status).toBe(400); expect(mocks.enqueue).not.toHaveBeenCalled();
});
it("missing transcription credentials cannot create an endless pending source", async () => {
  mocks.plan.mockRejectedValue(new DoubaoError("DOUBAO_NOT_CONFIGURED", "请配置 API Key", false));
  const before = await db.sourceItem.count({ where: { workspaceId } });
  const response = await POST(request("https://media.example/" + randomUUID() + ".mp4")); expect(response.status).toBe(409);
  expect(await db.sourceItem.count({ where: { workspaceId } })).toBe(before); expect(mocks.enqueue).not.toHaveBeenCalled();
});
it("persists a scoped original video and retains automatic transcription intent", async () => {
  const created = await createSourceAndJob({ workspaceId, userId, source: { kind: "MEDIA_URL", url: "https://media.example/" + randomUUID() + ".mp4" }, autoTranscribe: true }, { enqueue: mocks.enqueue });
  expect(created.ingestJob).toMatchObject({ provider: "DIRECT_MEDIA", jobType: "PROCESS_MEDIA", metadata: expect.objectContaining({ autoTranscribe: true }) });
  await processContentIngestJob(job(created));
  expect(await db.sourceItem.findUnique({ where: { id: created.sourceItem.id } })).toMatchObject({ sourceType: "VIDEO", status: "READY" });
  expect(await db.sourceAsset.findFirst({ where: { sourceItemId: created.sourceItem.id } })).toMatchObject({ workspaceId, status: "STORED", mimeType: "video/mp4", sourceProvider: "DIRECT_MEDIA" });
  expect(mocks.download.mock.calls[0]![0].assetScope).toMatchObject({ workspaceId, sourceItemId: created.sourceItem.id });
  expect((await db.ingestJob.findUnique({ where: { id: created.ingestJob.id } }))!.metadata).toMatchObject({ autoTranscribe: true });
  expect(mocks.plan).toHaveBeenCalledWith(workspaceId);
});
it("does not download a foreign workspace job and settles download timeout", async () => {
  const created = await createSourceAndJob({ workspaceId, userId, source: { kind: "MEDIA_URL", url: "https://media.example/" + randomUUID() + ".mp4" } }, { enqueue: mocks.enqueue });
  await expect(processContentIngestJob(job(created, "foreign"))).rejects.toThrow("scope mismatch"); expect(mocks.download).not.toHaveBeenCalled();
  mocks.download.mockRejectedValue(new RedFoxError("REDFOX_MEDIA_DOWNLOAD_FAILED", "下载超时", false));
  await expect(processContentIngestJob(job(created))).rejects.toThrow("超时");
  expect(await db.sourceItem.findUnique({ where: { id: created.sourceItem.id } })).toMatchObject({ status: "FAILED" });
  expect(await db.sourceAsset.findFirst({ where: { sourceItemId: created.sourceItem.id } })).toMatchObject({ status: "FAILED" });
});
