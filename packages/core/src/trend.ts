const punctuation = /[\s，。！？、；：,.!?;:'"“”‘’（）()【】\u005b\u005d《》<>·…—_-]+/g;

export type TrendState = "FIRST_SEEN" | "RISING" | "PERSISTING" | "DARK_HORSE";

export function normalizeTrendKeyword(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/^[#＃]+/, "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(punctuation, "")
    .toLocaleLowerCase("zh-CN");
}

export function calculateRankDelta(previousRank: number | null, currentRank: number | null): number | null {
  if (previousRank === null || currentRank === null) return null;
  return previousRank - currentRank;
}

export function resolveTrendState(input: {
  type: "HOT" | "SURGING" | "DARK_HORSE" | "CROSS_PLATFORM";
  previousRank: number | null;
  currentRank: number | null;
}): TrendState {
  if (input.type === "DARK_HORSE") return "DARK_HORSE";
  if (input.previousRank === null) return "FIRST_SEEN";
  const delta = calculateRankDelta(input.previousRank, input.currentRank);
  return delta !== null && delta > 0 ? "RISING" : "PERSISTING";
}

export function crossPlatformGroups<T extends { platform: string; keyword: string | null; title: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const normalized = normalizeTrendKeyword(item.keyword || item.title);
    if (!normalized) continue;
    const group = groups.get(normalized) ?? [];
    group.push(item);
    groups.set(normalized, group);
  }
  for (const [key, group] of groups) {
    if (new Set(group.map((item) => item.platform)).size < 2) groups.delete(key);
  }
  return groups;
}
