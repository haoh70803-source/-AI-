import { describe, expect, it } from "vitest";
import { normalizeAccountPage, normalizeContentPage } from "./discovery-normalize";

describe("RedFox discovery normalization", () => {
  it("preserves pagination cursors without inventing them", () => {
    expect(normalizeContentPage("DOUYIN", { data: { has_more: 1, max_cursor: "12345", aweme_list: [] } })).toMatchObject({ hasMore: true, nextOffset: 12345 });
    expect(normalizeContentPage("DOUYIN", { hasMore: true, list: [] }).nextOffset).toBeNull();
    expect(normalizeContentPage("DOUYIN", { hasMore: true, cursor: -1, list: [] }).nextOffset).toBeNull();
  });
  it("normalizes Douyin content without turning missing metrics into zero", () => {
    const page = normalizeContentPage("DOUYIN", {
      total: 1,
      hasMore: false,
      list: [{ awemeId: "dy-1", desc: "AI 获客", author: { uid: "u1", nickname: "王老板" }, statistics: { diggCount: 123 }, shareUrl: "https://www.douyin.com/video/dy-1" }],
    });
    expect(page.items[0]).toMatchObject({ externalId: "dy-1", authorName: "王老板", metrics: { likes: 123, comments: null } });
  });

  it("normalizes Xiaohongshu accounts into the shared DTO", () => {
    const page = normalizeAccountPage("XIAOHONGSHU", {
      list: [{ redId: "red-1", nickname: "内容研究社", fansCount: "12000", signature: "用内容做生意" }],
    });
    expect(page.items[0]).toMatchObject({ externalId: "red-1", platform: "XIAOHONGSHU", name: "内容研究社", followers: 12000 });
  });

  it("normalizes the complete supported work-detail field set", () => {
    const page = normalizeContentPage("DOUYIN", {
      list: [{
        awemeId: "dy-complete",
        awemeType: "video",
        title: "完整作品标题",
        desc: "完整作品说明",
        author: { uid: "author-complete", nickname: "完整作者", avatarUrl: "https://example.test/avatar.jpg" },
        statistics: { playCount: 98_000, diggCount: 8_800, collectCount: 660, commentCount: 55, shareCount: 44 },
        shareUrl: "https://www.douyin.com/video/dy-complete",
        coverUrl: "https://example.test/cover.jpg",
        publishTime: 1_777_665_600,
        duration: 21,
      }],
    });
    expect(page.items[0]).toMatchObject({
      externalId: "dy-complete",
      contentType: "VIDEO",
      title: "完整作品标题",
      description: "完整作品说明",
      authorId: "author-complete",
      authorName: "完整作者",
      authorAvatarUrl: "https://example.test/avatar.jpg",
      coverUrl: "https://example.test/cover.jpg",
      originalUrl: "https://www.douyin.com/video/dy-complete",
      durationMs: 21_000,
      metrics: { views: 98_000, likes: 8_800, favorites: 660, comments: 55, shares: 44 },
    });
    expect(page.items[0]?.publishedAt).not.toBeNull();
  });
});
