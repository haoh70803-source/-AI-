import "server-only";

import { randomUUID } from "node:crypto";
import { db, type Prisma } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { RedFoxClient, RedFoxError, RedFoxTrendProvider, type TrendProvider, type TrendProviderResult } from "@content-center/providers";
import { listTrendOpportunities, trendWindowRange } from "./read-model";
import type { TrendPlatformFilter, TrendTypeFilter, TrendWindowInput } from "./schemas";

const TREND_CACHE_TTL_MS = 20 * 60 * 1_000;
const trendCache = new Map<string, { expiresAt: number; value: TrendProviderResult }>();

export type TrendServiceErrorCode =
  | "TREND_PROVIDER_UNCONFIGURED"
  | "TREND_FETCH_FAILED"
  | "TREND_RATE_LIMITED"
  | "TREND_NO_DATA"
  | "TREND_NOT_FOUND"
  | "TREND_KEYWORD_REQUIRED"
  | "TREND_AI_NOT_CONFIGURED"
  | "TREND_AI_GENERATION_FAILED"
  | "TREND_DUPLICATE_IDEA";

export class TrendServiceError extends Error {
  constructor(readonly code: TrendServiceErrorCode, message: string) { super(message); this.name = "TrendServiceError"; }
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

async function defaultProvider(workspaceId: string): Promise<TrendProvider> {
  const integrations = new IntegrationService();
  const status = await integrations.getIntegrationStatus(workspaceId, "REDFOX");
  if (status.status !== "CONFIGURED") throw new TrendServiceError("TREND_PROVIDER_UNCONFIGURED", "趋势数据服务尚未配置。");
  const config = await integrations.getDecryptedIntegrationConfig(workspaceId, "REDFOX");
  if (!config || typeof config.apiKey !== "string" || !config.apiKey.trim()) throw new TrendServiceError("TREND_PROVIDER_UNCONFIGURED", "趋势数据服务尚未配置。");
  return new RedFoxTrendProvider(new RedFoxClient({ apiKey: config.apiKey, baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined }));
}

function operation(platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL", type: TrendTypeFilter) {
  if (platform === "DOUYIN" && type === "HOT") return "TREND_DOUYIN_HOT";
  if (platform === "DOUYIN") return "TREND_DOUYIN_SURGE";
  if (platform === "XIAOHONGSHU" && type === "DARK_HORSE") return "TREND_XHS_DARK_HORSE";
  if (platform === "XIAOHONGSHU") return "TREND_XHS_HOT";
  return "TREND_GLOBAL";
}

function requestedPlatforms(platform: TrendPlatformFilter, type: TrendTypeFilter) {
  const supported = type === "HOT"
    ? ["DOUYIN", "XIAOHONGSHU", "GLOBAL"] as const
    : type === "SURGING"
      ? ["DOUYIN"] as const
      : ["XIAOHONGSHU"] as const;
  return platform === "ALL" ? [...supported] : supported.includes(platform as never) ? [platform as (typeof supported)[number]] : [];
}

async function providerCall(input: {
  workspaceId: string;
  userId: string;
  platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL";
  type: TrendTypeFilter;
  window: TrendWindowInput;
  keyword?: string;
  force: boolean;
  provider: TrendProvider;
  range: ReturnType<typeof trendWindowRange>;
}) {
  const cacheKey = `${input.workspaceId}:${operation(input.platform, input.type)}:${input.window}:${input.keyword ?? ""}`;
  const hit = trendCache.get(cacheKey);
  if (!input.force && hit && hit.expiresAt > Date.now()) return { ...hit.value, cached: true as const };
  if (hit) trendCache.delete(cacheKey);
  const startedAt = Date.now();
  const requestId = `trend:${randomUUID()}`;
  try {
    const value = input.type === "HOT"
      ? await input.provider.getHot({ platform: input.platform, window: input.window, startDate: input.range.startDate, endDate: input.range.endDate })
      : input.type === "SURGING"
        ? await input.provider.getSurging({ platform: "DOUYIN", window: input.window, startDate: input.range.startDate, endDate: input.range.endDate })
        : await input.provider.getDarkHorse({ platform: "XIAOHONGSHU", window: input.window, startDate: input.range.startDate, endDate: input.range.endDate, keyword: input.keyword ?? "" });
    await db.apiUsage.create({ data: { workspaceId: input.workspaceId, userId: input.userId, provider: "REDFOX", operation: operation(input.platform, input.type), requestId, providerRequestId: value.providerRequestId, success: true, units: 1, cost: null, metadata: json({ durationMs: Date.now() - startedAt, window: input.window }) } });
    trendCache.set(cacheKey, { expiresAt: Date.now() + TREND_CACHE_TTL_MS, value });
    return { ...value, cached: false as const };
  } catch (error) {
    const errorCode = error instanceof RedFoxError ? error.code : "TREND_FETCH_FAILED";
    await db.apiUsage.create({ data: { workspaceId: input.workspaceId, userId: input.userId, provider: "REDFOX", operation: operation(input.platform, input.type), requestId, success: false, units: 1, cost: null, metadata: json({ durationMs: Date.now() - startedAt, window: input.window, errorCode }) } }).catch(() => undefined);
    if (error instanceof RedFoxError && error.code === "REDFOX_RATE_LIMITED") throw new TrendServiceError("TREND_RATE_LIMITED", "趋势服务请求较多，请稍后再试。");
    throw error;
  }
}

export async function refreshTrends(input: {
  workspaceId: string;
  userId: string;
  window: TrendWindowInput;
  platform: TrendPlatformFilter;
  type: TrendTypeFilter;
  keyword?: string;
  force: boolean;
  now?: Date;
}, dependencies: { provider?: TrendProvider } = {}) {
  if (input.type === "DARK_HORSE" && !input.keyword?.trim()) throw new TrendServiceError("TREND_KEYWORD_REQUIRED", "查看小红书黑马趋势前，请输入一个明确的关注主题。");
  const platforms = requestedPlatforms(input.platform, input.type);
  if (!platforms.length) return { items: [], cached: true, unsupported: true };
  const provider = dependencies.provider ?? await defaultProvider(input.workspaceId);
  const range = trendWindowRange(input.window, input.now);
  const results = await Promise.all(platforms.map((platform) => providerCall({ ...input, platform, provider, range })));
  const freshItems = results.filter((result) => !result.cached).flatMap((result) => result.items);
  if (freshItems.length) {
    const observedAt = input.now ?? new Date();
    await db.trendSnapshot.createMany({ data: freshItems.map((item) => ({
      workspaceId: input.workspaceId,
      provider: item.sourceProvider,
      platform: item.platform,
      trendType: item.type,
      externalKey: item.externalKey,
      title: item.title,
      keyword: item.keyword,
      rank: item.rank,
      metrics: json(item.metrics),
      windowStart: range.start,
      windowEnd: range.end,
      observedAt,
    })) });
    await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.trends_refreshed", resourceType: "trend_snapshot", metadata: json({ platform: input.platform, type: input.type, window: input.window, sourceCount: platforms.length, snapshotCount: freshItems.length, forced: input.force }) } });
  }
  const items = await listTrendOpportunities({ workspaceId: input.workspaceId, window: input.window, platform: input.platform, type: input.type, now: input.now });
  if (!items.length) throw new TrendServiceError("TREND_NO_DATA", "当前筛选条件暂时没有可用趋势数据。");
  return { items, cached: results.every((result) => result.cached), unsupported: false };
}

export const SUPPORTED_TREND_FILTERS = {
  HOT: ["ALL", "DOUYIN", "XIAOHONGSHU", "GLOBAL"],
  SURGING: ["ALL", "DOUYIN"],
  DARK_HORSE: ["ALL", "XIAOHONGSHU"],
} as const;

export function clearTrendCacheForTests() { trendCache.clear(); }
