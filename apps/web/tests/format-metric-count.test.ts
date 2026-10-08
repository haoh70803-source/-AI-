import { describe, expect, it } from "vitest";
import { exactMetricCount, formatMetricCount } from "../lib/format-metric-count";

describe("formatMetricCount", () => {
  it.each([
    [0, "0"],
    [9_999, "9,999"],
    [10_000, "1万"],
    [12_800, "1.3万"],
    [105_000_000, "1.1亿"],
  ])("formats %i for compact Chinese display", (value, expected) => {
    expect(formatMetricCount(value)).toBe(expected);
  });

  it("keeps the exact localized value available for accessible detail", () => {
    expect(exactMetricCount(12_800)).toBe("12,800");
  });
});
