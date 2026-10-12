import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { RedFoxClient, RedFoxDiscoveryProvider, RedFoxTrendProvider, RedFoxError, type ExternalContent } from "@content-center/providers";
import { compareAuthorLikes, TEARDOWN_BASELINE_POLICY, timedTranscript, type BaselineSample, type TeardownWork, type TeardownTrendContext } from "@content-center/core";
import { requestSourceTranscription, TranscriptionAlreadyRunningError } from "../transcription";
import { reserveExperienceUsage } from "../experience-limits";
import type { TeardownPayload } from "./queue";

export async function readTeardownMaterial(payload: TeardownPayload, sourceItemId: string) {
  const source = await db.sourceItem.findFirst({ where: { id: sourceItemId, workspaceId: payload.workspaceId, sourcePlatform: "DOUYIN", status: { not: "ARCHIVED" } }, include: { transcript: true, ingestJobs: { orderBy: { createdAt: "desc" }, take: 20 } } });
  if (!source) throw new Error("TEARDOWN_MATERIAL_NOT_FOUND");
  return source;
}
export function readTeardownTranscript(source: Awaited<ReturnType<typeof readTeardownMaterial>>) {
  if (!source.transcript || source.transcript.workspaceId !== source.workspaceId) return null;
  return { id: source.transcript.id, segments: timedTranscript(source.transcript.segments) };
}
export async function ensureTeardownTranscription(payload: TeardownPayload, sourceItemId: string) {
  try { return (await requestSourceTranscription({ workspaceId: payload.workspaceId, requestedById: payload.requestedById, sourceItemId })).job.id; }
  catch (error) { if (error instanceof TranscriptionAlreadyRunningError) return error.jobId; throw error; }
}

/** Scoped recent evidence or one bounded provider call; a missing hotspot never blocks content analysis. */
export async function collectTeardownTrendContext(payload: TeardownPayload): Promise<TeardownTrendContext> {
  const now = new Date(), checkedAt = now.toISOString();
  const cached = await db.trendSnapshot.findMany({ where: { workspaceId: payload.workspaceId, platform: "GLOBAL", trendType: "HOT", observedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000), lte: now } }, orderBy: [{ observedAt: "desc" }, { rank: "asc" }], take: 40, select: { id: true, title: true, platform: true, observedAt: true, windowStart: true, windowEnd: true } });
  if (cached.length) return { checkedAt, gap: null, sources: cached.map(row => ({ ...row, observedAt: row.observedAt.toISOString(), windowStart: row.windowStart.toISOString(), windowEnd: row.windowEnd.toISOString() })) };
  const integrations = new IntegrationService();
  const config = await integrations.getDecryptedIntegrationConfig(payload.workspaceId, "REDFOX");
  if (!config || typeof config.apiKey !== "string" || (await integrations.getIntegrationStatus(payload.workspaceId, "REDFOX")).status !== "CONFIGURED") return { checkedAt, gap: "未取得当下热点来源；常见主题不能视为当前热点。", sources: [] };
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const windowStart = `${date}T00:00:00+08:00`, windowEnd = now.toISOString();
  let release: (() => Promise<void>) | undefined;
  try {
    release = await reserveExperienceUsage({ workspaceId: payload.workspaceId, userId: payload.requestedById, operation: "SEARCH", quotaOnly: true });
    const provider = new RedFoxTrendProvider(new RedFoxClient({ apiKey: config.apiKey, baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined, timeoutMs: 15_000 }));
    const result = await provider.getHot({ platform: "GLOBAL", window: "TODAY", startDate: date, endDate: date });
    await db.apiUsage.create({ data: { workspaceId: payload.workspaceId, userId: payload.requestedById, provider: "REDFOX", operation: "TEARDOWN_TREND_CONTEXT", requestId: payload.runId, providerRequestId: result.providerRequestId, success: true, units: 1 } });
    return { checkedAt, gap: result.items.length ? null : "热点接口未返回数据，不能判断是否与当下热点有关。", sources: result.items.slice(0, 40).map((row, index) => ({ id: `T${index + 1}`, title: row.title.slice(0, 500), platform: row.platform, observedAt: checkedAt, windowStart, windowEnd })) };
  } catch (error) {
    await db.apiUsage.create({ data: { workspaceId: payload.workspaceId, userId: payload.requestedById, provider: "REDFOX", operation: "TEARDOWN_TREND_CONTEXT", requestId: payload.runId, success: false, units: 1, metadata: { errorCode: error instanceof RedFoxError ? error.code : "TREND_CONTEXT_UNAVAILABLE" } } }).catch(() => undefined);
    return { checkedAt, gap: "本次未能取得可核实的热点证据；继续分析内容受众与长期需求，不推断当前热度。", sources: [] };
  } finally { await release?.(); }
}

