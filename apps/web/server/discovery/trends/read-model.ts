import "server-only";

import { calculateRankDelta, crossPlatformGroups, normalizeTrendKeyword, resolveTrendState, type TrendState } from "@content-center/core";
import { db } from "@content-center/db";
import type { TrendMetrics } from "@content-center/providers";
import type { TrendPlatformFilter, TrendTypeFilter, TrendWindowInput } from "./schemas";

type Snapshot = {
  id: string;
  provider: string;
  platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL";
  trendType: "HOT" | "SURGING" | "DARK_HORSE";
  externalKey: string;
  title: string;
  keyword: string | null;
  rank: number | null;
  metrics: unknown;
  windowStart: Date;
  windowEnd: Date;
  observedAt: Date;
};

export type TrendOpportunity = {
  deterministicKey: string;
  platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL" | "CROSS_PLATFORM";
  type: "HOT" | "SURGING" | "DARK_HORSE" | "CROSS_PLATFORM";
  title: string;
  keyword: string | null;
  summary: string | null;
  rank: number | null;
  previousRank: number | null;
  rankDelta: number | null;
  state: TrendState;
  trendScore: null;
  metrics: TrendMetrics;
  windowStart: string;
  windowEnd: string;
  observedAt: string;
  sourceProvider: string;
  supportingContents: [];
  supportingSnapshotIds: string[];
  supportingPlatforms: Array<"DOUYIN" | "XIAOHONGSHU" | "GLOBAL">;
  rankHistory: Array<{ rank: number; observedAt: string }>;
  ideaCount: number;
};

export function publicTrendOpportunity(item: TrendOpportunity) {
  const { sourceProvider, ...publicItem } = item;
  void sourceProvider;
  return publicItem;
}

function dateAtStart(value: Date) { const date = new Date(value); date.setHours(0, 0, 0, 0); return date; }
function dateAtEnd(value: Date) { const date = new Date(value); date.setHours(23, 59, 59, 999); return date; }

export function trendWindowRange(window: TrendWindowInput, now = new Date()) {
  const end = dateAtEnd(now);
  const start = dateAtStart(now);
  if (window === "SEVEN_DAYS") start.setDate(start.getDate() - 6);
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { start, end, startDate: localDate(start), endDate: localDate(now) };
}

function metrics(value: unknown): TrendMetrics {
  const item = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const number = (key: keyof TrendMetrics) => typeof item[key] === "number" && Number.isFinite(item[key]) ? item[key] as number : null;
  return { contentCount: number("contentCount"), engagement: number("engagement"), growth: number("growth"), likes: number("likes"), comments: number("comments") };
}

function latestPerKey(snapshots: Snapshot[]) {
  const latest = new Map<string, Snapshot>();
  for (const snapshot of snapshots) if (!latest.has(snapshot.externalKey)) latest.set(snapshot.externalKey, snapshot);
  return [...latest.values()];
}

async function enrichIdeas(workspaceId: string, items: Array<Omit<TrendOpportunity, "ideaCount">>) {
  const snapshotIds = items.flatMap((item) => item.supportingSnapshotIds);
  const references = snapshotIds.length ? await db.contentIdeaReference.findMany({
    where: { trendSnapshotId: { in: snapshotIds }, idea: { workspaceId, status: { not: "ARCHIVED" } } },
    select: { ideaId: true, trendSnapshotId: true },
  }) : [];
  return items.map((item) => ({
    ...item,
    ideaCount: new Set(references.filter((reference) => reference.trendSnapshotId && item.supportingSnapshotIds.includes(reference.trendSnapshotId)).map((reference) => reference.ideaId)).size,
  }));
}

