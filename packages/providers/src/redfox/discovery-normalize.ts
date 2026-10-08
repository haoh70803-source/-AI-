import { RedFoxError } from "./errors";
import type { DiscoveryPlatform, ExternalAccount, ExternalContent, ExternalContentType, ExternalResultPage } from "./discovery";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function valueAt(source: JsonRecord, keys: readonly string[]): unknown {
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return undefined;
}

function nested(source: JsonRecord, keys: readonly string[]): JsonRecord | null {
  for (const key of keys) {
    const candidate = record(source[key]);
    if (candidate) return candidate;
  }
  return null;
}

function url(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function imageUrl(value: unknown): string | null {
  const direct = url(value);
  if (direct) return direct;
  const source = record(value);
  if (!source) return null;
  const list = valueAt(source, ["urlList", "url_list", "urls"]);
  return Array.isArray(list) ? url(list[0]) : url(valueAt(source, ["url", "uri"]));
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const numeric = Number(raw);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(raw.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function itemList(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(record).filter((item): item is JsonRecord => Boolean(item));
  const source = record(value);
  if (!source) return [];
  for (const key of ["list", "items", "records", "works", "notes", "users", "accounts", "awemeList", "aweme_list"]) {
    if (Array.isArray(source[key])) return itemList(source[key]);
  }
  for (const key of ["data", "result", "page", "pageInfo"]) {
    const child = source[key];
    if (child && child !== value) {
      const found = itemList(child);
      if (found.length) return found;
    }
  }
  return [];
}

function pageMeta(value: unknown) {
  const source = record(value) ?? {};
  const nestedData = record(source.data) ?? record(source.result) ?? {};
  const combined = { ...source, ...nestedData };
  const total = number(valueAt(combined, ["total", "totalCount", "count"]));
  const hasMoreValue = valueAt(combined, ["hasMore", "has_more"]);
  const hasMore = typeof hasMoreValue === "boolean" ? hasMoreValue : number(hasMoreValue) === null ? null : number(hasMoreValue) !== 0;
  const rawOffset = number(valueAt(combined, ["nextOffset", "next_offset", "max_cursor", "cursor", "offset"]));
  const nextOffset = rawOffset !== null && Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : null;
  return { total, hasMore, nextOffset };
}

function defaultContentUrl(platform: DiscoveryPlatform, externalId: string) {
  return platform === "DOUYIN"
    ? `https://www.douyin.com/video/${encodeURIComponent(externalId)}`
    : `https://www.xiaohongshu.com/explore/${encodeURIComponent(externalId)}`;
}

function contentType(item: JsonRecord): ExternalContentType {
  const raw = (text(valueAt(item, ["awemeType", "aweme_type", "type", "noteType", "mediaType"])) ?? "").toLowerCase();
  if (raw.includes("video") || raw === "0") return "VIDEO";
  if (raw.includes("photo") || raw.includes("image") || raw.includes("图文")) return "IMAGE";
  if (raw.includes("article") || raw.includes("text")) return "ARTICLE";
  return "UNKNOWN";
}

export function normalizeExternalContent(platform: DiscoveryPlatform, item: unknown): ExternalContent {
  const source = record(item);
  if (!source) throw new RedFoxError("REDFOX_INVALID_RESPONSE", "RedFox 内容数据结构无效。", false);
  const author = nested(source, ["author", "user", "account", "authorInfo", "userInfo"]) ?? {};
  const stats = nested(source, ["statistics", "stats", "metrics", "interactInfo"]) ?? source;
  const externalId = text(valueAt(source, ["awemeId", "aweme_id", "videoId", "workId", "noteId", "note_id", "opusId", "id"]));
  if (!externalId) throw new RedFoxError("REDFOX_INVALID_RESPONSE", "RedFox 内容缺少稳定标识。", false);
  const originalUrl = url(valueAt(source, ["originalUrl", "shareUrl", "share_url", "workUrl", "noteUrl", "url", "link"])) ?? defaultContentUrl(platform, externalId);
  const duration = number(valueAt(source, ["durationMs", "duration", "videoDuration"]));
  return {
    externalId,
    platform,
    contentType: contentType(source),
    title: text(valueAt(source, ["title", "noteTitle", "name"])) ?? text(valueAt(source, ["desc", "description", "content"])),
    description: text(valueAt(source, ["description", "desc", "content", "noteDesc"])),
    authorId: text(valueAt(author, ["secUid", "sec_uid", "userId", "uid", "accountId", "redId", "id"])) ?? text(valueAt(source, ["authorId", "userId"])),
    authorName: text(valueAt(author, ["nickname", "name", "accountName"])) ?? text(valueAt(source, ["authorName", "nickname", "author"])),
    authorAvatarUrl: imageUrl(valueAt(author, ["avatarUrl", "avatar", "avatarThumb", "image"])),
    coverUrl: imageUrl(valueAt(source, ["coverUrl", "cover", "dynamicCover", "imageUrl", "noteCover", "images"])),
    originalUrl,
    publishedAt: isoDate(valueAt(source, ["publishedAt", "publishTime", "createTime", "create_time", "time"])),
    metrics: {
      views: number(valueAt(stats, ["views", "viewCount", "playCount", "play_count"])),
      likes: number(valueAt(stats, ["likes", "likeCount", "diggCount", "digg_count"])),
      comments: number(valueAt(stats, ["comments", "commentCount", "comment_count"])),
      shares: number(valueAt(stats, ["shares", "shareCount", "share_count"])),
      favorites: number(valueAt(stats, ["favorites", "favoriteCount", "collectCount", "collect_count"])),
    },
    durationMs: duration === null ? null : duration < 10_000 ? duration * 1000 : duration,
    sourceProvider: "REDFOX",
    rawProviderMetadata: source,
  };
}

export function normalizeExternalAccount(platform: DiscoveryPlatform, item: unknown): ExternalAccount {
  const source = record(item);
  if (!source) throw new RedFoxError("REDFOX_INVALID_RESPONSE", "RedFox 账号数据结构无效。", false);
  const externalId = text(valueAt(source, ["accountId", "uniqueId", "unique_id", "redId", "userId", "userid", "secUid", "sec_uid", "uid", "id"]));
  const name = text(valueAt(source, ["nickname", "name", "accountName", "userName"]));
  if (!externalId || !name) throw new RedFoxError("REDFOX_INVALID_RESPONSE", "RedFox 账号缺少稳定标识或名称。", false);
  const originalUrl = url(valueAt(source, ["originalUrl", "authorUrl", "profileUrl", "url", "link"]));
  return {
    externalId,
    platform,
    name,
    avatarUrl: imageUrl(valueAt(source, ["avatarUrl", "avatar", "avatarThumb", "image"])),
    bio: text(valueAt(source, ["bio", "signature", "description", "desc"])),
    followers: number(valueAt(source, ["followers", "followerCount", "fansCount", "fans"])),
    likes: number(valueAt(source, ["likes", "totalFavorited", "likedCount", "likeCount"])),
    originalUrl,
    sourceProvider: "REDFOX",
    rawProviderMetadata: source,
  };
}

export function normalizeContentPage(platform: DiscoveryPlatform, value: unknown): ExternalResultPage<ExternalContent> {
  const meta = pageMeta(value);
  const items = itemList(value).map((item) => normalizeExternalContent(platform, item));
  return { items, ...meta };
}

export function normalizeAccountPage(platform: DiscoveryPlatform, value: unknown): ExternalResultPage<ExternalAccount> {
  const meta = pageMeta(value);
  const items = itemList(value).map((item) => normalizeExternalAccount(platform, item));
  return { items, ...meta };
}
