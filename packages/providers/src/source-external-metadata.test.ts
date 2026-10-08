import { describe, expect, it } from "vitest";
import {
  createSourceExternalMetadata,
  createSourceMetadataEnvelope,
  mergeSourceExternalMetadata,
  readSourceMetadataEnvelope,
} from "./source-external-metadata";

describe("SourceExternalMetadata", () => {
  it("keeps normalized provider fields and never turns missing metrics into zero", () => {
    const external = createSourceExternalMetadata({
      platform: "DOUYIN",
      externalId: "work-1",
      originalTitle: "真实作品",
      description: "作品说明",
      authorId: "author-1",
      authorName: "创作者",
      authorAvatarUrl: "https://example.test/avatar.jpg",
      publishedAt: "2026-09-01T08:00:00.000Z",
      originalUrl: "https://www.douyin.com/video/work-1",
      coverUrl: "https://example.test/cover.jpg",
      durationMs: 32_000,
      topics: ["内容创作", "内容创作", "AI"],
      metrics: { views: 9_800, likes: 128, favorites: null, comments: null, shares: 6 },
      providerFetchedAt: "2026-09-02T08:00:00.000Z",
      providerCrawlTime: null,
    });

    expect(external).toMatchObject({
      schemaVersion: 1,
      topics: ["内容创作", "AI"],
      metrics: { views: 9_800, likes: 128, favorites: null, comments: null, shares: 6 },
      sourceProvider: "REDFOX",
    });
    expect(readSourceMetadataEnvelope(createSourceMetadataEnvelope(external))).toEqual(createSourceMetadataEnvelope(external));
  });

  it("preserves richer collected metadata when parseWork omits optional fields", () => {
    const previous = createSourceExternalMetadata({
      platform: "DOUYIN",
      externalId: "work-2",
      originalTitle: "发现阶段标题",
      description: "发现阶段说明",
      authorId: "author-2",
      authorName: "发现作者",
      authorAvatarUrl: null,
      publishedAt: "2026-08-01T00:00:00.000Z",
      originalUrl: "https://www.douyin.com/video/work-2",
      coverUrl: null,
      durationMs: 15_000,
      topics: [],
      metrics: { views: null, likes: 88, favorites: null, comments: 3, shares: null },
      providerFetchedAt: "2026-09-01T00:00:00.000Z",
      providerCrawlTime: null,
    });
    const parsed = createSourceExternalMetadata({
      platform: "DOUYIN",
      externalId: "work-2",
      originalTitle: "解析阶段标题",
      description: null,
      authorId: null,
      authorName: null,
      authorAvatarUrl: null,
      publishedAt: null,
      originalUrl: "https://www.douyin.com/video/work-2",
      coverUrl: null,
      durationMs: null,
      topics: [],
      metrics: { views: null, likes: null, favorites: null, comments: null, shares: null },
      providerFetchedAt: "2026-09-02T00:00:00.000Z",
      providerCrawlTime: null,
    });

    expect(mergeSourceExternalMetadata(previous, parsed)).toMatchObject({
      originalTitle: "解析阶段标题",
      description: "发现阶段说明",
      authorName: "发现作者",
      publishedAt: "2026-08-01T00:00:00.000Z",
      metrics: { likes: 88, comments: 3 },
      providerFetchedAt: "2026-09-02T00:00:00.000Z",
    });
  });
});
