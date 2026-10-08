import { describe, expect, it } from "vitest";
import { dossierCsv, dossierStatistics, type DossierWork } from "../server/research/benchmark-dossier-math";
const work = (id: string, likes: number | null, date: string | null = "2026-09-01T00:00:00Z"): DossierWork => ({ id, title: id, url: "https://example.test/work", coverUrl: null, publishedAt: date, observedAt: "2026-09-20T00:00:00Z", latestObservedAt: null, durationMs: null, views: null, counts: { likes, comments: null, favorites: null, shares: null }, sourceItemId: null, readable: false, timed: false, topic: null });
describe("account dossier statistics", () => {
  it("keeps missing metrics absent while a genuine zero participates in the denominator", () => {
    const stats = dossierStatistics([work("zero", 0), work("unknown", null), work("known", 12)]);
    expect(stats.metrics.find(item => item.key === "likes")).toMatchObject({ known: 2, average: 6, median: 6 });
    expect(stats.metrics.find(item => item.key === "comments")).toMatchObject({ known: 0, average: null, median: null });
    expect(stats.averageDuration).toBeNull();
  });
  it("only calls a work high performing against enough valid same-account samples", () => {
    expect(dossierStatistics([work("a", 100)]).high).toEqual([]);
    const stats = dossierStatistics([0, 5, 10, 15, 100, null].map((n, i) => work(String(i), n)));
    expect(stats.baseline.median).toBe(10);
    expect(stats.high.map(item => item.id)).toEqual(["4", "3"]);
  });
  it("groups by actual publication week in Shanghai and never substitutes collection time", () => {
    const stats = dossierStatistics([work("sunday", 10, "2026-09-06T15:59:00Z"), work("monday", 20, "2026-09-06T16:01:00Z"), work("undated", 30, null)]);
    expect(stats.weeks).toEqual([{ week: "2026-08-31", count: 1, known: 1, average: 10 }, { week: "2026-09-07", count: 1, known: 1, average: 20 }]);
  });
  it("exports absent data as blank and escapes spreadsheet formulas", () => {
    const csv = dossierCsv([work('=HYPERLINK("x")', null), work('  =1+2', null)]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'  =1+2");
    expect(csv).toContain('""');
    expect(csv).not.toContain('"0"');
  });
});
