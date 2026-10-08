export function formatMetricCount(value: number): string {
  const count = Math.max(0, Math.trunc(value));
  if (count < 10_000) return count.toLocaleString("zh-CN");
  const divisor = count >= 100_000_000 ? 100_000_000 : 10_000;
  const unit = divisor === 100_000_000 ? "亿" : "万";
  const amount = count / divisor;
  const digits = amount >= 100 ? 0 : 1;
  return `${amount.toFixed(digits).replace(/\.0$/, "")}${unit}`;
}

export function exactMetricCount(value: number): string {
  return value.toLocaleString("zh-CN");
}
