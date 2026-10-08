import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { dirname, join, toNamespacedPath } from "node:path";
import { Readable, Transform } from "node:stream";
import { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { db } from "@content-center/db";
import {
  buildSourceAssetObjectKey,
  hasValidMediaRelayInternalAuthorization,
  readRenderMediaRelayConfig,
} from "@content-center/providers";
import { mediaFilePath, withLocalStorageLock, LocalStorageError } from "@/server/local-storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ assetId: string }> };

function errorResponse(status: number, error = "NOT_FOUND") {
  return NextResponse.json({ error }, { status });
}

function configuredRelay(request: Request) {
  if (!["RENDER_MEDIA_RELAY", "LOCAL_FILESYSTEM"].includes(process.env.STORAGE_DRIVER?.trim() || "")) return null;
  try {
    const config = readRenderMediaRelayConfig();
    return hasValidMediaRelayInternalAuthorization(request, config.internalSecret) ? config : null;
  } catch {
    return null;
  }
}

function requestScope(request: Request, assetId: string) {
  const workspaceId = request.headers.get("x-workspace-id")?.trim();
  const sourceItemId = request.headers.get("x-source-item-id")?.trim();
  const requestedAssetId = request.headers.get("x-asset-id")?.trim();
  if (!workspaceId || !sourceItemId || requestedAssetId !== assetId) return null;
  return { workspaceId, sourceItemId, assetId };
}

async function findScopedAsset(assetId: string, scope: { workspaceId: string; sourceItemId: string }) {
  return db.sourceAsset.findFirst({
    where: {
      id: assetId,
      workspaceId: scope.workspaceId,
      sourceItemId: scope.sourceItemId,
      sourceItem: { id: scope.sourceItemId, workspaceId: scope.workspaceId },
    },
  });
}

function contentTypeFor(assetType: "VIDEO" | "IMAGE" | "AUDIO" | "DOCUMENT") {
  return assetType === "VIDEO" ? "video/mp4" : assetType === "IMAGE" ? "image/jpeg" : assetType === "AUDIO" ? "audio/mpeg" : "application/octet-stream";
}

async function streamUpload(request: Request, target: string) {
  if (!request.body) throw new Error("EMPTY_BODY");
  target = toNamespacedPath(target);
  const temporaryDirectory = await mkdtemp(join(dirname(target), ".relay-upload-"));
  const temporaryPath = join(temporaryDirectory, "asset.tmp");
  let sizeBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.length;
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(request.body as unknown as NodeReadableStream), counter, createWriteStream(temporaryPath, { flags: "wx" }));
    if (sizeBytes < 1) throw new Error("EMPTY_BODY");
    await rename(temporaryPath, target);
    return { sizeBytes, temporaryDirectory };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function performPUT(request: Request, { params }: RouteContext) {
  const config = configuredRelay(request);
  if (!config) return errorResponse(404);
  const { assetId } = await params;
  const scope = requestScope(request, assetId);
  if (!scope) return errorResponse(404);
  const asset = await findScopedAsset(assetId, scope);
  if (!asset) return errorResponse(404);
  const mimeType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || asset.mimeType || contentTypeFor(asset.assetType);
  const storageKey = buildSourceAssetObjectKey({
    workspaceId: scope.workspaceId,
    sourceItemId: scope.sourceItemId,
    assetId: asset.id,
    assetType: asset.assetType,
    mimeType,
  });
  let target: string;
  try {
    target = await mediaFilePath(config.mediaStorageRoot, storageKey, scope.workspaceId, true);
    await mkdir(dirname(target), { recursive: true });
  } catch {
    return errorResponse(400, "INVALID_STORAGE_PATH");
  }
  let uploaded: { sizeBytes: number; temporaryDirectory: string } | undefined;
  try {
    uploaded = await streamUpload(request, target);
    await db.sourceAsset.update({
      where: { id: asset.id },
      data: {
        status: "STORED",
        storageKey,
        mimeType,
        sizeBytes: BigInt(uploaded.sizeBytes),
        storedAt: new Date(),
      },
    });
    return NextResponse.json({ key: storageKey, sizeBytes: uploaded.sizeBytes, mimeType });
  } catch (error) {
    return errorResponse(error instanceof Error && error.message === "EMPTY_BODY" ? 400 : 500, error instanceof Error && error.message === "EMPTY_BODY" ? "EMPTY_BODY" : "MEDIA_RELAY_UPLOAD_FAILED");
  } finally {
    if (uploaded?.temporaryDirectory) await rm(uploaded.temporaryDirectory, { recursive: true, force: true });
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const config = configuredRelay(request);
  if (!config) return errorResponse(404);
  const { assetId } = await params;
  const scope = requestScope(request, assetId);
  if (!scope) return errorResponse(404);
  const asset = await findScopedAsset(assetId, scope);
  if (!asset || asset.status !== "STORED" || !asset.storageKey) return errorResponse(404);
  let filePath: string;
  try {
    filePath = await mediaFilePath(config.mediaStorageRoot, asset.storageKey, scope.workspaceId);
    const file = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath));
    return new Response(stream as ReadableStream, {
      status: 200,
      headers: {
        "content-type": asset.mimeType || "application/octet-stream",
        "content-length": String(file.size),
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return errorResponse(404);
  }
}

async function performDELETE(request: Request, { params }: RouteContext) {
  const config = configuredRelay(request);
  if (!config) return errorResponse(404);
  const { assetId } = await params;
  const scope = requestScope(request, assetId);
  if (!scope) return errorResponse(404);
  const asset = await findScopedAsset(assetId, scope);
  if (!asset) return errorResponse(404);
  try {
    if (asset.storageKey) await rm(await mediaFilePath(config.mediaStorageRoot, asset.storageKey, scope.workspaceId), { force: true });
    await db.sourceAsset.update({ where: { id: asset.id }, data: { status: "FAILED", storageKey: null, sizeBytes: null, storedAt: null } });
    return NextResponse.json({ deleted: true });
  } catch {
    return errorResponse(500, "MEDIA_RELAY_DELETE_FAILED");
  }
}

async function mutateLocked(request: Request, route: RouteContext, action: (request: Request, route: RouteContext) => Promise<Response>) {
  if (!configuredRelay(request)) return errorResponse(404);
  const {assetId}=await route.params;
  const scope=requestScope(request,assetId);
  if (!scope || !await findScopedAsset(assetId,scope)) return errorResponse(404);
  try { return await withLocalStorageLock(scope.workspaceId,()=>action(request,route)); }
  catch (error) { return errorResponse(error instanceof LocalStorageError ? error.status : 500,"LOCAL_STORAGE_BUSY_OR_UNAVAILABLE"); }
}
export const PUT=(request:Request, route:RouteContext)=>mutateLocked(request,route,performPUT);
export const DELETE=(request:Request, route:RouteContext)=>mutateLocked(request,route,performDELETE);