async function buildOpportunities(workspaceId: string, current: Snapshot[], baselineCutoff: Date, includeCrossPlatform: boolean) {
  const latest = latestPerKey(current);
  const externalKeys = latest.map((item) => item.externalKey);
  const history = externalKeys.length ? await db.trendSnapshot.findMany({
    where: { workspaceId, externalKey: { in: externalKeys }, observedAt: { gte: baselineCutoff } },
    orderBy: { observedAt: "desc" },
  }) as Snapshot[] : [];
  const historyByKey = new Map<string, Snapshot[]>();
  for (const snapshot of history) historyByKey.set(snapshot.externalKey, [...(historyByKey.get(snapshot.externalKey) ?? []), snapshot]);

  const singles: Array<Omit<TrendOpportunity, "ideaCount">> = latest.map((snapshot) => {
    const versions = historyByKey.get(snapshot.externalKey) ?? [];
    const previous = versions.find((item) => item.id !== snapshot.id && item.observedAt < snapshot.observedAt) ?? null;
    const rankDelta = calculateRankDelta(previous?.rank ?? null, snapshot.rank);
    return {
      deterministicKey: snapshot.externalKey,
      platform: snapshot.platform,
      type: snapshot.trendType,
      title: snapshot.title,
      keyword: snapshot.keyword,
      summary: null,
      rank: snapshot.rank,
      previousRank: previous?.rank ?? null,
      rankDelta,
      state: resolveTrendState({ type: snapshot.trendType, previousRank: previous?.rank ?? null, currentRank: snapshot.rank }),
      trendScore: null,
      metrics: metrics(snapshot.metrics),
      windowStart: snapshot.windowStart.toISOString(),
      windowEnd: snapshot.windowEnd.toISOString(),
      observedAt: snapshot.observedAt.toISOString(),
      sourceProvider: snapshot.provider,
      supportingContents: [],
      supportingSnapshotIds: [snapshot.id],
      supportingPlatforms: [snapshot.platform],
      rankHistory: versions.filter((item) => item.rank !== null).slice(0, 8).map((item) => ({ rank: item.rank!, observedAt: item.observedAt.toISOString() })),
    };
  });

  if (!includeCrossPlatform) return enrichIdeas(workspaceId, singles);
  const crossGroups = crossPlatformGroups(singles);
  const mergedKeys = new Set([...crossGroups.values()].flatMap((items) => items.map((item) => item.deterministicKey)));
  const cross: Array<Omit<TrendOpportunity, "ideaCount">> = [...crossGroups.entries()].map(([normalized, items]) => {
    const orderedItems = [...items].sort((left, right) => left.platform.localeCompare(right.platform));
    const rankValues = orderedItems.flatMap((item) => item.rank === null ? [] : [item.rank]);
    const previousValues = orderedItems.flatMap((item) => item.previousRank === null ? [] : [item.previousRank]);
    const rank = rankValues.length ? Math.min(...rankValues) : null;
    const previousRank = previousValues.length ? Math.min(...previousValues) : null;
    const state: TrendState = orderedItems.some((item) => item.state === "RISING") ? "RISING" : orderedItems.every((item) => item.state === "FIRST_SEEN") ? "FIRST_SEEN" : "PERSISTING";
    return {
      deterministicKey: `cross:${orderedItems[0]!.type}:${normalized}`,
      platform: "CROSS_PLATFORM",
      type: "CROSS_PLATFORM",
      title: orderedItems[0]!.keyword || orderedItems[0]!.title,
      keyword: orderedItems[0]!.keyword || orderedItems[0]!.title,
      summary: "多个平台都在讨论",
      rank,
      previousRank,
      rankDelta: calculateRankDelta(previousRank, rank),
      state,
      trendScore: null,
      metrics: { contentCount: null, engagement: null, growth: null, likes: null, comments: null },
      windowStart: orderedItems[0]!.windowStart,
      windowEnd: orderedItems[0]!.windowEnd,
      observedAt: orderedItems.map((item) => item.observedAt).sort().at(-1)!,
      sourceProvider: "REDFOX",
      supportingContents: [],
      supportingSnapshotIds: orderedItems.flatMap((item) => item.supportingSnapshotIds),
      supportingPlatforms: [...new Set(orderedItems.flatMap((item) => item.supportingPlatforms))],
      rankHistory: [],
    };
  });
  return enrichIdeas(workspaceId, [...cross, ...singles.filter((item) => !mergedKeys.has(item.deterministicKey))]);
}

export async function listTrendOpportunities(input: {
  workspaceId: string;
  window: TrendWindowInput;
  platform: TrendPlatformFilter;
  type: TrendTypeFilter;
  now?: Date;
  take?: number;
}) {
  const range = trendWindowRange(input.window, input.now);
  const current = await db.trendSnapshot.findMany({
    where: {
      workspaceId: input.workspaceId,
      windowStart: range.start,
      windowEnd: range.end,
      trendType: input.type,
      ...(input.platform === "ALL" ? {} : { platform: input.platform }),
    },
    orderBy: [{ observedAt: "desc" }, { rank: "asc" }],
  }) as Snapshot[];
  const baselineCutoff = new Date(range.start);
  baselineCutoff.setDate(baselineCutoff.getDate() - (input.window === "TODAY" ? 1 : 7));
  const opportunities = await buildOpportunities(input.workspaceId, current, baselineCutoff, input.platform === "ALL");
  return opportunities
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || b.observedAt.localeCompare(a.observedAt))
    .slice(0, input.take ?? 50);
}

export async function getTrendOpportunity(workspaceId: string, deterministicKey: string, now = new Date()) {
  for (const window of ["TODAY", "SEVEN_DAYS"] as const) {
    for (const type of ["HOT", "SURGING", "DARK_HORSE"] as const) {
      const items = await listTrendOpportunities({ workspaceId, window, platform: "ALL", type, now });
      const match = items.find((item) => item.deterministicKey === deterministicKey);
      if (match) return match;
    }
  }
  return null;
}

export function normalizeOpportunityKey(value: string) {
  return normalizeTrendKeyword(value);
}

export function decodeTrendOpportunityKey(value: string) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}
