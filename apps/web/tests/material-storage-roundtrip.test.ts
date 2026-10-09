import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/server/api-access", () => ({ getApiWorkspaceContext: mocks.context, apiError: (error: string, status: number, message?: string) => Response.json({ error, message }, { status }) }));
import { db } from "@content-center/db";
import { getStorageProvider } from "@content-center/providers";
import { POST } from "../app/api/source-items/upload/route";
import { getSourceWorkspaceModel } from "../server/material-detail/read-model";
const userId = "storage-roundtrip-" + randomUUID(); let workspaceId = "";
beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || process.env.S3_ENDPOINT !== "http://127.0.0.1:19020" || new URL(process.env.DATABASE_URL!).port !== "55438") throw Error("ISOLATED_REVIEW_REQUIRED");
  await db.user.create({ data: { id: userId, email: userId + "@example.test", name: "Storage fixture" } });
  workspaceId = (await db.workspace.create({ data: { name: "Storage fixture", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
  mocks.context.mockResolvedValue({ workspace: { id: workspaceId }, session: { user: { id: userId } }, role: "OWNER" });
});
afterAll(async () => {
  if (workspaceId) {
    const assets = await db.sourceAsset.findMany({ where: { workspaceId, storageKey: { not: null } } });
    for (const asset of assets) await getStorageProvider().delete(asset.storageKey!, { workspaceId, sourceItemId: asset.sourceItemId, assetId: asset.id });
    await db.workspace.delete({ where: { id: workspaceId } });
  }
  await db.user.delete({ where: { id: userId } }); await db.$disconnect();
});
it("stores real audio without ASR credentials, reads its signed preview and keeps the failure prompt usable", async () => {
  const audio = await readFile(resolve("services/local-asr/benchmark/audio/normal_zh.wav"));
  const form = new FormData(); form.append("files", new File([new Uint8Array(audio)], "测试录音.wav", { type: "audio/wav" }));
  const response = await POST(new Request("http://localhost/api/source-items/upload", { method: "POST", body: form }));
  expect(response.status).toBe(202); const result = (await response.json()).results[0]; expect(result.status).toBe("READY");
  const sourceId = result.sourceItemId;
  expect(await db.sourceItem.findUnique({ where: { id: sourceId } })).toMatchObject({ workspaceId, status: "READY", sourceType: "AUDIO" });
  const asset = await db.sourceAsset.findFirst({ where: { sourceItemId: sourceId } }); expect(asset).toMatchObject({ status: "STORED", mimeType: "audio/wav" });
  const model = await getSourceWorkspaceModel({ workspaceId, userId, sourceItemId: sourceId, role: "OWNER" });
  expect(model?.detail.preview.playable).toBe(true); expect(model?.workspace.configured).toBe(false);
  const url = model!.detail.preview.mediaUrl!; expect(new URL(url).port).toBe("19020");
  const fetched = await fetch(url, { signal: AbortSignal.timeout(5000) }); expect(fetched.ok).toBe(true); expect(Buffer.from(await fetched.arrayBuffer())).toEqual(audio);
  expect(await db.ingestJob.count({ where: { sourceItemId: sourceId } })).toBe(0);
  expect(await getSourceWorkspaceModel({ workspaceId: "foreign", userId, sourceItemId: sourceId, role: "OWNER" })).toBeNull();
}, 20000);
