export type DossierWork = {
  id: string; title: string; url: string; coverUrl: string | null;
  publishedAt: string | null; observedAt: string; latestObservedAt: string | null;
  durationMs: number | null; views: number | null;
  counts: Record<"likes" | "comments" | "favorites" | "shares", number | null>;
  sourceItemId: string | null; readable: boolean; timed: boolean;
  topic: string | null; openingSnippet?: string | null;
  topicBasis?: "TEXT" | "TITLE" | null;
  researchStatus?: "NOT_ANALYZED" | "CURRENT" | "OUTDATED" | "TITLE_ONLY";
  deepResearched?: boolean;
};
export type DossierMetric = "views" | "likes" | "comments" | "favorites" | "shares";
export const dossierMetricLabels: Record<DossierMetric, string> = { views: "播放", likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享" };
export const metricValue = (work: DossierWork, key: DossierMetric) => key === "views" ? work.views : work.counts[key];
const valid = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
export function dossierStatistics(works: DossierWork[], metric: DossierMetric = "likes") {
  const metrics = (Object.keys(dossierMetricLabels) as DossierMetric[]).map(key => {
    const values = works.map(work => metricValue(work, key)).filter(valid);
    return { key, label: dossierMetricLabels[key], known: values.length, average: values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null, median: median(values) };
  });
  const durations = works.map(work => work.durationMs).filter(valid);
  const baseline = metrics.find(item => item.key === metric)!;
  const high = baseline.known > 0 && baseline.median !== null ? works.filter(work => {
    const value = metricValue(work, metric); return valid(value) && value > baseline.median!;
  }).sort((a, b) => metricValue(b, metric)! - metricValue(a, metric)!).slice(0, 6) : [];
  const weeks = new Map<string, { count: number; total: number; known: number }>();
  for (const work of works) {
    if (!work.publishedAt) continue;
    const date = new Date(work.publishedAt); if (Number.isNaN(date.getTime())) continue;
    const local = new Date(date.getTime() + 8 * 3600_000);
    local.setUTCHours(0, 0, 0, 0); local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
    const key = local.toISOString().slice(0, 10); const entry = weeks.get(key) ?? { count: 0, total: 0, known: 0 };
    entry.count++; const value = metricValue(work, metric); if (valid(value)) { entry.total += value; entry.known++; } weeks.set(key, entry);
  }
  return { metrics, averageDuration: durations.length ? durations.reduce((sum, n) => sum + n, 0) / durations.length : null, durationKnown: durations.length,
    readable: works.filter(work => work.readable).length, withMetrics: works.filter(work => metrics.some(item => valid(metricValue(work, item.key)))).length,
    baseline, high, weeks: [...weeks].sort(([a], [b]) => a.localeCompare(b)).map(([week, entry]) => ({ week, count: entry.count, known: entry.known, average: entry.known ? entry.total / entry.known : null })) };
}
export function dossierCsv(works: DossierWork[]) {
  const cell = (value: unknown) => { let text = value === null || value === undefined ? "" : String(value); if (/^\s*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  const rows = [["标题", "发布时间", "AI主题（已保存研究）", "播放", "点赞", "评论", "收藏", "分享", "时长毫秒", "正文可读", "观察时间", "原始链接"], ...works.map(work => [work.title, work.publishedAt, work.topic, work.views, work.counts.likes, work.counts.comments, work.counts.favorites, work.counts.shares, work.durationMs, work.readable ? "是" : "否", work.latestObservedAt || work.observedAt, work.url])];
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n");
}
