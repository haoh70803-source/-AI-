export type PerformanceMetric = "likes" | "comments" | "favorites" | "shares";
export type PerformanceSnapshot = { id: string; title: string; url: string; coverUrl?: string | null; metadata: unknown; publishedAt: Date | null; observedAt: Date; observations?: Array<{ observedAt: Date; metrics: unknown }> };
const metrics: PerformanceMetric[] = ["likes", "comments", "favorites", "shares"];
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

// Observed counters, not a causal "viral score". Missing values never become zero.
export function buildBenchmarkPerformance(snapshots: PerformanceSnapshot[]) {
  const items = snapshots.map((snapshot) => {
    const observations = snapshot.observations ?? [];
    const latest = observations[0]; const previous = observations[1];
    const raw = latest ? object(latest.metrics) : object(object(snapshot.metadata).metrics);
    const counts = Object.fromEntries(metrics.map((key) => [key, typeof raw[key] === "number" && Number.isFinite(raw[key]) && raw[key] >= 0 ? raw[key] : null])) as Record<PerformanceMetric, number | null>;
    const metadata = object(snapshot.metadata);
    const views = typeof raw.views === "number" && Number.isFinite(raw.views) && raw.views >= 0 ? raw.views : null;
    const durationMs = typeof metadata.durationMs === "number" && Number.isFinite(metadata.durationMs) && metadata.durationMs >= 0 ? metadata.durationMs : null;
    const preview = object(metadata.publicPreviewCover);
    const previewUrl = typeof preview.url === "string" && preview.url.startsWith("https://") ? preview.url : null;
    const latestLikes = latest ? object(latest.metrics).likes : null; const previousLikes = previous ? object(previous.metrics).likes : null;
    const likesDelta = typeof latestLikes === "number" && Number.isFinite(latestLikes) && typeof previousLikes === "number" && Number.isFinite(previousLikes) ? latestLikes - previousLikes : null;
    return { id: snapshot.id, title: snapshot.title, url: snapshot.url, coverUrl: snapshot.coverUrl ?? previewUrl, publishedAt: snapshot.publishedAt?.toISOString() ?? null, observedAt: snapshot.observedAt.toISOString(), counts, views, durationMs, latestObservedAt: latest?.observedAt.toISOString() ?? null, previousObservedAt: previous?.observedAt.toISOString() ?? null, likesDelta };
  });
  return { count: items.length, items, totals: metrics.map((metric) => {
    const values = items.flatMap((item) => item.counts[metric] === null ? [] : [item.counts[metric]!]);
    return { metric, covered: values.length, value: values.length ? values.reduce((sum, value) => sum + value, 0) : null };
  }) };
}
export type BenchmarkPerformance = ReturnType<typeof buildBenchmarkPerformance>;
