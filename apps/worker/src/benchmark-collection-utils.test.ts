import { describe, expect, it } from "vitest";
import { decideBenchmarkPage } from "./benchmark-collection-utils";

describe("benchmark collection pagination coverage", () => {
  it("marks a provider-declared end as complete", () => {
    expect(decideBenchmarkPage({ hasMore: false, nextOffset: null, currentOffset: 40, pageCount: 3, maxPages: 50 })).toEqual({ kind: "EXHAUSTED" });
  });

  it.each([null, undefined, 0, 40, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("refuses an unavailable or non-advancing cursor: %s", (nextOffset) => {
    expect(decideBenchmarkPage({ hasMore: true, nextOffset, currentOffset: 40, pageCount: 3, maxPages: 50 })).toEqual({ kind: "PARTIAL", reason: "CURSOR_UNAVAILABLE" });
  });

  it("continues only with a verified advancing cursor and marks page caps partial", () => {
    expect(decideBenchmarkPage({ hasMore: true, nextOffset: 60, currentOffset: 40, pageCount: 3, maxPages: 50 })).toEqual({ kind: "NEXT", nextOffset: 60 });
    expect(decideBenchmarkPage({ hasMore: null, nextOffset: 60, currentOffset: 40, pageCount: 50, maxPages: 50 })).toEqual({ kind: "PARTIAL", reason: "PAGE_LIMIT" });
  });
});
