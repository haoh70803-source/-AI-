import "server-only";
import { db } from "@content-center/db";
import { buildBenchmarkPerformance } from "../discovery/benchmark-performance";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import { researchMember, ResearchError, type ResearchActor } from "./access";

const active = ["QUEUED", "RUNNING"] as const;
export async function researchBenchmarkList(actor: ResearchActor, input: { q?: string; platform?: string; category?: string; page?: string }) {
  await researchMember(actor);
  const page = Math.min(1000, Math.max(1, Number(input.page) || 1));
  const q = input.q?.trim().slice(0, 100);
  const where = { workspaceId: actor.workspaceId, enabled: true,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { externalAccountId: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(input.platform && ["DOUYIN", "XIAOHONGSHU", "WECHAT", "BILIBILI", "YOUTUBE", "TIKTOK", "GENERIC", "OTHER"].includes(input.platform) ? { platform: input.platform as "DOUYIN" } : {}),
    ...(input.category ? { researchCategory: input.category.slice(0, 100) } : {}) };
  const [rows, count, categories] = await Promise.all([
    db.benchmarkAccount.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20,
      select: { id: true, name: true, platform: true, avatarUrl: true, researchCategory: true, lastSyncedAt: true,
        _count: { select: { contentSnapshots: true, studies: true } },
        collectionRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, createdAt: true, inRangeCount: true } } } }),
    db.benchmarkAccount.count({ where }),
    db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true, researchCategory: { not: null } }, select: { researchCategory: true }, distinct: ["researchCategory"], take: 100 }),
  ]);
  const linked = rows.length ? await db.$queryRaw<Array<{ accountId: string; materialCount: bigint }>>`
    SELECT b."id" AS "accountId", count(DISTINCT s."id") AS "materialCount"
    FROM "BenchmarkAccount" b
    JOIN "BenchmarkContentSnapshot" w ON w."benchmarkAccountId" = b."id" AND w."workspaceId" = b."workspaceId"
    JOIN "SourceItem" s ON s."workspaceId" = b."workspaceId" AND s."sourcePlatform" = w."platform" AND s."externalId" = w."externalId"
    WHERE b."workspaceId" = ${actor.workspaceId} AND b."id" = ANY(${rows.map(row => row.id)}::text[])
    GROUP BY b."id"` : [];
  const materialCounts = new Map(linked.map(row => [row.accountId, Number(row.materialCount)]));
  return { items: rows.map(row => ({ ...row, materialCount: materialCounts.get(row.id) ?? 0 })), count, page, pages: Math.max(1, Math.ceil(count / 20)), categories: categories.flatMap(row => row.researchCategory ? [row.researchCategory] : []) };
}

