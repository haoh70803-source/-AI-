import { describe, expect, it } from "vitest";
import { resolveDiscoveryQuery } from "./discovery-query";

describe("resolveDiscoveryQuery", () => {
  it.each(["AI获客", "老板IP", "某某说商业"])("treats plain text as a keyword: %s", (input) => {
    expect(resolveDiscoveryQuery(input)).toEqual({ type: "KEYWORD", value: input, platform: null });
  });

  it("recognizes Douyin content and account URLs", () => {
    expect(resolveDiscoveryQuery("https://www.douyin.com/video/123")).toMatchObject({ type: "CONTENT_URL", platform: "DOUYIN" });
    expect(resolveDiscoveryQuery("https://www.iesdouyin.com/share/video/123")).toMatchObject({ type: "CONTENT_URL", platform: "DOUYIN" });
    expect(resolveDiscoveryQuery("https://www.douyin.com/user/abc")).toMatchObject({ type: "ACCOUNT_URL", platform: "DOUYIN" });
  });

  it("recognizes Xiaohongshu content and account URLs", () => {
    expect(resolveDiscoveryQuery("https://www.xiaohongshu.com/explore/123")).toMatchObject({ type: "CONTENT_URL", platform: "XIAOHONGSHU" });
    expect(resolveDiscoveryQuery("https://www.xiaohongshu.com/user/profile/abc")).toMatchObject({ type: "ACCOUNT_URL", platform: "XIAOHONGSHU" });
  });

  it("does not use an unrelated host suffix as a platform match", () => {
    expect(resolveDiscoveryQuery("https://evil-douyin.com/video/1")).toMatchObject({ type: "CONTENT_URL", platform: null });
  });
});
