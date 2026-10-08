import { normalizeTrendKeyword } from "@content-center/core";
import type { ProviderTrendItem, ProviderTrendType, TrendPlatform } from "./trends";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function list(value: unknown, depth = 0): unknown[] {
  if (Array.isArray(value)) return value;
  if (depth > 4) return [];
  const item = record(value);
  if (!item) return [];
  for (const key of ["records", "list", "items", "rows", "content", "data", "result", "top10"]) {
    if (key in item) {
      const found = list(item[key], depth + 1);
      if (found.length) return found;
    }
  }
  for (const value of Object.values(item)) {
    const found = list(value, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function text(item: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function number(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

export function normalizeTrendPage(platform: TrendPlatform, type: ProviderTrendType, raw: unknown): ProviderTrendItem[] {
  return list(raw).flatMap((value, index) => {
    const item = record(value);
    if (!item) return [];
    const title = text(item, ["title", "noteTitle", "workTitle", "keyword", "hotKeyword", "topic", "word", "name"]);
    if (!title) return [];
    const keyword = text(item, ["keyword", "hotKeyword", "topic", "word", "tagName"]) ?? title;
    const normalized = normalizeTrendKeyword(keyword);
    if (!normalized) return [];
    const providerId = text(item, ["id", "workId", "noteId", "awemeId", "itemId", "hotId"]);
    return [{
      externalKey: `${platform}:${type}:${providerId || normalized}`,
      platform,
      type,
      title,
      keyword,
      rank: number(item, ["rank", "ranking", "rankIndex", "sort", "position"]) ?? index + 1,
      trendScore: null,
      metrics: {
        contentCount: number(item, ["contentCount", "noteCount", "workCount", "count"]),
        engagement: number(item, ["engagement", "interactionCount", "interactCount", "hotValue", "heat"]),
        growth: number(item, ["growth", "growthRate", "riseValue", "increment"]),
        likes: number(item, ["likes", "likeCount", "diggCount", "likedCount"]),
        comments: number(item, ["comments", "commentCount"]),
      },
      sourceProvider: "REDFOX",
      rawProviderMetadata: item,
    } satisfies ProviderTrendItem];
  });
}
