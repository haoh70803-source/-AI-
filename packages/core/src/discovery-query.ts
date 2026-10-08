import { detectSourcePlatform } from "./source-domain";

export const DISCOVERY_QUERY_TYPES = ["KEYWORD", "ACCOUNT_QUERY", "ACCOUNT_URL", "CONTENT_URL"] as const;
export type DiscoveryQueryType = (typeof DISCOVERY_QUERY_TYPES)[number];

export type DiscoveryQueryResolution = {
  type: DiscoveryQueryType;
  value: string;
  platform: "DOUYIN" | "XIAOHONGSHU" | null;
};

function firstHttpUrl(input: string): URL | null {
  const match = input.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  try {
    return new URL(match[0].replace(/[),.;!?\]}>，。；！？）】》」』]+$/u, ""));
  } catch {
    return null;
  }
}

export function resolveDiscoveryQuery(input: string): DiscoveryQueryResolution {
  const value = input.trim();
  const parsed = firstHttpUrl(value);
  if (!parsed) return { type: "KEYWORD", value, platform: null };
  const platform = detectSourcePlatform(parsed.toString());
  if (platform !== "DOUYIN" && platform !== "XIAOHONGSHU") {
    return { type: "CONTENT_URL", value: parsed.toString(), platform: null };
  }
  const path = parsed.pathname.toLowerCase();
  const account = platform === "DOUYIN"
    ? path.startsWith("/user/")
    : path.startsWith("/user/profile/");
  return { type: account ? "ACCOUNT_URL" : "CONTENT_URL", value: parsed.toString(), platform };
}
