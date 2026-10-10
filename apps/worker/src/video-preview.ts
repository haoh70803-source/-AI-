import { createReadStream } from "node:fs";
import { db, type Prisma } from "@content-center/db";
import { buildSourceAssetObjectKey, FFmpegMediaProcessor, getStorageProvider } from "@content-center/providers";

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const tasks = new Map<string, Promise<string>>();
/** Material capability: returns a scoped, validated browser video; preserves the original asset. */
export function ensureVideoPreview(input: { workspaceId: string; sourceItemId: string; assetId: string }) {
  const key = JSON.stringify([input.workspaceId, input.sourceItemId, input.assetId]);
  const current = tasks.get(key);
  if (current) return current;
  const task = prepare(input).finally(() => tasks.delete(key));
  tasks.set(key, task);
  return task;
}
async function prepare(input: { workspaceId: string; sourceItemId: string; assetId: string }) {
  const where = { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, assetType: "VIDEO" as const, status: "STORED" as const, storageKey: { not: null }, sourceItem: { workspaceId: input.workspaceId, status: { not: "ARCHIVED" as const } } };
  const original = await db.sourceAsset.findFirst({ where: { ...where, id: input.assetId } });
  if (!original?.storageKey) throw new Error("VIDEO_NOT_AVAILABLE");
  const metadata = original.metadata && typeof original.metadata === "object" && !Array.isArray(original.metadata) ? original.metadata as Record<string, unknown> : {};
  if (metadata.browserVideoValidated === 1) return original.id;
  const derived = { purpose: "BROWSER_VIDEO_PREVIEW", derivedFromAssetId: original.id };
  const ready = await db.sourceAsset.findFirst({ where: { ...where, metadata: { path: ["derivedFromAssetId"], equals: original.id }, sourceProvider: "FFMPEG_VIDEO_PREVIEW" }, orderBy: { createdAt: "desc" } });
  if (ready) return ready.id;
  const storage = getStorageProvider(), processor = new FFmpegMediaProcessor();
  const url = (await storage.getSignedUrl(original.storageKey, 7200, { assetScope: input })).data.url;
  const probe = await processor.probeVideo(url);
  if (probe.browserCompatible) {
    await db.sourceAsset.updateMany({ where: { ...where, id: original.id }, data: { metadata: json({ ...metadata, browserVideoValidated: 1, videoProbe: probe }) } });
    return original.id;
  }
  // Reserve under a short lock, then release the DB connection before encoding.
  const pending = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "SourceAsset" WHERE id = ${original.id} AND "workspaceId" = ${input.workspaceId} FOR UPDATE`;
    const existing = await tx.sourceAsset.findFirst({ where: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, sourceProvider: "FFMPEG_VIDEO_PREVIEW", metadata: { path: ["derivedFromAssetId"], equals: original.id }, status: { in: ["STORED", "DOWNLOADING"] }, createdAt: { gte: new Date(Date.now() - 70 * 60_000) } }, orderBy: { createdAt: "desc" } });
    if (existing) return existing;
    return tx.sourceAsset.create({ data: { workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, assetType: "VIDEO", sourceProvider: "FFMPEG_VIDEO_PREVIEW", status: "DOWNLOADING", metadata: json(derived) } });
  });
  if (pending.status === "STORED") return pending.id;
  // A second process cannot take over an existing live reservation.
  const claimed = await db.sourceAsset.updateMany({ where: { id: pending.id, workspaceId: input.workspaceId, status: "DOWNLOADING", metadata: { equals: json(derived) } }, data: { metadata: json({ ...derived, encoding: true }) } });
  if (!claimed.count) throw new Error("VIDEO_PREVIEW_PROCESSING");
  let output: Awaited<ReturnType<typeof processor.createVideoPreview>> | undefined;
  const storageKey = buildSourceAssetObjectKey({ ...input, assetId: pending.id, assetType: "VIDEO", mimeType: "video/mp4" });
  try {
    output = await processor.createVideoPreview(url, probe.durationMs);
    await storage.upload({ key: storageKey, body: createReadStream(output.path), contentType: "video/mp4", contentLength: output.sizeBytes, assetScope: { ...input, assetId: pending.id } });
    await db.sourceAsset.updateMany({ where: { id: pending.id, workspaceId: input.workspaceId, sourceItemId: input.sourceItemId, status: "DOWNLOADING" }, data: { status: "STORED", storageKey, sizeBytes: BigInt(output.sizeBytes), mimeType: "video/mp4", storedAt: new Date(), metadata: json({ ...derived, browserVideoValidated: 1, videoProbe: output.probe, originalCodec: probe.codec }) } });
    return pending.id;
  } catch (error) {
    await db.sourceAsset.updateMany({ where: { id: pending.id, workspaceId: input.workspaceId, sourceItemId: input.sourceItemId }, data: { status: "FAILED" } });
    await storage.delete(storageKey, { ...input, assetId: pending.id }).catch(() => undefined);
    throw error;
  } finally { await output?.cleanup(); }
}
