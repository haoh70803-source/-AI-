import "server-only";

import { randomUUID } from "node:crypto";
import type { WorkspaceRole } from "@content-center/core";
import { db, type Prisma } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import {
  RedFoxClient,
  RedFoxDiscoveryProvider,
  RedFoxError,
  createSourceExternalMetadata,
  createSourceMetadataEnvelope,
  mergeSourceExternalMetadata,
  readSourceMetadataEnvelope,
} from "@content-center/providers";

const integrations = new IntegrationService();

export class SourceMetadataRefreshError extends Error {
  constructor(
    readonly code:
      | "SOURCE_NOT_FOUND"
      | "SOURCE_METADATA_NOT_SUPPORTED"
      | "SOURCE_METADATA_IDENTITY_MISMATCH"
      | "REDFOX_NOT_CONFIGURED"
      | "REDFOX_DISABLED",
    message: string,
  ) {
    super(message);
    this.name = "SourceMetadataRefreshError";
  }
}

export function canRefreshSourceMetadata(role: WorkspaceRole) {
  return role !== "VIEWER";
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function providerFor(workspaceId: string) {
  const status = await integrations.getIntegrationStatus(workspaceId, "REDFOX");
  if (status.status === "DISABLED") throw new SourceMetadataRefreshError("REDFOX_DISABLED", "内容数据服务已停用，请联系管理员。");
  if (status.status !== "CONFIGURED") throw new SourceMetadataRefreshError("REDFOX_NOT_CONFIGURED", "内容数据服务尚未配置，请联系管理员。");
  const config = await integrations.getDecryptedIntegrationConfig(workspaceId, "REDFOX");
  if (!config || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
    throw new SourceMetadataRefreshError("REDFOX_NOT_CONFIGURED", "内容数据服务尚未配置，请联系管理员。");
  }
  return new RedFoxDiscoveryProvider(new RedFoxClient({
    apiKey: config.apiKey,
    baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
  }));
}

export async function refreshSourceExternalMetadata(input: {
  workspaceId: string;
  userId: string;
  sourceItemId: string;
  provider?: RedFoxDiscoveryProvider;
  now?: Date;
}) {
  const source = await db.sourceItem.findFirst({
    where: { id: input.sourceItemId, workspaceId: input.workspaceId },
    select: {
      id: true,
      sourcePlatform: true,
      sourceProvider: true,
      sourceUrl: true,
      canonicalUrl: true,
      externalId: true,
      title: true,
      author: true,
      description: true,
      thumbnailUrl: true,
      metadata: true,
      updatedAt: true,
    },
  });
  if (!source) throw new SourceMetadataRefreshError("SOURCE_NOT_FOUND", "素材不存在。");
  if (
    source.sourceProvider !== "REDFOX"
    || (source.sourcePlatform !== "DOUYIN" && source.sourcePlatform !== "XIAOHONGSHU")
    || (!source.externalId && !source.sourceUrl && !source.canonicalUrl)
  ) {
    throw new SourceMetadataRefreshError("SOURCE_METADATA_NOT_SUPPORTED", "该素材不支持刷新作品数据。");
  }

  const provider = input.provider ?? await providerFor(input.workspaceId);
  const requestId = `source-metadata-refresh:${randomUUID()}`;
  const startedAt = Date.now();
  const operation = `SOURCE_METADATA_REFRESH_${source.sourcePlatform}`;
  try {
    const result = await provider.workDetail.get({
      platform: source.sourcePlatform,
      externalId: source.externalId ?? undefined,
      url: source.sourceUrl ?? source.canonicalUrl ?? undefined,
    });
    if (source.externalId && result.item.externalId !== source.externalId) {
      throw new SourceMetadataRefreshError("SOURCE_METADATA_IDENTITY_MISMATCH", "数据服务返回了不同作品，未更新当前素材。");
    }
    const providerFetchedAt = input.now ?? new Date();
    const refreshed = createSourceExternalMetadata({
      platform: result.item.platform,
      externalId: result.item.externalId,
      originalTitle: result.item.title,
      description: result.item.description,
      authorId: result.item.authorId,
      authorName: result.item.authorName,
      authorAvatarUrl: result.item.authorAvatarUrl,
      publishedAt: result.item.publishedAt,
      originalUrl: result.item.originalUrl,
      coverUrl: result.item.coverUrl,
      durationMs: result.item.durationMs,
      topics: [],
      metrics: result.item.metrics,
      providerFetchedAt: providerFetchedAt.toISOString(),
      providerCrawlTime: null,
    });
    const previous = readSourceMetadataEnvelope(source.metadata);
    const legacyExternal = previous?.external ?? createSourceExternalMetadata({
      platform: source.sourcePlatform,
      externalId: source.externalId,
      originalTitle: source.title,
      description: source.description,
      authorId: null,
      authorName: source.author,
      authorAvatarUrl: null,
      publishedAt: null,
      originalUrl: source.sourceUrl ?? source.canonicalUrl!,
      coverUrl: source.thumbnailUrl,
      durationMs: null,
      topics: [],
      metrics: { views: null, likes: null, favorites: null, comments: null, shares: null },
      providerFetchedAt: source.updatedAt.toISOString(),
      providerCrawlTime: null,
    });
    const external = {
      ...mergeSourceExternalMetadata(legacyExternal, refreshed),
      // A manual refresh is the authoritative observation for volatile metrics.
      // Missing values must remain null instead of surfacing stale counts as current.
      metrics: refreshed.metrics,
      providerCrawlTime: refreshed.providerCrawlTime,
    };
    const [updated] = await db.$transaction([
      db.sourceItem.update({
        where: { id: source.id },
        data: {
          externalId: external.externalId,
          title: external.originalTitle,
          description: external.description,
          author: external.authorName,
          thumbnailUrl: external.coverUrl,
          metadata: json(createSourceMetadataEnvelope(external, previous?.ingest)),
        },
      }),
      db.apiUsage.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          provider: "REDFOX",
          operation,
          requestId,
          providerRequestId: result.providerRequestId,
          success: true,
          units: 1,
          cost: null,
          metadata: json({ durationMs: Date.now() - startedAt, sourceItemId: source.id }),
        },
      }),
      db.auditLog.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          action: "source.metadata_refreshed",
          resourceType: "source_item",
          resourceId: source.id,
          metadata: json({ provider: "REDFOX", platform: source.sourcePlatform, providerRequestId: result.providerRequestId }),
        },
      }),
    ]);
    return { sourceItem: updated, external };
  } catch (error) {
    await db.apiUsage.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        provider: "REDFOX",
        operation,
        requestId,
        success: false,
        units: 1,
        cost: null,
        metadata: json({
          durationMs: Date.now() - startedAt,
          sourceItemId: source.id,
          errorCode: error instanceof RedFoxError || error instanceof SourceMetadataRefreshError ? error.code : "REDFOX_API_ERROR",
        }),
      },
    });
    throw error;
  }
}
