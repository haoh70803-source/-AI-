import { db } from "@content-center/db";
import { getStorageProvider } from "@content-center/providers";
import { apiError } from "@/server/api-access";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { researchMember } from "@/server/research/access";

export const runtime = "nodejs";

/** Same-origin, range-aware playback for a scoped benchmark work asset. */
export async function GET(request: Request, route: { params: Promise<{ id: string; workId: string }> }) {
  try {
    const actor = await researchApiActor(); await researchMember(actor);
    const { id, workId } = await route.params;
    const work = await db.benchmarkContentSnapshot.findFirst({ where: { id: workId, workspaceId: actor.workspaceId,
      benchmarkAccountId: id, benchmarkAccount: { workspaceId: actor.workspaceId, enabled: true } },
      select: { platform: true, externalId: true } });
    if (!work) return apiError("NOT_FOUND", 404);
    const source = await db.sourceItem.findFirst({ where: { workspaceId: actor.workspaceId,
      sourcePlatform: work.platform, externalId: work.externalId, status: { not: "ARCHIVED" } }, select: { id: true } });
    if (!source) return apiError("NOT_FOUND", 404);
    const asset = await db.sourceAsset.findFirst({ where: { workspaceId: actor.workspaceId, sourceItemId: source.id,
      assetType: "VIDEO", status: "STORED", storageKey: { not: null } },
      select: { id: true, storageKey: true, mimeType: true }, orderBy: { createdAt: "desc" } });
    if (!asset?.storageKey || asset.mimeType !== "video/mp4") return apiError("NOT_FOUND", 404);
    const range = request.headers.get("range");
    if (range && !/^bytes=\d*-\d*$/u.test(range)) return apiError("INVALID_RANGE", 416);
    const signed = await getStorageProvider().getSignedUrl(asset.storageKey, 60, {
      assetScope: { workspaceId: actor.workspaceId, sourceItemId: source.id, assetId: asset.id },
    });
    const upstream = await fetch(signed.data.url, { headers: range ? { range } : undefined, signal: request.signal, redirect: "error" });
    if (![200, 206].includes(upstream.status) || !upstream.body) return apiError("MEDIA_UNAVAILABLE", 502, "原片暂时无法播放，请到资料页查看原件。");
    const headers = new Headers({ "content-type": "video/mp4", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "accept-ranges": "bytes" });
    for (const name of ["content-length", "content-range"]) { const value = upstream.headers.get(name); if (value) headers.set(name, value); }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) { return researchApiError(error); }
}
