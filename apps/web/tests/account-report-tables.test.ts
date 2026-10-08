import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildBenchmarkPerformance } from "../server/discovery/benchmark-performance";
import { buildAccountReportTables, median } from "../server/discovery/account-report-tables";
import { validateAccountReportOutput } from "../server/discovery/account-report-contract";

describe("deterministic account report", () => {
  it("handles medians, missing values and division by zero", () => {
    expect(median([])).toBeNull(); expect(median([1, 9, 3, 5])).toBe(4);
    const items = [0, 0, 0, 0, 10].map((likes, index) => ({ id: String(index), title: "三步方法 #运营 #运营", url: "https://example.test/" + index, publishedAt: null, observedAt: new Date(), metadata: { metrics: { likes, comments: null, views: 0 } } }));
    const result = buildAccountReportTables(buildBenchmarkPerformance(items));
    expect(result.works.every((item) => item.engagementRate === null)).toBe(true);
    expect(result.metrics.find((item) => item.key === "comments")?.total).toBeNull();
    expect(result.tagRows[0]?.count).toBe(5);
    expect("titlePatterns" in result).toBe(false);
    expect("performanceRadar" in result).toBe(false);
  });
  it("only computes engagement when all four metrics and positive views are available", () => {
    const result = buildAccountReportTables(buildBenchmarkPerformance([{ id: "1", title: "测试", url: "https://example.test/1", publishedAt: new Date("2026-09-08"), observedAt: new Date(), metadata: { durationMs: 45000, metrics: { likes: 10, comments: 2, favorites: 3, shares: 5, views: 100 } } }]));
    expect(result.works[0]?.engagementRate).toBe(.2);
    expect(result.coverage).toMatchObject({ dated: 1, duration: 1, views: 1 });
    expect(result.duration).toMatchObject({ known: 1, total: 1, average: 45000, median: 45000 });
  });
  it("reproduces the actual 54-work public observation without synthetic metrics", async () => {
    const observation = JSON.parse(await readFile(new URL("../../../docs/research/li-xiao-public-observation.json", import.meta.url), "utf8")) as { works: Array<[string, number, string]> };
    const result = buildAccountReportTables(buildBenchmarkPerformance(observation.works.map(([id, likes, title]) => ({ id, title, url: "https://www.douyin.com/video/" + id, publishedAt: null, observedAt: new Date("2026-09-23"), metadata: { metrics: { likes } } }))));
    expect(result.coverage.works).toBe(54);
    expect(result.metrics[0]).toMatchObject({ count: 54, total: 71845, median: 517, maximum: 8232 });
    expect(result.coverage).toMatchObject({ dated: 0, duration: 0, views: 0 });
    expect(result.duration).toMatchObject({ known: 0, total: 54, average: null, median: null });
  });
  it("validates future model output and rejects cross-account citations", () => {
    const valid = { schemaVersion: "account-report-analysis-v1", observations: [{ statement: "一项观察", workIds: ["a"], limitation: "仅限本批样本" }], workAnalyses: [] };
    expect(validateAccountReportOutput(valid, new Set(["a"])).observations).toHaveLength(1);
    expect(() => validateAccountReportOutput(valid, new Set(["b"]))).toThrow();
    expect(() => validateAccountReportOutput({ ...valid, madeUpTotal: 999999 }, new Set(["a"]))).toThrow();
  });
});
