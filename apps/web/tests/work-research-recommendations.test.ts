import { describe, expect, it } from "vitest";
import type { DossierWork } from "../server/research/benchmark-dossier-math";
import { recommendWorkResearch } from "../server/research/work-research-recommendations";

const work = (id: string, likes: number | null, publishedAt: string, overrides: Partial<DossierWork> = {}): DossierWork => ({
  id, title: `作品 ${id}`, url: "https://example.test/work", coverUrl: null, publishedAt, observedAt: publishedAt, latestObservedAt: publishedAt,
  durationMs: null, views: null, counts: { likes, comments: null, favorites: null, shares: null }, sourceItemId: id,
  readable: true, timed: false, topic: null, ...overrides,
});

describe("representative work research queue", () => {
  it("keeps every pending work selectable while explaining high, typical and recent candidates", () => {
    const items = [work("high", 900, "2026-08-01"), work("typical", 30, "2026-07-01"), work("recent", 70, "2026-09-20"),
      work("other", 50, "2026-05-01"), work("studied", 60, "2026-06-01", { deepResearched: true })];
    const queue = recommendWorkResearch(items);
    expect(queue).toHaveLength(4);
    expect(queue.find(item => item.workId === "high")?.reason).toContain("高表现代表");
    expect(queue.find(item => item.workId === "recent")?.reason).toContain("近期作品");
    expect(queue.some(item => item.workId === "studied")).toBe(false);
    expect(queue.every(item => item.reason.length > 0)).toBe(true);
  });
  it("prioritizes readable and new topic evidence without pretending title-only work was deeply read", () => {
    const queue = recommendWorkResearch([work("readable", null, "2026-09-20", { topic: "客户案例" }),
      work("title", 100, "2026-09-21", { readable: false, sourceItemId: null, topic: "工具教程" })]);
    expect(queue[0]?.workId).toBe("readable");
    expect(queue.find(item => item.workId === "title")?.reason).toContain("先收录原作品");
  });
});
