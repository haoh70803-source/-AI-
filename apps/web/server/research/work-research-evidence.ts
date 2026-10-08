import "server-only";
import { createHash } from "node:crypto";
import { db } from "@content-center/db";
import { buildBenchmarkPerformance } from "../discovery/benchmark-performance";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import { ResearchError, researchMember, type ResearchActor } from "./access";
import { workEvidenceSchema, type WorkEvidence } from "./work-research-contract";

const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

export async function collectWorkResearchEvidence(actor: ResearchActor, accountId: string, workId: string): Promise<WorkEvidence> {
  await researchMember(actor);
  const work = await db.benchmarkContentSnapshot.findFirst({
    where: { id: workId, workspaceId: actor.workspaceId, benchmarkAccountId: accountId, benchmarkAccount: { workspaceId: actor.workspaceId, enabled: true } },
    select: { id: true, title: true, url: true, platform: true, externalId: true, publishedAt: true, observedAt: true, metadata: true, coverUrl: true,
      observations: { orderBy: [{ observedAt: "desc" }, { id: "desc" }], take: 1, select: { observedAt: true, metrics: true } } },
  });
  if (!work) throw new ResearchError("NOT_FOUND", "作品不存在或不可访问。", 404);
  const source = await db.sourceItem.findFirst({ where: { workspaceId: actor.workspaceId, sourcePlatform: work.platform, externalId: work.externalId, status: { not: "ARCHIVED" } }, select: { id: true } });
  const [readable, media] = source ? await Promise.all([
    getMaterialReadableContent({ ...actor, sourceItemId: source.id }),
    db.sourceAsset.findFirst({ where: { workspaceId: actor.workspaceId, sourceItemId: source.id, assetType: "VIDEO", status: "STORED" }, select: { id: true }, orderBy: { createdAt: "desc" } }),
  ]) : [null, null];
  const text = readable?.contentText ?? "";
  const rawSegments = Array.isArray(readable?.segments) ? readable.segments : [];
  const segments = rawSegments.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const item = row as Record<string, unknown>;
    return typeof item.startMs === "number" && Number.isInteger(item.startMs) && item.startMs >= 0
      && typeof item.endMs === "number" && Number.isInteger(item.endMs) && item.endMs >= item.startMs
      && typeof item.text === "string" && item.text.trim() ? [{ startMs: item.startMs, endMs: item.endMs, text: item.text.trim() }] : [];
  });
  const metrics = buildBenchmarkPerformance([work]).items[0]!;
  const contentHash = text ? hash(text) : null;
  const fingerprint = hash({ workId, accountId, title: work.title, publishedAt: work.publishedAt, observedAt: metrics.latestObservedAt ?? work.observedAt,
    metrics: { views: metrics.views, ...metrics.counts }, durationMs: metrics.durationMs,
    contentHash, contentVersion: readable?.version ?? null, segmentsHash: hash(segments), origin: readable?.contentSource ?? null, mediaAssetId: media?.id ?? null });
  return workEvidenceSchema.parse({ schemaVersion: "work-evidence-v1", fingerprint, capturedAt: new Date().toISOString(), accountId, workId,
    sourceItemId: source?.id ?? null, mediaAssetId: media?.id ?? null, title: work.title, url: /^https:\/\//i.test(work.url) ? work.url : null,
    publishedAt: work.publishedAt?.toISOString() ?? null, observedAt: metrics.latestObservedAt ?? work.observedAt.toISOString(),
    metrics: { views: metrics.views, ...metrics.counts }, durationMs: metrics.durationMs,
    contentText: text.slice(0, 12000), contentLength: text.length, contentHash, contentVersion: readable?.version ?? null,
    contentOrigin: readable?.contentSource ?? null, segments: segments.slice(0, 120), truncated: text.length > 12000 || segments.length > 120 });
}
