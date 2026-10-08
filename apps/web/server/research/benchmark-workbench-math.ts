/** Pure reference parsing and same-account statistics; never fetch a submitted URL. */
export function parseBenchmarkHomepage(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw Error("请输入完整的账号主页链接。"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || value.length > 2000) throw Error("主页必须是无凭证的 HTTPS 链接。");
  const host = url.hostname.toLowerCase();
  const platform = ["douyin.com", "www.douyin.com"].includes(host) ? "DOUYIN" : ["xiaohongshu.com", "www.xiaohongshu.com"].includes(host) ? "XIAOHONGSHU" : null;
  const match = platform === "DOUYIN" ? /^\/user\/([A-Za-z0-9_-]{1,300})\/?$/.exec(url.pathname) : platform === "XIAOHONGSHU" ? /^\/user\/profile\/([A-Za-z0-9_-]{1,300})\/?$/.exec(url.pathname) : null;
  if (!platform || !match) throw Error("目前仅支持抖音 / 小红书完整账号主页；短链和作品链接请先打开主页。");
  return { platform, externalId: match[1]!, originalUrl: url.origin + url.pathname.replace(/\/$/, "") } as { platform: "DOUYIN" | "XIAOHONGSHU"; externalId: string; originalUrl: string };
}
export function metric(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
export function benchmarkBaseline(values: Array<number | null>, minimum = 5) {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0).sort((a,b) => a-b);
  const mid = Math.floor(known.length / 2), median = known.length ? known.length % 2 ? known[mid]! : (known[mid-1]! + known[mid]!) / 2 : null;
  return { samples: known.length, median: known.length >= minimum && median !== null && median > 0 ? median : null, reason: known.length < minimum ? "至少需要 5 条可比较作品" : median === 0 ? "中位数为 0，无法计算倍数" : null };
}
export function safeResearchReturn(value?: string) {
  if (!value || value.length > 3000 || /[\\\r\n]/.test(value)) return "/research/benchmarks#works";
  try { const url = new URL(value, "https://local.invalid"); return url.origin === "https://local.invalid" && (url.pathname === "/research/works" || url.pathname === "/research/benchmarks" || /^\/research\/benchmarks\/[A-Za-z0-9_-]+$/.test(url.pathname)) ? url.pathname + url.search + url.hash : "/research/benchmarks#works"; } catch { return "/research/benchmarks#works"; }
}
