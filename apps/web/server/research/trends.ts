import "server-only";
import { db } from "@content-center/db";
import { researchMember, ResearchError, type ResearchActor } from "./access";

type Identity = { provider: string; platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL"; trendType: "HOT" | "SURGING" | "DARK_HORSE"; externalKey: string };
export function trendStableKey(identity: Identity) { return Buffer.from(JSON.stringify([identity.provider, identity.platform, identity.trendType, identity.externalKey])).toString("base64url"); }
export function parseTrendStableKey(key: string): Identity {
  try {
    if (key.length > 2000) throw new Error();
    const value: unknown = JSON.parse(Buffer.from(key, "base64url").toString("utf8"));
    if (!Array.isArray(value) || value.length !== 4 || value.some(item => typeof item !== "string" || !item || item.length > 500) || !["DOUYIN", "XIAOHONGSHU", "GLOBAL"].includes(value[1]) || !["HOT", "SURGING", "DARK_HORSE"].includes(value[2])) throw new Error();
    const [provider, platform, trendType, externalKey] = value as [string, Identity["platform"], Identity["trendType"], string];
    return { provider, platform, trendType, externalKey };
  } catch { throw new ResearchError("INVALID_TREND_KEY", "趋势标识无效。", 404); }
}

type TrendRow = Identity & { id: string; title: string; keyword: string | null; rank: number | null; metrics: unknown; windowStart: Date; windowEnd: Date; observedAt: Date; previousRank: number | null; previousObservedAt: Date | null; state: "FIRST_SEEN" | "RISING" | "PERSISTING"; total: bigint };
export function safeTrendMetrics(value: unknown) { const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; const number = (name: string) => typeof raw[name] === "number" && Number.isFinite(raw[name]) && (raw[name] as number) >= 0 ? raw[name] as number : null; return { contentCount: number("contentCount"), engagement: number("engagement"), growth: number("growth"), likes: number("likes"), comments: number("comments") }; }
export async function researchTrendList(actor: ResearchActor, input: { q?: string; platform?: string; type?: string; state?: string; since?: string; page?: string }): Promise<{ items: Array<Omit<TrendRow, "metrics"> & { stableKey: string; metrics: ReturnType<typeof safeTrendMetrics>; rankDelta: number | null; followed: boolean }>; count: number; page: number; pages: number }> {
  await researchMember(actor);
  const page = Math.min(1000, Math.max(1, Number(input.page) || 1));
  const q = input.q?.trim().slice(0, 100) ?? "";
  const platform = ["DOUYIN", "XIAOHONGSHU", "GLOBAL"].includes(input.platform ?? "") ? input.platform! : "";
  const type = ["HOT", "SURGING", "DARK_HORSE"].includes(input.type ?? "") ? input.type! : "";
  const state = ["FIRST_SEEN", "RISING", "PERSISTING"].includes(input.state ?? "") ? input.state! : "";
  const followed = input.state === "FOLLOWED";
  const since = input.since && /^\d{4}-\d{2}-\d{2}$/.test(input.since) ? new Date(`${input.since}T00:00:00+08:00`) : null;
  const rows = await db.$queryRaw<TrendRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON ("provider", "platform", "trendType", "externalKey")
        "id", "provider", "platform", "trendType", "externalKey", "title", "keyword", "rank", "metrics", "windowStart", "windowEnd", "observedAt"
      FROM "TrendSnapshot" WHERE "workspaceId" = ${actor.workspaceId}
      ORDER BY "provider", "platform", "trendType", "externalKey", "observedAt" DESC, "id" DESC
    ), observed AS (
      SELECT l.*, p."rank" AS "previousRank", p."observedAt" AS "previousObservedAt",
        CASE WHEN p."observedAt" IS NULL THEN 'FIRST_SEEN'
             WHEN l."rank" IS NOT NULL AND p."rank" IS NOT NULL AND l."rank" < p."rank" THEN 'RISING'
             ELSE 'PERSISTING' END AS "state"
      FROM latest l
      LEFT JOIN LATERAL (
        SELECT "rank", "observedAt" FROM "TrendSnapshot" p
        WHERE p."workspaceId" = ${actor.workspaceId} AND p."provider" = l."provider" AND p."platform" = l."platform"
          AND p."trendType" = l."trendType" AND p."externalKey" = l."externalKey" AND p."observedAt" < l."observedAt"
        ORDER BY p."observedAt" DESC, p."id" DESC LIMIT 1
      ) p ON true
    )
    SELECT *, count(*) OVER() AS "total" FROM observed
    WHERE (${q} = '' OR "title" ILIKE '%' || ${q} || '%' OR "keyword" ILIKE '%' || ${q} || '%')
      AND (${platform} = '' OR "platform"::text = ${platform})
      AND (${type} = '' OR "trendType"::text = ${type})
      AND (${state} = '' OR "state" = ${state})
      AND (${followed} = false OR EXISTS (
        SELECT 1 FROM "ResearchObjectPreference" pref
        WHERE pref."workspaceId" = ${actor.workspaceId} AND pref."userId" = ${actor.userId} AND pref."kind" = 'TREND' AND pref."followedAt" IS NOT NULL
          AND pref."trendProvider" = "provider" AND pref."trendPlatform" = "platform" AND pref."trendType" = "trendType" AND pref."trendExternalKey" = "externalKey"
      ))
      AND (${since}::timestamp IS NULL OR "observedAt" >= ${since}::timestamp)
    ORDER BY "observedAt" DESC, "rank" ASC NULLS LAST, "id" DESC
    LIMIT 20 OFFSET ${(page - 1) * 20}`;
  if (!rows.length && page > 1) { const first = await researchTrendList(actor, { ...input, page: "1" }); return { ...first, items: [], page }; }
  const preferences = rows.length ? await db.researchObjectPreference.findMany({ where: { workspaceId: actor.workspaceId, userId: actor.userId, kind: "TREND", followedAt: { not: null }, objectKey: { in: rows.map(row => trendStableKey(row)) } }, select: { objectKey: true } }) : [];
  const followedKeys = new Set(preferences.map(row => row.objectKey));
  const count = Number(rows[0]?.total ?? 0);
  return { items: rows.map(row => ({ ...row, stableKey: trendStableKey(row), followed: followedKeys.has(trendStableKey(row)), metrics: safeTrendMetrics(row.metrics), rankDelta: row.rank === null || row.previousRank === null ? null : row.previousRank - row.rank })), count, page, pages: Math.max(1, Math.ceil(count / 20)) };
}

export async function researchTrendDetail(actor: ResearchActor, stableKey: string, page = 1) {
  await researchMember(actor);
  const identity = parseTrendStableKey(stableKey);
  const where = { workspaceId: actor.workspaceId, ...identity };
  const currentPage = Math.min(1000, Math.max(1, page));
  const [latest, snapshots, count, savedRuns] = await Promise.all([
    db.trendSnapshot.findFirst({ where, orderBy: [{ observedAt: "desc" }, { id: "desc" }] }),
    db.trendSnapshot.findMany({ where, orderBy: [{ observedAt: "desc" }, { id: "desc" }], skip: (currentPage - 1) * 60, take: 60 }),
    db.trendSnapshot.count({ where }),
    db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED", savedAt: { not: null }, inputScope: { path: ["trendKeys"], array_contains: [stableKey] }, session: { workspaceId: actor.workspaceId, createdById: actor.userId } }, orderBy: { savedAt: "desc" }, take: 20, select: { id: true, resultTitle: true, question: true, savedAt: true } }),
  ]);
  if (!latest) throw new ResearchError("NOT_FOUND", "趋势记录不存在。", 404);
  const previous = await db.trendSnapshot.findFirst({ where: { ...where, observedAt: { lt: latest.observedAt } }, orderBy: [{ observedAt: "desc" }, { id: "desc" }], select: { rank: true, observedAt: true } });
  const first = await db.trendSnapshot.findFirst({ where, orderBy: [{ observedAt: "asc" }, { id: "asc" }], select: { observedAt: true } });
  return { identity, stableKey, title: latest.title, keyword: latest.keyword, platform: latest.platform, trendType: latest.trendType,
    latest: { ...latest, metrics: safeTrendMetrics(latest.metrics) }, previous, firstObservedAt: first!.observedAt,
    state: !previous ? "FIRST_SEEN" : latest.rank !== null && previous.rank !== null && latest.rank < previous.rank ? "RISING" : "PERSISTING",
    rankDelta: latest.rank === null || previous?.rank == null ? null : previous.rank - latest.rank,
    snapshots: snapshots.map(snapshot => ({ ...snapshot, metrics: safeTrendMetrics(snapshot.metrics) })), savedRuns, count, page: currentPage, pages: Math.max(1, Math.ceil(count / 60)) };
}
