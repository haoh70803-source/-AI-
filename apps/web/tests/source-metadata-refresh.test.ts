import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import {
  RedFoxClient,
  RedFoxDiscoveryProvider,
  createSourceExternalMetadata,
  createSourceMetadataEnvelope,
  readSourceMetadataEnvelope,
} from "@content-center/providers";
import { canRefreshSourceMetadata, refreshSourceExternalMetadata } from "../server/source-metadata-service";

describe("source metadata refresh", () => {
  const runId = randomUUID();
  const userId = `metadata-refresh-${runId}`;
  let workspaceId = "";
  let sourceItemId = "";

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, name: "Metadata Refresh", email: `${userId}@example.test` } });
    const workspace = await db.workspace.create({ data: { name: "Metadata Refresh", slug: `metadata-refresh-${runId}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const source = await db.sourceItem.create({
      data: {
        workspaceId,
        createdById: userId,
        sourceType: "VIDEO",
        sourcePlatform: "DOUYIN",
        sourceProvider: "REDFOX",
        sourceUrl: "https://www.douyin.com/video/refresh-work",
        canonicalUrl: "https://www.douyin.com/video/refresh-work",
        externalId: "refresh-work",
        title: "刷新前标题",
        status: "READY",
        metadata: createSourceMetadataEnvelope(createSourceExternalMetadata({
          platform: "DOUYIN",
          externalId: "refresh-work",
          originalTitle: "刷新前标题",
          description: null,
          authorId: null,
          authorName: null,
          authorAvatarUrl: null,
          publishedAt: null,
          originalUrl: "https://www.douyin.com/video/refresh-work",
          coverUrl: null,
          durationMs: null,
          topics: [],
          metrics: { views: null, likes: null, favorites: 99, comments: null, shares: null },
          providerFetchedAt: "2026-09-01T09:00:00.000Z",
          providerCrawlTime: null,
        })),
      },
    });
    sourceItemId = source.id;
    await db.sourceAsset.create({ data: { workspaceId, sourceItemId, assetType: "VIDEO", sourceProvider: "REDFOX", remoteUrl: "https://example.test/video.mp4", status: "REMOTE" } });
    await db.ingestJob.create({ data: { workspaceId, sourceItemId, requestedById: userId, jobType: "PROCESS_MEDIA", provider: "REDFOX", providerMode: "REAL", status: "SUCCEEDED" } });
    await db.transcript.create({ data: { workspaceId, sourceItemId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: "保留的转写", segments: [] } });
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("uses the same external-call permission boundary as Content Discovery", () => {
    expect(canRefreshSourceMetadata("VIEWER")).toBe(false);
    expect(canRefreshSourceMetadata("EDITOR")).toBe(true);
    expect(canRefreshSourceMetadata("ADMIN")).toBe(true);
    expect(canRefreshSourceMetadata("OWNER")).toBe(true);
  });

  it("updates the existing source only and records one explicit RedFox usage", async () => {
    let calls = 0;
    const provider = new RedFoxDiscoveryProvider(new RedFoxClient({
      apiKey: "ak_refresh_test",
      fetch: async (_url, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({ workId: "refresh-work", workUrl: "https://www.douyin.com/video/refresh-work" });
        return new Response(JSON.stringify({
          code: 2000,
          requestId: "refresh-request",
          data: {
            awemeId: "refresh-work",
            awemeType: "video",
            title: "刷新后标题",
            desc: "刷新后的作品说明",
            author: { uid: "author-refresh", nickname: "刷新作者", avatarUrl: "https://example.test/avatar.jpg" },
            statistics: { playCount: 120_000, diggCount: 12_800, commentCount: 66, shareCount: 7 },
            shareUrl: "https://www.douyin.com/video/refresh-work",
            coverUrl: "https://example.test/cover.jpg",
            publishTime: 1_777_665_600,
            duration: 32,
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    }));
    const before = {
      sources: await db.sourceItem.count({ where: { workspaceId } }),
      assets: await db.sourceAsset.count({ where: { sourceItemId } }),
      jobs: await db.ingestJob.count({ where: { sourceItemId } }),
      transcripts: await db.transcript.count({ where: { sourceItemId } }),
    };

    const result = await refreshSourceExternalMetadata({
      workspaceId,
      userId,
      sourceItemId,
      provider,
      now: new Date("2026-09-02T09:00:00.000Z"),
    });

    expect(calls).toBe(1);
    expect(result.external).toMatchObject({
      originalTitle: "刷新后标题",
      authorName: "刷新作者",
      durationMs: 32_000,
      metrics: { views: 120_000, likes: 12_800, comments: 66, shares: 7, favorites: null },
      providerFetchedAt: "2026-09-02T09:00:00.000Z",
    });
    const stored = await db.sourceItem.findUniqueOrThrow({ where: { id: sourceItemId } });
    expect(stored).toMatchObject({ title: "刷新后标题", author: "刷新作者", description: "刷新后的作品说明" });
    expect(readSourceMetadataEnvelope(stored.metadata)?.external.metrics.favorites).toBeNull();
    await expect(db.sourceItem.count({ where: { workspaceId } })).resolves.toBe(before.sources);
    await expect(db.sourceAsset.count({ where: { sourceItemId } })).resolves.toBe(before.assets);
    await expect(db.ingestJob.count({ where: { sourceItemId } })).resolves.toBe(before.jobs);
    await expect(db.transcript.count({ where: { sourceItemId } })).resolves.toBe(before.transcripts);
    await expect(db.apiUsage.count({ where: { workspaceId, provider: "REDFOX", operation: "SOURCE_METADATA_REFRESH_DOUYIN" } })).resolves.toBe(1);
  });
});
