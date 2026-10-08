import { describe, expect, it } from "vitest";
import { normalizeTrendPage } from "./trend-normalize";

describe("normalizeTrendPage", () => {
  it("normalizes real fields without fabricating unavailable metrics", () => {
    const [item] = normalizeTrendPage("DOUYIN", "SURGING", { data: { records: [{ awemeId: "aweme-1", title: "AI 办公", rank: 6, diggCount: "1200" }] } });
    expect(item).toMatchObject({ externalKey: "DOUYIN:SURGING:aweme-1", title: "AI 办公", rank: 6, trendScore: null, metrics: { likes: 1200, comments: null, growth: null } });
  });

  it("uses list order only as ranking-list position and ignores invalid rows", () => {
    const items = normalizeTrendPage("GLOBAL", "HOT", { list: [{ hotKeyword: "低空经济" }, { unknown: true }] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ keyword: "低空经济", rank: 1 });
  });
});
