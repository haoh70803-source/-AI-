import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { db } from "@content-center/db";
import { readRenderMediaRelayConfig, verifyMediaRelayToken } from "@content-center/providers";

import { mediaFilePath } from "@/server/local-storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

function notFound() {
  return new Response(null, { status: 404 });
}

export async function GET(request: Request, { params }: RouteContext) {
  if (!["RENDER_MEDIA_RELAY", "LOCAL_FILESYSTEM"].includes(process.env.STORAGE_DRIVER?.trim() || "")) return notFound();
  let config;
  try {
    config = readRenderMediaRelayConfig();
  } catch {
    return notFound();
  }
  const { token } = await params;
  const requestedPurpose = new URL(request.url).searchParams.get("purpose") ?? "browser";
  if (requestedPurpose !== "browser" && requestedPurpose !== "doubao") return notFound();
  const payload = verifyMediaRelayToken(token, config.signingSecret, Date.now(), requestedPurpose);
  if (!payload) return notFound();
  const asset = await db.sourceAsset.findFirst({
    where: {
      id: payload.assetId,
      workspaceId: payload.workspaceId,
      sourceItemId: payload.sourceItemId,
      sourceItem: { id: payload.sourceItemId, workspaceId: payload.workspaceId },
      status: "STORED",
      storageKey: { not: null },
    },
  });
  if (!asset?.storageKey) return notFound();
  try {
    const filePath = await mediaFilePath(config.mediaStorageRoot, asset.storageKey, payload.workspaceId);
    const file = await stat(filePath);
    let start = 0, end = file.size - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "content-range": `bytes */${file.size}` } });
      if (!match[1]) start = Math.max(0, file.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), file.size - 1); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start < 0 || start >= file.size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${file.size}` } });
    }
    const stream = Readable.toWeb(createReadStream(filePath, { start, end }));
    const headers = new Headers({
      "content-type": asset.mimeType || "application/octet-stream",
      "content-length": String(end - start + 1),
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "x-content-center-purpose": payload.purpose,
    });
    if (payload.disposition === "attachment") {
      const extensions: Record<string,string> = { "video/mp4":"mp4", "video/quicktime":"mov", "image/png":"png", "image/webp":"webp", "image/jpeg":"jpg", "audio/mpeg":"mp3", "audio/wav":"wav", "text/plain":"txt", "text/markdown":"md", "application/pdf":"pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx" };
      const metadata = asset.metadata as { originalName?: unknown } | null;
      const filename = typeof metadata?.originalName === "string" ? metadata.originalName.replace(/[\r\n\\/]/g,"_").replaceAll(String.fromCharCode(0),"_").slice(0,240) : `source-asset.${extensions[asset.mimeType || ""] || "bin"}`;
      headers.set("content-disposition", `attachment; filename="source-asset"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    } else {
      headers.set("content-disposition", "inline");
    }
    if (range) headers.set("content-range", `bytes ${start}-${end}/${file.size}`);
    return new Response(stream as ReadableStream, { status: range ? 206 : 200, headers });
  } catch {
    return notFound();
  }
}
