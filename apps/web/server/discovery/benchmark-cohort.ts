export type BenchmarkRadarMetric = "likes" | "comments" | "shares" | "favorites" | "durationMs";
export type BenchmarkRadarSample = Record<BenchmarkRadarMetric, number | null>;
export type BenchmarkRadarInput = { accountId: string; samples: BenchmarkRadarSample[] };

const labels: Record<BenchmarkRadarMetric, string> = { likes: "点赞", comments: "评论", shares: "转发", favorites: "收藏", durationMs: "平均时长" };
const metrics: BenchmarkRadarMetric[] = ["likes", "comments", "shares", "favorites", "durationMs"];
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export function buildBenchmarkCohortRadar(target: BenchmarkRadarInput, peers: BenchmarkRadarInput[]) {
  const axes = metrics.map((key) => {
    const targetValues = target.samples.map((sample) => sample[key]).filter((value): value is number => value !== null && Number.isFinite(value));
    const targetCoverage = target.samples.length ? targetValues.length / target.samples.length : 0;
    const peerMeans = peers.filter((peer) => peer.accountId !== target.accountId).flatMap((peer) => {
      const values = peer.samples.map((sample) => sample[key]).filter((value): value is number => value !== null && Number.isFinite(value));
      return values.length >= 5 && peer.samples.length > 0 && values.length / peer.samples.length >= 0.5 ? [mean(values)!] : [];
    });
    const targetMean = mean(targetValues);
    const peerMedian = median(peerMeans);
    const available = targetValues.length >= 5 && targetCoverage >= 0.5 && peerMeans.length >= 3 && peerMedian !== null && peerMedian > 0 && targetMean !== null;
    const ratio = available ? targetMean! / peerMedian! : null;
    return {
      key,
      label: labels[key],
      targetMean,
      peerMedian,
      targetKnown: targetValues.length,
      targetTotal: target.samples.length,
      eligiblePeers: peerMeans.length,
      available,
      ratio,
      chartRatio: ratio === null ? null : Math.max(0.5, Math.min(2, ratio)),
      unavailableReason: available ? null : targetValues.length < 5 || targetCoverage < 0.5 ? "本账号有效样本不足 5 条或覆盖率低于 50%" : peerMeans.length < 3 ? "满足覆盖门槛的同类账号少于 3 个" : "同类中位值为 0，无法计算相对值",
    };
  });
  return { axes, compared: axes.filter((axis) => axis.available).length >= 3, peerAccountCount: peers.filter((peer) => peer.accountId !== target.accountId).length };
}
