import type { SourceMediaReference } from "../types";
import { RedFoxError } from "./errors";
import { extractRedFoxContentUrl, mapRedFoxPlatform } from "./platform";
import type { RedFoxParseData } from "./schemas";

export type ResolvedSource = {
  provider: "REDFOX";
  providerMode: "REAL";
  sourceType: "VIDEO" | "IMAGE";
  sourcePlatform: "DOUYIN" | "XIAOHONGSHU";
  originalUrl: string;
  resolvedUrl?: string;
  title?: string;
  author?: string;
  description?: string;
  thumbnailUrl?: string;
  media: SourceMediaReference[];
  providerMetadata: { externalId?: string; awemeType: string };
  providerRaw: { platform: string; awemeType: string };
};

function text(value: string | null | undefined): string | undefined {
  return value?.trim() || undefined;
}

export function normalizeRedFoxSource(data: RedFoxParseData, originalUrl: string): ResolvedSource {
  const sourcePlatform = data.platform
    ? mapRedFoxPlatform(data.platform)
    : extractRedFoxContentUrl(originalUrl).platform;
  const awemeType = data.awemeType.trim().toLowerCase();
  let sourceType: "VIDEO" | "IMAGE";
  let media: SourceMediaReference[];

  if (awemeType === "video") {
    if (!data.videoUrl) throw new RedFoxError("REDFOX_MEDIA_MISSING", "RedFox 未返回视频资源。", false);
    sourceType = "VIDEO";
    media = [{ type: "VIDEO", url: data.videoUrl }];
  } else if (awemeType === "photo") {
    if (!data.imageUrls?.length) throw new RedFoxError("REDFOX_MEDIA_MISSING", "RedFox 未返回图文资源。", false);
    sourceType = "IMAGE";
    media = data.imageUrls.map((url, index) => ({ type: "IMAGE", url, index }));
  } else {
    throw new RedFoxError(
      "REDFOX_UNSUPPORTED_CONTENT_TYPE",
      "RedFox 返回了当前阶段不支持的内容类型。",
      false,
      undefined,
      data.awemeType,
    );
  }

  return {
    provider: "REDFOX",
    providerMode: "REAL",
    sourceType,
    sourcePlatform,
    originalUrl,
    title: text(data.title),
    author: text(data.author) ?? text(data.authorName),
    description: text(data.description) ?? text(data.desc),
    thumbnailUrl: data.coverUrl ?? data.cover ?? undefined,
    media,
    providerMetadata: {
      externalId: data.awemeId === null || data.awemeId === undefined ? undefined : String(data.awemeId),
      awemeType: data.awemeType,
    },
    providerRaw: { platform: data.platform ?? sourcePlatform, awemeType: data.awemeType },
  };
}
