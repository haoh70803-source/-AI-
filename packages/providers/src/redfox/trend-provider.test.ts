import { describe, expect, it } from "vitest";
import { RedFoxClient } from "./client";
import { RedFoxTrendProvider } from "./trend-provider";

function fixture() {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init });
    return new Response(JSON.stringify({ code: 200, data: { records: [{ id: "1", title: "AI 办公", rank: 3 }] } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "trend-fixture" } });
  };
  return { provider: new RedFoxTrendProvider(new RedFoxClient({ apiKey: "fixture", baseUrl: "https://fixture.test", fetch: fetch as typeof globalThis.fetch })), calls };
}

describe("RedFoxTrendProvider contract", () => {
  it.each([
    ["douyin hot", (provider: RedFoxTrendProvider) => provider.getHot({ platform: "DOUYIN", window: "TODAY", startDate: "2026-09-01", endDate: "2026-09-01" }), "/story/api/dy/search/likesRank", "POST"],
    ["douyin surge", (provider: RedFoxTrendProvider) => provider.getSurging({ platform: "DOUYIN", window: "SEVEN_DAYS", startDate: "2026-08-26", endDate: "2026-09-01" }), "/story/api/dy/search/getWeeklyRank", "POST"],
    ["xiaohongshu hot", (provider: RedFoxTrendProvider) => provider.getHot({ platform: "XIAOHONGSHU", window: "TODAY", startDate: "2026-09-01", endDate: "2026-09-01" }), "/story/api/cozeSkill/getXhsCozeSkillDataOne", "GET"],
    ["xiaohongshu dark horse", (provider: RedFoxTrendProvider) => provider.getDarkHorse({ platform: "XIAOHONGSHU", window: "SEVEN_DAYS", startDate: "2026-08-26", endDate: "2026-09-01", keyword: "AI" }), "/story/api/cozeSkill/getLowPowderExplosiveArticle", "POST"],
    ["global hotspot", (provider: RedFoxTrendProvider) => provider.getHot({ platform: "GLOBAL", window: "TODAY", startDate: "2026-09-01", endDate: "2026-09-01" }), "/story/api/hotKeyword/list", "POST"],
  ] as const)("calls %s endpoint", async (_name, run, pathname, method) => {
    const { provider, calls } = fixture();
    await expect(run(provider)).resolves.toMatchObject({ items: [{ title: "AI 办公" }], providerRequestId: "trend-fixture" });
    expect(calls[0]?.url.pathname).toBe(pathname);
    expect(calls[0]?.init?.method).toBe(method);
    expect(new Headers(calls[0]?.init?.headers).get("REDFOX_API_KEY")).toBe("fixture");
  });

  it("rejects a dark-horse request without a real keyword", async () => {
    const { provider } = fixture();
    await expect(provider.getDarkHorse({ platform: "XIAOHONGSHU", window: "TODAY", startDate: "2026-09-01", endDate: "2026-09-01", keyword: "" })).rejects.toMatchObject({ code: "REDFOX_BAD_REQUEST" });
  });
});
