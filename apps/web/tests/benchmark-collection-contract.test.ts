import { describe, expect, it } from "vitest";
import { isPublishedInBenchmarkRange, resolveBenchmarkCollectionRange } from "../server/discovery/benchmark-collection-contract";

describe("benchmark collection date boundaries", () => {
  const now = new Date("2026-09-24T02:00:00.000Z");

  it.each(["30", "90", "180"] as const)("resolves an inclusive Shanghai %s-day preset", (preset) => {
    const range = resolveBenchmarkCollectionRange({ preset }, now);
    expect(range.days).toBe(Number(preset));
    expect(range.endDate).toBe("2026-09-24");
    expect(range.rangeStart.toISOString()).toBe(new Date(`${range.startDate}T00:00:00+08:00`).toISOString());
    expect(range.rangeEnd.toISOString()).toBe("2026-09-24T15:59:59.999Z");
  });

  it("uses inclusive custom calendar dates and rejects invalid or oversized windows", () => {
    const range = resolveBenchmarkCollectionRange({ preset: "CUSTOM", startDate: "2026-09-01", endDate: "2026-09-24" }, now);
    expect(range.days).toBe(24);
    expect(isPublishedInBenchmarkRange(new Date("2026-09-01T00:00:00+08:00"), range.rangeStart, range.rangeEnd)).toBe(true);
    expect(isPublishedInBenchmarkRange(new Date("2026-09-25T00:00:00+08:00"), range.rangeStart, range.rangeEnd)).toBe(false);
    expect(isPublishedInBenchmarkRange(null, range.rangeStart, range.rangeEnd)).toBe(false);
    expect(() => resolveBenchmarkCollectionRange({ preset: "CUSTOM", startDate: "2026-02-30", endDate: "2026-09-24" }, now)).toThrow();
    expect(() => resolveBenchmarkCollectionRange({ preset: "CUSTOM", startDate: "2026-09-24", endDate: "2026-09-25" }, now)).toThrow(/今天/);
    expect(() => resolveBenchmarkCollectionRange({ preset: "CUSTOM", startDate: "2025-01-01", endDate: "2026-09-24" }, now)).toThrow(/365/);
  });
});
