export const SUPPORTED_PLATFORMS = ["DOUYIN", "XIAOHONGSHU", "WECHAT_MOMENTS", "WECHAT_CHANNELS", "WECHAT_OFFICIAL"] as const;
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<SupportedPlatform, string> = {
  DOUYIN: "抖音",
  XIAOHONGSHU: "小红书",
  WECHAT_MOMENTS: "朋友圈",
  WECHAT_CHANNELS: "视频号",
  WECHAT_OFFICIAL: "公众号",
};

export type PlatformParameters = {
  duration?: 30 | 60 | 90;
  style?: "VIEWPOINT" | "EXPERIENCE" | "LIST";
  variantType?: "SHORT" | "VIEWPOINT" | "STORY";
};

export type PlatformVariantView = {
  id: string;
  platform: SupportedPlatform;
  version: number;
  title: string | null;
  body: string;
  hook: string | null;
  summary: string | null;
  hashtags: string[];
  mediaPlan: unknown;
  metadata: unknown;
  status: "DRAFT" | "READY" | "STALE" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
  sourceMotherVersion: number;
  isStale: boolean;
};
