import "server-only";

import { randomUUID } from "node:crypto";
import { normalizeSourceUrl } from "@content-center/core";
import { db, type Prisma } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import {
  RedFoxClient,
  RedFoxDiscoveryProvider,
  RedFoxError,
  createSourceExternalMetadata,
  type DiscoveryPlatform,
  type ExternalAccount,
  type ExternalContent,
} from "@content-center/providers";
import { addProjectSource, createProject } from "../project-service";
import { createSourceAndJob } from "../source-service";
import type { ExternalAccountInput, ExternalContentInput } from "./schemas";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const integrations = new IntegrationService();

export class DiscoveryServiceError extends Error {
  constructor(
    readonly code:
      | "REDFOX_NOT_CONFIGURED"
      | "REDFOX_DISABLED"
      | "DISCOVERY_NOT_FOUND"
      | "DISCOVERY_DUPLICATE"
      | "IDEA_REFERENCES_REQUIRE_COLLECTION",
    message: string,
  ) {
    super(message);
    this.name = "DiscoveryServiceError";
  }
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function publicContent(item: ExternalContent): ExternalContentInput {
  const safe = { ...item };
  delete safe.rawProviderMetadata;
  return safe;
}

function publicAccount(item: ExternalAccount): ExternalAccountInput {
  const safe = { ...item };
  delete safe.rawProviderMetadata;
  return safe;
}

async function providerFor(workspaceId: string) {
  const status = await integrations.getIntegrationStatus(workspaceId, "REDFOX");
  if (status.status === "DISABLED") throw new DiscoveryServiceError("REDFOX_DISABLED", "内容数据服务已停用，请联系管理员。");
  if (status.status !== "CONFIGURED") throw new DiscoveryServiceError("REDFOX_NOT_CONFIGURED", "内容数据服务尚未配置，请联系管理员。");
  const config = await integrations.getDecryptedIntegrationConfig(workspaceId, "REDFOX");
  if (!config || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
    throw new DiscoveryServiceError("REDFOX_NOT_CONFIGURED", "内容数据服务尚未配置，请联系管理员。");
  }
  return new RedFoxDiscoveryProvider(new RedFoxClient({
    apiKey: config.apiKey,
    baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
  }));
}

async function recordUsage(input: {
  workspaceId: string;
  userId: string;
  operation: string;
  requestId: string;
  success: boolean;
  durationMs: number;
  providerRequestId?: string;
  errorCode?: string;
}) {
  await db.apiUsage.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: "REDFOX",
      operation: input.operation,
      requestId: input.requestId,
      providerRequestId: input.providerRequestId,
      success: input.success,
      units: 1,
      cost: null,
      metadata: inputJson({ durationMs: input.durationMs, errorCode: input.errorCode }),
    },
  });
}

