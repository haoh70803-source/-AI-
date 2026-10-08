import { normalizeSourceUrl } from "@content-center/core";
import { RedFoxError } from "./errors";

const TRAILING_SHARE_PUNCTUATION = /[),.;!?\]}>，。；！？）】》」』]+$/u;

export function isSupportedDouyinUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "v.douyin.com") return url.pathname.length > 1;
    if (host === "www.iesdouyin.com" || host === "iesdouyin.com") return /^\/share\/(video|note)\/[A-Za-z0-9_-]+(?:\/|$)/.test(url.pathname);
    if (host !== "douyin.com" && host !== "www.douyin.com") return false;
    return /^\/(video|note)\/[A-Za-z0-9_-]+(?:\/|$)/.test(url.pathname) ||
      (url.pathname === "/jingxuan" && Boolean(url.searchParams.get("modal_id")));
  } catch {
    return false;
  }
}

export function extractDouyinShareUrl(input: string): string {
  const candidates = input
    .trim()
    .match(/https?:\/\/[^\s<>"']+/giu)
    ?.map((candidate) => candidate.replace(TRAILING_SHARE_PUNCTUATION, ""))
    .filter(isSupportedDouyinUrl) ?? [];
  const unique = [...new Set(candidates.map((candidate) => normalizeSourceUrl(candidate)))];
  if (unique.length > 1) {
    throw new RedFoxError("AMBIGUOUS_DOUYIN_URL", "检测到多个抖音链接，请每次只提交一个。", false);
  }
  const url = unique[0];
  if (!url) throw new RedFoxError("INVALID_DOUYIN_URL", "请输入有效的抖音作品分享链接。", false);
  return url;
}

export function isSupportedXiaohongshuUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "xhslink.com" || host.endsWith(".xhslink.com")) return url.pathname.length > 1;
    if (host !== "xiaohongshu.com" && !host.endsWith(".xiaohongshu.com")) return false;
    return /^\/(explore|discovery\/item)\/[A-Za-z0-9_-]+(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

export function extractRedFoxContentUrl(input: string): { url: string; platform: "DOUYIN" | "XIAOHONGSHU" } {
  const candidates = input
    .trim()
    .match(/https?:\/\/[^\s<>"']+/giu)
    ?.map((candidate) => candidate.replace(TRAILING_SHARE_PUNCTUATION, ""))
    .map((candidate) => ({
      url: candidate,
      platform: isSupportedDouyinUrl(candidate) ? "DOUYIN" as const : isSupportedXiaohongshuUrl(candidate) ? "XIAOHONGSHU" as const : null,
    }))
    .filter((candidate): candidate is { url: string; platform: "DOUYIN" | "XIAOHONGSHU" } => Boolean(candidate.platform)) ?? [];
  const unique = [...new Map(candidates.map((candidate) => [normalizeSourceUrl(candidate.url), candidate.platform])).entries()];
  if (unique.length > 1) throw new RedFoxError("AMBIGUOUS_REDFOX_URL", "检测到多个内容链接，请每次只提交一个。", false);
  const [url, platform] = unique[0] ?? [];
  if (!url || !platform) throw new RedFoxError("INVALID_REDFOX_URL", "请输入有效的抖音或小红书作品链接。", false);
  return { url, platform };
}

export function mapRedFoxPlatform(platform: string): "DOUYIN" | "XIAOHONGSHU" {
  const normalized = platform.trim().toLowerCase();
  if (["dy", "douyin", "抖音"].includes(normalized)) return "DOUYIN";
  if (["xhs", "xiaohongshu", "小红书"].includes(normalized)) return "XIAOHONGSHU";
  throw new RedFoxError(
    "REDFOX_UNSUPPORTED_PLATFORM",
    "RedFox 返回了当前阶段未开放的平台。",
    false,
    undefined,
    platform,
  );
}
