import { describe, expect, it } from "vitest";
import { calculateRankDelta, crossPlatformGroups, normalizeTrendKeyword, resolveTrendState } from "./trend";

describe("trend helpers", () => {
  it("normalizes only deterministic equivalents", () => {
    expect(normalizeTrendKeyword("  #AI，办公！ ")).toBe("ai办公");
    expect(normalizeTrendKeyword("＃人工智能")).toBe("人工智能");
  });

  it("calculates upward rank movement in the correct direction", () => {
    expect(calculateRankDelta(18, 6)).toBe(12);
    expect(calculateRankDelta(6, 18)).toBe(-12);
    expect(calculateRankDelta(null, 6)).toBeNull();
  });

  it("does not invent growth for a first observation", () => {
    expect(resolveTrendState({ type: "HOT", previousRank: null, currentRank: 6 })).toBe("FIRST_SEEN");
    expect(resolveTrendState({ type: "SURGING", previousRank: 18, currentRank: 6 })).toBe("RISING");
    expect(resolveTrendState({ type: "DARK_HORSE", previousRank: null, currentRank: null })).toBe("DARK_HORSE");
  });

  it("groups only exact normalized keywords seen on multiple platforms", () => {
    const groups = crossPlatformGroups([
      { platform: "DOUYIN", keyword: "#AI 办公", title: "A" },
      { platform: "XIAOHONGSHU", keyword: "AI，办公", title: "B" },
      { platform: "DOUYIN", keyword: "低空经济", title: "C" },
    ]);
    expect([...groups.keys()]).toEqual(["ai办公"]);
    expect(groups.get("ai办公")).toHaveLength(2);
  });
});