async function cachedProviderCall<T extends { providerRequestId?: string }>(input: {
  workspaceId: string;
  userId: string;
  operation: string;
  cacheKey: string;
  call: (provider: RedFoxDiscoveryProvider) => Promise<T>;
}): Promise<T & { cached: boolean }> {
  const key = `${input.workspaceId}:${input.operation}:${input.cacheKey}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { ...(hit.value as T), cached: true };
  if (hit) cache.delete(key);
  const provider = await providerFor(input.workspaceId);
  const startedAt = Date.now();
  const requestId = `discovery:${randomUUID()}`;
  try {
    const value = await input.call(provider);
    await recordUsage({ ...input, requestId, success: true, durationMs: Date.now() - startedAt, providerRequestId: value.providerRequestId });
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return { ...value, cached: false };
  } catch (error) {
    await recordUsage({
      ...input,
      requestId,
      success: false,
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof RedFoxError ? error.code : "REDFOX_API_ERROR",
    }).catch(() => undefined);
    throw error;
  }
}

function platforms(value: "ALL" | DiscoveryPlatform): DiscoveryPlatform[] {
  return value === "ALL" ? ["DOUYIN", "XIAOHONGSHU"] : [value];
}

function sortType(sort: "RECOMMENDED" | "LATEST" | "POPULAR") {
  return sort === "LATEST" ? "2" : sort === "POPULAR" ? "4" : undefined;
}

export async function searchDiscoveryContent(input: {
  workspaceId: string;
  userId: string;
  query: string;
  platform: "ALL" | DiscoveryPlatform;
  sort: "RECOMMENDED" | "LATEST" | "POPULAR";
}) {
  const results = await Promise.all(platforms(input.platform).map(async (platform) => {
    const page = await cachedProviderCall({
      ...input,
      operation: `DISCOVERY_SEARCH_CONTENT_${platform}`,
      cacheKey: JSON.stringify({ q: input.query, platform, sort: input.sort }),
      call: (provider) => provider.contentSearch.search({ platform, keyword: input.query, sortType: sortType(input.sort) }),
    });
    return page;
  }));
  const seen = new Set<string>();
  const items = results.flatMap((page) => page.items).filter((item) => {
    const key = `${item.platform}:${item.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(publicContent);
  const existing = items.length
    ? await db.sourceItem.findMany({
        where: { workspaceId: input.workspaceId, OR: items.map((item) => ({ sourcePlatform: item.platform, externalId: item.externalId })) },
        select: { id: true, sourcePlatform: true, externalId: true },
      })
    : [];
  const sourceIds = new Map(existing.map((item) => [`${item.sourcePlatform}:${item.externalId}`, item.id]));
  return { items: items.map((item) => ({ ...item, sourceItemId: sourceIds.get(`${item.platform}:${item.externalId}`) ?? null })), cached: results.every((item) => item.cached) };
}

export async function searchDiscoveryAccounts(input: {
  workspaceId: string;
  userId: string;
  query: string;
  platform: "ALL" | DiscoveryPlatform;
}) {
  const results = await Promise.all(platforms(input.platform).map(async (platform) => cachedProviderCall({
    ...input,
    operation: `DISCOVERY_SEARCH_ACCOUNT_${platform}`,
    cacheKey: JSON.stringify({ q: input.query, platform }),
    call: (provider) => provider.accountSearch.search({ platform, keyword: input.query }),
  })));
  const seen = new Set<string>();
  const items = results.flatMap((page) => page.items).filter((item) => {
    const key = `${item.platform}:${item.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(publicAccount);
  return { items, cached: results.every((item) => item.cached) };
}

export async function getDiscoveryContentDetail(input: {
  workspaceId: string;
  userId: string;
  url: string;
  platform: DiscoveryPlatform;
}) {
  const result = await cachedProviderCall({
    ...input,
    operation: `DISCOVERY_WORK_DETAIL_${input.platform}`,
    cacheKey: input.url,
    call: (provider) => provider.workDetail.get({ platform: input.platform, url: input.url }),
  });
  const item = publicContent(result.item);
  const existing = await db.sourceItem.findFirst({
    where: {
      workspaceId: input.workspaceId,
      OR: [
        { sourcePlatform: item.platform, externalId: item.externalId },
        { canonicalUrl: normalizeSourceUrl(item.originalUrl) },
      ],
    },
    select: { id: true },
  });
  return { items: [{ ...item, sourceItemId: existing?.id ?? null }], cached: result.cached };
}

export async function getDiscoveryAccountDetail(input: {
  workspaceId: string;
  userId: string;
  accountId: string;
  userIdHint?: string;
  platform: DiscoveryPlatform;
}) {
  const result = await cachedProviderCall({
    ...input,
    operation: `DISCOVERY_ACCOUNT_DETAIL_${input.platform}`,
    cacheKey: JSON.stringify({ accountId: input.accountId, userId: input.userIdHint }),
    call: (provider) => provider.accountDetail.get({ platform: input.platform, accountId: input.accountId, userId: input.userIdHint }),
  });
  return { items: [publicAccount(result.item)], cached: result.cached };
}

export async function getBenchmarkWorks(input: { workspaceId: string; userId: string; benchmarkId: string; sort: "LATEST" | "POPULAR"; offset?: number }) {
  const benchmark = await db.benchmarkAccount.findFirst({ where: { id: input.benchmarkId, workspaceId: input.workspaceId, enabled: true } });
  if (!benchmark) throw new DiscoveryServiceError("DISCOVERY_NOT_FOUND", "对标账号不存在。");
  const page = await cachedProviderCall({
    ...input,
    operation: `DISCOVERY_ACCOUNT_WORKS_${benchmark.platform}`,
    cacheKey: JSON.stringify({ id: benchmark.externalAccountId, sort: input.sort, offset: input.offset ?? 0 }),
    call: (provider) => provider.accountWorks.list({
      platform: benchmark.platform as DiscoveryPlatform,
      accountId: benchmark.externalAccountId,
      offset: input.offset ?? 0,
      sortType: input.sort === "LATEST" ? "2" : "4",
    }),
  });

  const items = page.items.map(publicContent);
  await db.$transaction(async (tx) => {
    for (const item of items) {
      const previous = await tx.benchmarkContentSnapshot.findUnique({ where: { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: item.platform, externalId: item.externalId } }, select: { metadata: true } });
      const previousMetadata = previous?.metadata && typeof previous.metadata === "object" && !Array.isArray(previous.metadata) ? previous.metadata : {};
      const snapshot = await tx.benchmarkContentSnapshot.upsert({
    where: { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: item.platform, externalId: item.externalId } },
    create: {
      workspaceId: input.workspaceId,
      benchmarkAccountId: benchmark.id,
      platform: item.platform,
      externalId: item.externalId,
      title: item.title || item.description || "未命名对标内容",
      url: item.originalUrl,
      authorName: item.authorName,
      coverUrl: item.coverUrl,
      metadata: inputJson({ contentType: item.contentType, description: item.description?.slice(0, 500) ?? null, metrics: item.metrics, durationMs: item.durationMs }),
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
    },
    update: {
      title: item.title || item.description || "未命名对标内容",
      url: item.originalUrl,
      authorName: item.authorName,
      coverUrl: item.coverUrl,
      metadata: inputJson({ ...previousMetadata, contentType: item.contentType, description: item.description?.slice(0, 500) ?? null, metrics: item.metrics, durationMs: item.durationMs }),
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      ...(page.cached ? {} : { observedAt: new Date() }),
    },
      });
      if (snapshot.benchmarkAccountId !== benchmark.id) throw new DiscoveryServiceError("DISCOVERY_DUPLICATE", "返回作品已属于另一个对标账号，本次刷新未保存。请核对账号身份。");
      if (!page.cached) await tx.benchmarkMetricObservation.create({ data: { snapshotId: snapshot.id, metrics: inputJson(item.metrics) } });
    }
  });
  if (!page.cached) await db.benchmarkAccount.update({ where: { id: benchmark.id }, data: { lastSyncedAt: new Date() } });
  const [sources, ideaReferences] = await Promise.all([
    items.length ? db.sourceItem.findMany({ where: { workspaceId: input.workspaceId, OR: items.map((item) => ({ sourcePlatform: item.platform, externalId: item.externalId })) }, select: { id: true, sourcePlatform: true, externalId: true } }) : [],
    items.length ? db.contentIdeaReference.findMany({ where: { idea: { workspaceId: input.workspaceId }, OR: items.map((item) => ({ platform: item.platform, externalId: item.externalId })) }, select: { platform: true, externalId: true } }) : [],
  ]);
  const sourceIds = new Map(sources.map((item) => [`${item.sourcePlatform}:${item.externalId}`, item.id]));
  const ideaKeys = new Set(ideaReferences.map((item) => `${item.platform}:${item.externalId}`));
  const nextOffset = page.hasMore !== false && page.nextOffset !== null && page.nextOffset !== undefined && page.nextOffset > (input.offset ?? 0) ? page.nextOffset : null;
  return { items: items.map((item) => ({ ...item, sourceItemId: sourceIds.get(`${item.platform}:${item.externalId}`) ?? null, inIdea: ideaKeys.has(`${item.platform}:${item.externalId}`) })), cached: page.cached, hasMore: page.hasMore, nextOffset,
    coverage: nextOffset !== null ? "MORE_AVAILABLE" : page.hasMore === false ? "PROVIDER_EXHAUSTED" : "PAGINATION_UNAVAILABLE" };
}

export function listBenchmarks(workspaceId: string, take = 12) {
  return db.benchmarkAccount.findMany({
    where: { workspaceId, enabled: true },
    orderBy: { updatedAt: "desc" },
    take,
    include: { contentSnapshots: { orderBy: { observedAt: "desc" }, take: 1, select: { title: true, observedAt: true } } },
  });
}

export async function addBenchmark(input: { workspaceId: string; userId: string; account: Omit<ExternalAccountInput, "sourceProvider">; purpose?: string }) {
  const creatorProfile = await db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { id: true } });
  try {
    return await db.$transaction(async (tx) => {
      const item = await tx.benchmarkAccount.create({
        data: {
          workspaceId: input.workspaceId,
          creatorProfileId: creatorProfile?.id,
          platform: input.account.platform,
          externalAccountId: input.account.externalId,
          name: input.account.name,
          researchNotes: input.purpose?.trim() || null,
          avatarUrl: input.account.avatarUrl,
          bio: input.account.bio,
          originalUrl: input.account.originalUrl,
          createdById: input.userId,
        },
      });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.benchmark_added", resourceType: "benchmark_account", resourceId: item.id, metadata: { platform: item.platform, externalAccountId: item.externalAccountId } } });
      return item;
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new DiscoveryServiceError("DISCOVERY_DUPLICATE", "该账号已在我的对标中。");
    throw error;
  }
}

export async function disableBenchmark(input: { workspaceId: string; userId: string; benchmarkId: string }) {
  const item = await db.benchmarkAccount.findFirst({ where: { id: input.benchmarkId, workspaceId: input.workspaceId } });
  if (!item) throw new DiscoveryServiceError("DISCOVERY_NOT_FOUND", "对标账号不存在。");
  await db.$transaction([
    db.benchmarkAccount.update({ where: { id: item.id }, data: { enabled: false } }),
    db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.benchmark_disabled", resourceType: "benchmark_account", resourceId: item.id, metadata: { platform: item.platform, externalAccountId: item.externalAccountId } } }),
  ]);
}

export function listIdeas(workspaceId: string, take = 20) {
  return db.contentIdea.findMany({
    where: { workspaceId, status: { not: "ARCHIVED" } },
    include: { _count: { select: { references: true } }, references: { where: { sourceItemId: { not: null } }, select: { id: true } } },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export function getIdea(workspaceId: string, ideaId: string) {
  return db.contentIdea.findFirst({ where: { id: ideaId, workspaceId }, include: { references: { orderBy: { createdAt: "desc" }, include: { trendSnapshot: true } }, project: { select: { id: true } } } });
}

export async function createIdea(input: { workspaceId: string; userId: string; title: string; description?: string; reference?: ExternalContentInput; sourceItemId?: string; deduplicateSource?: boolean }) {
  const creatorProfile = await db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, select: { id: true } });
  const source = input.sourceItemId ? await db.sourceItem.findFirst({ where: { id: input.sourceItemId, workspaceId: input.workspaceId }, select: { id: true, title: true, sourcePlatform: true, externalId: true, sourceUrl: true, updatedAt: true } }) : null;
  if (input.sourceItemId && !source) throw new DiscoveryServiceError("DISCOVERY_NOT_FOUND", "素材不存在。");
  return db.$transaction(async (tx) => {
    if (input.deduplicateSource && source) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"research-topic:" + input.workspaceId + ":" + input.userId + ":" + source.id + ":" + input.title}))`;
      const previous = await tx.contentIdea.findFirst({ where: { workspaceId: input.workspaceId, createdById: input.userId, title: input.title, status: { not: "ARCHIVED" }, references: { some: { sourceItemId: source.id } } } });
      if (previous) return previous;
    }
    const idea = await tx.contentIdea.create({ data: { workspaceId: input.workspaceId, creatorProfileId: creatorProfile?.id, title: input.title, description: input.description || null, createdById: input.userId } });
    if (input.reference) await tx.contentIdeaReference.create({ data: { ...referenceData(idea.id, input.reference), sourceItemId: source?.id } });
    if (source && !input.reference) await tx.contentIdeaReference.create({ data: { ideaId: idea.id, sourceItemId: source.id, platform: source.sourcePlatform, externalId: source.externalId || source.id, title: source.title || "来源资料", url: source.sourceUrl || "/library/" + source.id, metadataSnapshot: inputJson({ referenceType: "MATERIAL", sourceVersion: source.updatedAt.toISOString() }) } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.idea_created", resourceType: "content_idea", resourceId: idea.id, metadata: { hasReference: Boolean(input.reference || source) } } });
    return idea;
  });
}

function referenceData(ideaId: string, reference: ExternalContentInput) {
  return {
    ideaId,
    platform: reference.platform,
    externalId: reference.externalId,
    title: reference.title || reference.description || "未命名参考内容",
    url: reference.originalUrl,
    authorName: reference.authorName,
    coverUrl: reference.coverUrl,
    metadataSnapshot: inputJson({ referenceType: "EXTERNAL_CONTENT", contentType: reference.contentType, metrics: reference.metrics, publishedAt: reference.publishedAt }),
  };
}

export async function addIdeaReference(input: { workspaceId: string; userId: string; ideaId: string; reference: ExternalContentInput }) {
  const idea = await db.contentIdea.findFirst({ where: { id: input.ideaId, workspaceId: input.workspaceId }, select: { id: true } });
  if (!idea) throw new DiscoveryServiceError("DISCOVERY_NOT_FOUND", "选题不存在。");
  try {
    return await db.contentIdeaReference.create({ data: referenceData(idea.id, input.reference) });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new DiscoveryServiceError("DISCOVERY_DUPLICATE", "该内容已在选题中。");
    throw error;
  }
}

export async function updateIdea(input: { workspaceId: string; userId: string; ideaId: string; data: { title?: string; description?: string | null; status?: "INBOX" | "READY" | "IN_PROGRESS" | "DONE" | "ARCHIVED" } }) {
  const idea = await db.contentIdea.findFirst({ where: { id: input.ideaId, workspaceId: input.workspaceId } });
  if (!idea) throw new DiscoveryServiceError("DISCOVERY_NOT_FOUND", "选题不存在。");
  const updated = await db.contentIdea.update({ where: { id: idea.id }, data: input.data });
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.idea_updated", resourceType: "content_idea", resourceId: idea.id, metadata: { from: idea.status, to: updated.status, changedFields: Object.keys(input.data) } } });
  return updated;
}

export async function collectExternalContent(input: { workspaceId: string; userId: string; content: ExternalContentInput }) {
  const canonicalUrl = normalizeSourceUrl(input.content.originalUrl);
  const existing = await db.sourceItem.findFirst({ where: { workspaceId: input.workspaceId, OR: [{ sourcePlatform: input.content.platform, externalId: input.content.externalId }, { canonicalUrl }] } });
  if (existing) return { sourceItem: existing, created: false as const };
  const created = await createSourceAndJob({
    workspaceId: input.workspaceId,
    userId: input.userId,
    source: {
      kind: "REDFOX",
      url: input.content.originalUrl,
      externalId: input.content.externalId,
      title: input.content.title ?? undefined,
      author: input.content.authorName ?? undefined,
      description: input.content.description ?? undefined,
      thumbnailUrl: input.content.coverUrl ?? undefined,
      contentType: input.content.contentType,
      externalMetadata: createSourceExternalMetadata({
        platform: input.content.platform,
        externalId: input.content.externalId,
        originalTitle: input.content.title,
        description: input.content.description,
        authorId: input.content.authorId,
        authorName: input.content.authorName,
        authorAvatarUrl: input.content.authorAvatarUrl,
        publishedAt: input.content.publishedAt,
        originalUrl: input.content.originalUrl,
        coverUrl: input.content.coverUrl,
        durationMs: input.content.durationMs,
        topics: [],
        metrics: input.content.metrics,
        providerCrawlTime: null,
      }),
    },
  });
  await db.$transaction([
    db.contentIdeaReference.updateMany({ where: { idea: { workspaceId: input.workspaceId }, platform: input.content.platform, externalId: input.content.externalId, sourceItemId: null }, data: { sourceItemId: created.sourceItem.id } }),
    db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.content_collected", resourceType: "source_item", resourceId: created.sourceItem.id, metadata: { platform: input.content.platform, externalId: input.content.externalId } } }),
  ]);
  return { sourceItem: created.sourceItem, created: true as const };
}

export async function createProjectFromExternalContent(input: { workspaceId: string; userId: string; content: ExternalContentInput }) {
  const collected = await collectExternalContent(input);
  const project = await createProject({ workspaceId: input.workspaceId, userId: input.userId, title: input.content.title || "来自内容发现的创作项目", description: input.content.description ?? undefined, sourceItemId: collected.sourceItem.id });
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.project_created", resourceType: "content_project", resourceId: project.id, metadata: { sourceItemId: collected.sourceItem.id, platform: input.content.platform, externalId: input.content.externalId } } });
  return { project, sourceItem: collected.sourceItem };
}

export async function startIdeaProject(input: { workspaceId: string; userId: string; ideaId: string; collectMissing: boolean }) {
  const idea = await getIdea(input.workspaceId, input.ideaId);
  if (!idea) throw new DiscoveryServiceError("DISCOVERY_NOT_FOUND", "选题不存在。");
  if (idea.project) return { projectId: idea.project.id, existing: true as const };
  const missing = idea.references.filter((reference) => !reference.sourceItemId && !reference.trendSnapshotId);
  if (missing.length && !input.collectMissing) throw new DiscoveryServiceError("IDEA_REFERENCES_REQUIRE_COLLECTION", "该选题有尚未收录的参考内容，请确认后再开始创作。");
  const sourceIds = idea.references.flatMap((reference) => reference.sourceItemId ? [reference.sourceItemId] : []);
  if (input.collectMissing) {
    for (const reference of missing) {
      const metadata = reference.metadataSnapshot && typeof reference.metadataSnapshot === "object" && !Array.isArray(reference.metadataSnapshot) ? reference.metadataSnapshot as Record<string, unknown> : {};
      const collected = await collectExternalContent({
        workspaceId: input.workspaceId,
        userId: input.userId,
        content: {
          externalId: reference.externalId,
          platform: reference.platform as DiscoveryPlatform,
          contentType: ["VIDEO", "IMAGE", "ARTICLE", "UNKNOWN"].includes(String(metadata.contentType)) ? metadata.contentType as ExternalContentInput["contentType"] : "UNKNOWN",
          title: reference.title,
          description: null,
          authorId: null,
          authorName: reference.authorName,
          authorAvatarUrl: null,
          coverUrl: reference.coverUrl,
          originalUrl: reference.url,
          publishedAt: typeof metadata.publishedAt === "string" ? metadata.publishedAt : null,
          metrics: { views: null, likes: null, comments: null, shares: null, favorites: null },
          durationMs: null,
          sourceProvider: "REDFOX",
        },
      });
      sourceIds.push(collected.sourceItem.id);
    }
  }
  const project = await createProject({ workspaceId: input.workspaceId, userId: input.userId, title: idea.title, description: idea.description ?? undefined, sourceItemId: sourceIds[0] });
  for (const sourceItemId of sourceIds.slice(1)) await addProjectSource({ workspaceId: input.workspaceId, userId: input.userId, projectId: project.id, sourceItemId, role: "REFERENCE" });
  await db.$transaction([
    db.contentIdea.update({ where: { id: idea.id }, data: { projectId: project.id, status: "IN_PROGRESS" } }),
    db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "discovery.idea_started", resourceType: "content_idea", resourceId: idea.id, metadata: { projectId: project.id, sourceCount: sourceIds.length } } }),
  ]);
  return { projectId: project.id, existing: false as const };
}

export function clearDiscoveryCacheForTests() {
  cache.clear();
}
