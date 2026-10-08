import type { BenchmarkPerformance } from "./benchmark-performance";

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const finite = (values: Array<number | null>) => values.filter((value): value is number => value !== null);

export function buildAccountReportTables(performance: BenchmarkPerformance) {
  const items = performance.items;
  const works = items.map((item) => {
    const counts = Object.values(item.counts);
    return { ...item, engagementRate: item.views !== null && item.views > 0 && counts.every((count) => count !== null) ? counts.reduce<number>((sum, count) => sum + count!, 0) / item.views : null };
  });
  const metrics = (["likes", "comments", "favorites", "shares"] as const).map((key) => {
    const values = finite(items.map((item) => item.counts[key]));
    return { key, count: values.length, total: values.length ? values.reduce((a, b) => a + b, 0) : null, average: average(values), median: median(values), maximum: values.length ? Math.max(...values) : null };
  });
  const tags = new Map<string, Set<string>>();
  for (const item of items) for (const match of item.title.matchAll(/#([^\s#]{1,40})/gu)) {
    const existing = tags.get(match[1]!) ?? new Set<string>(); existing.add(item.id); tags.set(match[1]!, existing);
  }
  const tagRows = [...tags].map(([name, ids]) => ({ name, count: ids.size, share: items.length ? ids.size / items.length : 0, workIds: [...ids] })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")).slice(0, 30);
  const coverage = { works: items.length, dated: items.filter((item) => item.publishedAt).length, duration: items.filter((item) => item.durationMs !== null).length, views: items.filter((item) => item.views !== null).length };
  const durationValues = finite(items.map((item) => item.durationMs));
  const trend = new Map<string, typeof items>();
  for (const item of items) {
    if (!item.publishedAt) continue;
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.publishedAt));
    const day = new Date(`${local}T00:00:00+08:00`);
    const weekday = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - weekday);
    const week = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
    trend.set(week, [...(trend.get(week) ?? []), item]);
  }
  const publishedTrend = [...trend.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([weekStart, weekItems]) => {
    const likes = finite(weekItems.map((item) => item.counts.likes));
    const comments = finite(weekItems.map((item) => item.counts.comments));
    return { weekStart, works: weekItems.length, likesKnown: likes.length, averageLikes: average(likes), averageComments: average(comments) };
  });
  return { schemaVersion: "account-report-tables-v3" as const, works, metrics, tagRows,
    duration: { known: durationValues.length, total: coverage.works, average: average(durationValues), median: median(durationValues) },
    publishedTrend,
    coverage,
  };
}
export type AccountReportTables = ReturnType<typeof buildAccountReportTables>;