export async function researchBenchmarkDetail(actor: ResearchActor, accountId: string, input: { tab?: string; page?: string; runId?: string; view?: "dossier" }) {
  await researchMember(actor);
  const account = await db.benchmarkAccount.findFirst({ where: { id: accountId, workspaceId: actor.workspaceId, enabled: true }, select: { id: true, name: true, platform: true, avatarUrl: true, bio: true, originalUrl: true, researchCategory: true, researchNotes: true, lastSyncedAt: true, externalAccountId: true } });
  if (!account) throw new ResearchError("NOT_FOUND", "对标账号不存在。", 404);
  const [recentRuns, studies, discoveredCount, commentCount, savedRuns] = await Promise.all([
    db.benchmarkCollectionRun.findMany({ where: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12,
      select: { id: true, status: true, rangeStart: true, rangeEnd: true, inRangeCount: true, seenCount: true, undatedCount: true, stopReason: true, errorMessage: true, createdAt: true, completedAt: true } }),
    db.benchmarkStudy.findMany({ where: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId, status: "COMPLETED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30, select: { id: true, version: true, sampleCount: true, createdAt: true, collectionRunId: true } }),
    db.benchmarkContentSnapshot.count({ where: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId } }),
    db.benchmarkComment.count({ where: { snapshot: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId } } }),
    db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED", savedAt: { not: null }, inputScope: { path: ["benchmarkAccountIds"], array_contains: [accountId] }, session: { createdById: actor.userId, workspaceId: actor.workspaceId } }, orderBy: { savedAt: "desc" }, take: 30, select: { id: true, resultTitle: true, question: true, savedAt: true, version: true } }),
  ]);
  const requestedRun = input.runId && input.runId !== "history" && !recentRuns.some(run => run.id === input.runId) ? await db.benchmarkCollectionRun.findFirst({ where: { id: input.runId, workspaceId: actor.workspaceId, benchmarkAccountId: accountId }, select: { id: true, status: true, rangeStart: true, rangeEnd: true, inRangeCount: true, seenCount: true, undatedCount: true, stopReason: true, errorMessage: true, createdAt: true, completedAt: true } }) : null;
  const runs = requestedRun ? [requestedRun, ...recentRuns] : recentRuns;
  const selected = input.runId === "history" ? null : input.runId ? runs.find(run => run.id === input.runId) : runs.find(run => run.status === "COMPLETED" || run.status === "PARTIAL") ?? null;
  if (input.runId && input.runId !== "history" && !selected) throw new ResearchError("NOT_FOUND", "采集批次不存在。", 404);
  const activeRun = runs.find(run => active.includes(run.status as (typeof active)[number])) ?? null;
  if (input.tab === "results" && input.view !== "dossier") return { account, runs, studies, savedRuns, selected, discoveredCount, commentCount, workCount: 0, page: 1, pages: 1,
    works: [] as Array<ReturnType<typeof buildBenchmarkPerformance>["items"][number] & { sourceItemId: string | null }>, coverage: { pageItems: 0, pageMaterials: 0, pageReadable: 0, pageTimed: 0, pageVisual: 0 },
    performance: buildBenchmarkPerformance([]).totals, patterns: { publishedCount: 0, weekdayCounts: [] as Array<{ day: number; count: number }>, durationCount: 0, medianDurationMs: null as number | null, highLikes: [] as Array<ReturnType<typeof buildBenchmarkPerformance>["items"][number] & { sourceItemId: string | null }> }, activeRun };
  const page = input.view === "dossier" ? 1 : Math.min(1000, Math.max(1, Number(input.page) || 1));
  const limit = input.view === "dossier" ? 200 : 25;
  const where = selected ? { collectionRunId: selected.id, inRange: true } : { snapshot: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId } };
  const [rows, workCount] = selected ? await Promise.all([
    db.benchmarkCollectionRunItem.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit,
      select: { snapshotId: true, titleSnapshot: true, urlSnapshot: true, coverUrlSnapshot: true, metadataSnapshot: true, publishedAt: true, createdAt: true, snapshot: { select: { platform: true, externalId: true, observations: { where: { collectionRunId: selected.id }, orderBy: { observedAt: "desc" }, take: 1, select: { observedAt: true, metrics: true } } } } } }),
    db.benchmarkCollectionRunItem.count({ where }),
  ]) : [[], 0];
  const legacyRows = selected ? [] : await db.benchmarkContentSnapshot.findMany({ where: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId }, orderBy: [{ publishedAt: "desc" }, { observedAt: "desc" }], skip: (page - 1) * limit, take: limit,
    select: { id: true, title: true, url: true, coverUrl: true, metadata: true, publishedAt: true, observedAt: true, platform: true, externalId: true, observations: { orderBy: { observedAt: "desc" }, take: 2, select: { observedAt: true, metrics: true } } } });
  const works = selected ? rows.map(row => ({ id: row.snapshotId, title: row.titleSnapshot, url: row.urlSnapshot, coverUrl: row.coverUrlSnapshot, metadata: row.metadataSnapshot, publishedAt: row.publishedAt, observedAt: row.createdAt, platform: row.snapshot.platform, externalId: row.snapshot.externalId, observations: row.snapshot.observations })) : legacyRows;
  const count = selected ? workCount : discoveredCount;
  const sources = works.length ? await db.sourceItem.findMany({ where: { workspaceId: actor.workspaceId, status: { not: "ARCHIVED" }, OR: works.map(work => ({ sourcePlatform: work.platform, externalId: work.externalId })) }, select: { id: true, sourcePlatform: true, externalId: true } }) : [];
  const sourceMap = new Map(sources.map(source => [`${source.sourcePlatform}:${source.externalId}`, source.id]));
  const readable = input.view === "dossier" || !input.tab || input.tab === "overview" ? await Promise.all(sources.map(source => getMaterialReadableContent({ ...actor, sourceItemId: source.id }))) : [];
  const readableIds = new Set(readable.filter(item => Boolean(item?.contentText)).map(item => item!.sourceItemId));
  const openingSnippets = new Map(readable.filter(item => item?.contentSource === "TRANSCRIPT").map(item => [item!.sourceItemId, item!.contentText.slice(0, 180)]));
  const timedIds = new Set(readable.filter(item => Array.isArray(item?.segments) && item.segments.length > 0).map(item => item!.sourceItemId));
  const performance = buildBenchmarkPerformance(works);
  const published = works.filter(work => work.publishedAt);
  const weekdayCounts = Array.from({ length: 7 }, (_, day) => ({ day, count: published.filter(work => work.publishedAt && new Date(work.publishedAt.getTime() + 8 * 60 * 60 * 1000).getUTCDay() === day).length }));
  const durations = performance.items.flatMap(item => item.durationMs === null ? [] : [item.durationMs]);
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const midpoint = Math.floor(sortedDurations.length / 2);
  const sortedLikes = performance.items.filter(item => item.counts.likes !== null).sort((a, b) => b.counts.likes! - a.counts.likes!).slice(0, 5).map(item => ({ ...item, sourceItemId: sourceMap.get(`${account.platform}:${works.find(work => work.id === item.id)?.externalId}`) ?? null }));
  return { account, runs, studies, savedRuns, selected, discoveredCount, commentCount, workCount: count, page, pages: Math.max(1, Math.ceil(count / 25)),
    works: performance.items.map(work => { const sourceItemId = sourceMap.get(`${account.platform}:${works.find(item => item.id === work.id)?.externalId}`) ?? null; return { ...work, sourceItemId, readable: sourceItemId ? readableIds.has(sourceItemId) : false, timed: sourceItemId ? timedIds.has(sourceItemId) : false, openingSnippet: sourceItemId ? openingSnippets.get(sourceItemId) ?? null : null }; }),
    coverage: { pageItems: works.length, pageMaterials: works.filter(work => sourceMap.has(`${work.platform}:${work.externalId}`)).length, pageReadable: readableIds.size, pageTimed: timedIds.size, pageVisual: 0 },
    performance: performance.totals, patterns: { publishedCount: published.length, weekdayCounts, durationCount: durations.length, medianDurationMs: durations.length ? sortedDurations.length % 2 ? sortedDurations[midpoint]! : (sortedDurations[midpoint - 1]! + sortedDurations[midpoint]!) / 2 : null, highLikes: sortedLikes },
    activeRun };
}