function pinned(item: ExternalContent): boolean | null {
  const raw = item.rawProviderMetadata ?? {};
  for (const key of ["is_top", "isTop", "is_pinned", "isPinned", "is_top_video"]) {
    const value = raw[key];
    if (value === true || value === 1 || value === "1") return true;
    if (value === false || value === 0 || value === "0") return false;
  }
  return null;
}
export async function collectTeardownPublicData(payload: TeardownPayload, source: { externalId: string | null; sourceUrl: string | null; title?: string | null; author?: string | null }) {
  const integrations = new IntegrationService();
  const status = await integrations.getIntegrationStatus(payload.workspaceId, "REDFOX");
  if (status.status !== "CONFIGURED") throw new Error("TEARDOWN_REDFOX_NOT_CONFIGURED");
  const config = await integrations.getDecryptedIntegrationConfig(payload.workspaceId, "REDFOX");
  if (!config || typeof config.apiKey !== "string") throw new Error("TEARDOWN_REDFOX_NOT_CONFIGURED");
  const provider = new RedFoxDiscoveryProvider(new RedFoxClient({ apiKey: config.apiKey, baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined }));
  async function call<T extends { providerRequestId?: string }>(operation: string, request: () => Promise<T>): Promise<T> {
    const release = await reserveExperienceUsage({ workspaceId: payload.workspaceId, userId: payload.requestedById, operation: "SEARCH", quotaOnly: true });
    let result: T | undefined;
    let failure: unknown;
    try { result = await request(); return result; }
    catch (error) { failure = error; throw error; }
    finally {
      await release();
      await db.apiUsage.create({ data: { workspaceId: payload.workspaceId, userId: payload.requestedById, provider: "REDFOX", operation, requestId: payload.runId, providerRequestId: result?.providerRequestId ?? (failure instanceof RedFoxError ? failure.providerRequestId : undefined), success: Boolean(result), units: 1, metadata: { module: "teardown", ...(failure instanceof RedFoxError ? { errorCode: failure.code, providerCode: failure.providerCode } : {}) } } });
    }
  }
  let detail: Awaited<ReturnType<typeof provider.workDetail.get>>;
  try {
    detail = await call("TEARDOWN_WORK_DETAIL", () => provider.workDetail.get({ platform: "DOUYIN", externalId: source.externalId ?? undefined, url: source.sourceUrl ?? undefined }));
  } catch (error) {
    // Only explicit missing-data responses permit transcript-only analysis.
    // Authentication, quota, transport and invalid-response errors remain visible failures.
    const missing = error instanceof RedFoxError && (error.code === "REDFOX_EMPTY_DATA" || (error.code === "REDFOX_API_ERROR" && !error.retryable && /未查询到相关数据|优质库暂未收录/.test(error.message)));
    if (!missing || !source.sourceUrl) throw error;
    const capturedAt = new Date().toISOString();
    const work: TeardownWork = { externalId: source.externalId, title: source.title ?? "抖音作品拆解", authorId: null, authorName: source.author ?? null, url: source.sourceUrl, publishedAt: null, capturedAt, publicDataStatus: "UNAVAILABLE", metrics: { likes: null, comments: null, shares: null, favorites: null, views: null } };
    return { work, baseline: compareAuthorLikes(work, [], capturedAt, ["红狐未返回该作品的公开数据（未收录或无数据）。数据不足，无法比较作者近期表现；已继续基于转写生成内容拆解报告。"]) };
  }
  if (!detail.item.externalId || detail.item.platform !== "DOUYIN" || (source.externalId && detail.item.externalId !== source.externalId)) throw new Error("TEARDOWN_IDENTITY_MISMATCH");
  const capturedAt = new Date().toISOString();
  const item = detail.item;
  const work: TeardownWork = { externalId: item.externalId, title: item.title ?? "抖音作品拆解", authorId: item.authorId, authorName: item.authorName, url: item.originalUrl, publishedAt: item.publishedAt, capturedAt, metrics: item.metrics };
  const samples: BaselineSample[] = [], gaps: string[] = [];
  let offset = 0;
  if (item.authorId) for (let page = 0; page < TEARDOWN_BASELINE_POLICY.maxPages; page++) {
    try {
      // Default author publication order; never ask for the most-liked ranking as a recent baseline.
      const result = await call("TEARDOWN_AUTHOR_WORKS", () => provider.accountWorks.list({ platform: "DOUYIN", accountId: item.authorId!, offset }));
      samples.push(...result.items.map(row => ({ externalId: row.externalId, authorId: row.authorId, title: row.title ?? "作者作品", url: row.originalUrl, publishedAt: row.publishedAt, likes: row.metrics.likes, pinned: pinned(row) })));
      if (!result.items.length || result.hasMore === false) break;
      const next = result.nextOffset ?? offset + result.items.length;
      if (next <= offset) { gaps.push("作者作品分页未前进，已停止采集。" ); break; }
      offset = next;
      if (page === TEARDOWN_BASELINE_POLICY.maxPages - 1) gaps.push("已达到最多3页的采集上限，近期作品可能未全部覆盖。" );
    } catch { gaps.push("作者近期作品接口未完成，比较仅使用已采集的有效样本。" ); break; }
  } else gaps.push("作品接口未返回作者标识，无法获取作者近期作品。" );
  return { work, baseline: compareAuthorLikes(work, samples, new Date().toISOString(), gaps) };
}
