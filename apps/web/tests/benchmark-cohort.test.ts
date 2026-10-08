import { describe, expect, it } from "vitest";
import { buildBenchmarkCohortRadar, type BenchmarkRadarInput } from "../server/discovery/benchmark-cohort";

function samples(values: { likes?: number | null; comments?: number | null }[] = []) {
  return values.map((value) => ({ likes: value.likes ?? null, comments: value.comments ?? null, shares: 10, favorites: 20, durationMs: 30000 }));
}

describe("same-category benchmark radar", () => {
  it("compares the target account mean to the median of eligible peer-account means", () => {
    const target: BenchmarkRadarInput = { accountId: "target", samples: samples(Array.from({ length: 6 }, () => ({ likes: 100, comments: 5 }))) };
    const peers = [
      { accountId: "a", samples: samples(Array.from({ length: 10 }, () => ({ likes: 20, comments: 2 }))) },
      { accountId: "b", samples: samples(Array.from({ length: 8 }, () => ({ likes: 40, comments: 4 }))) },
      { accountId: "c", samples: samples(Array.from({ length: 5 }, () => ({ likes: 60, comments: 6 }))) },
      { accountId: "target", samples: samples(Array.from({ length: 20 }, () => ({ likes: 999, comments: 99 }))) },
    ];
    const result = buildBenchmarkCohortRadar(target, peers);
    expect(result.axes.find((axis) => axis.key === "likes")).toMatchObject({ targetMean: 100, peerMedian: 40, eligiblePeers: 3, ratio: 2.5, chartRatio: 2, available: true });
    expect(result.axes.find((axis) => axis.key === "comments")?.peerMedian).toBe(4);
    expect(result.compared).toBe(true);
    expect(result.peerAccountCount).toBe(3);
  });

  it("does not create a score when the peer count or metric coverage is insufficient", () => {
    const target: BenchmarkRadarInput = { accountId: "target", samples: samples(Array.from({ length: 4 }, () => ({ likes: 20 }))) };
    const result = buildBenchmarkCohortRadar(target, [{ accountId: "a", samples: samples(Array.from({ length: 8 }, () => ({ likes: 10 }))) }]);
    expect(result.compared).toBe(false);
    expect(result.axes.find((axis) => axis.key === "likes")).toMatchObject({ available: false, targetKnown: 4, eligiblePeers: 1 });
  });
});
