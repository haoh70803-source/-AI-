import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedFoxClient } from "./client";
import { RedFoxDiscoveryProvider } from "./discovery-adapters";

type CapturedRequest = { path: string; body: Record<string, unknown>; apiKey?: string };

let server: Server;
let baseUrl = "";
const requests: CapturedRequest[] = [];

function dataFor(path: string) {
  if (path.includes("searchUser")) return { list: [{ accountId: "account-1", nickname: "对标账号" }] };
  if (path.includes("queryAccountDetail") || path.includes("queryUser")) return { accountId: "account-1", nickname: "对标账号" };
  if (path.includes("queryWork") && !path.includes("List") && !path.includes("Detail")) return { awemeId: "work-1", desc: "作品详情" };
  if (path.includes("queryWorkDetail")) return { noteId: "work-1", title: "笔记详情" };
  return { total: 1, hasMore: false, list: [{ awemeId: "work-1", noteId: "work-1", desc: "AI 获客" }] };
}

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const path = request.url ?? "";
    requests.push({
      path,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
      apiKey: request.headers.redfox_api_key as string | undefined,
    });
    response.writeHead(200, { "content-type": "application/json", "x-request-id": "discovery-contract" });
    response.end(JSON.stringify({ code: 2000, data: dataFor(path) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("RedFox discovery fixture did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function provider() {
  return new RedFoxDiscoveryProvider(new RedFoxClient({ apiKey: "ak_discovery_test", baseUrl, fetch }));
}

describe("RedFox discovery adapters", () => {
  it.each([
    ["DOUYIN", "/story/api/dyData/searchArticle"],
    ["XIAOHONGSHU", "/story/api/xhsUser/searchArticle"],
  ] as const)("uses the official %s content-search contract", async (platform, path) => {
    const result = await provider().contentSearch.search({ platform, keyword: "AI 获客", offset: 0, sortType: "2" });
    expect(result.items[0]).toMatchObject({ externalId: "work-1", platform, sourceProvider: "REDFOX" });
    expect(requests.at(-1)).toEqual({ path, body: { keyword: "AI 获客", offset: 0, sortType: "2" }, apiKey: "ak_discovery_test" });
  });

  it.each([
    ["DOUYIN", "/story/api/dyData/searchUser"],
    ["XIAOHONGSHU", "/story/api/xhsUser/searchUser"],
  ] as const)("uses the official %s account-search contract", async (platform, path) => {
    const result = await provider().accountSearch.search({ platform, keyword: "商业 IP" });
    expect(result.items[0]).toMatchObject({ externalId: "account-1", name: "对标账号", platform });
    expect(requests.at(-1)).toEqual({ path, body: { keyword: "商业 IP", offset: 0 }, apiKey: "ak_discovery_test" });
  });

  it.each([
    ["DOUYIN", "/story/api/dyData/queryUser"],
    ["XIAOHONGSHU", "/story/api/xhsUser/queryAccountDetail"],
  ] as const)("normalizes the official %s account-detail contract", async (platform, path) => {
    const result = await provider().accountDetail.get({ platform, accountId: "account-1" });
    expect(result.item).toMatchObject({ externalId: "account-1", name: "对标账号", platform });
    expect(requests.at(-1)).toEqual({ path, body: { accountId: "account-1" }, apiKey: "ak_discovery_test" });
  });

  it.each([
    ["DOUYIN", "/story/api/dyData/queryWorkList", { accountId: "account-1", offset: 0, sortType: "_4" }],
    ["XIAOHONGSHU", "/story/api/xhsUser/queryWorkList", { redId: "account-1", offset: 0, sortType: "4" }],
  ] as const)("uses the official %s account-works contract", async (platform, path, body) => {
    const result = await provider().accountWorks.list({ platform, accountId: "account-1", sortType: "4" });
    expect(result.items[0]).toMatchObject({ externalId: "work-1", platform });
    expect(requests.at(-1)).toEqual({ path, body, apiKey: "ak_discovery_test" });
  });

  it("rejects unsupported homepage identity before any HTTP request", async () => {
    const before = requests.length;
    await expect(provider().accountDetail.get({ platform: "DOUYIN", accountId: "MS4w-homepage-fixture" })).rejects.toMatchObject({ code: "REDFOX_BAD_REQUEST", retryable: false });
    expect(requests).toHaveLength(before);
  });

  it("keeps Douyin homepage secUserId separate from the public handle and uses documented latest sorting", async () => {
    await provider().accountWorks.list({ platform: "DOUYIN", accountId: "MS4w-homepage-fixture", sortType: "2", offset: 20 });
    expect(requests.at(-1)?.body).toEqual({ secUserId: "MS4w-homepage-fixture", offset: 20, sortType: "_2" });
  });

  it.each([
    ["DOUYIN", "/story/api/dyData/queryWork", { workId: "work-1" }],
    ["XIAOHONGSHU", "/story/api/xhsUser/queryWorkDetail", { workId: "work-1" }],
  ] as const)("uses the official %s work-detail contract", async (platform, path, body) => {
    const result = await provider().workDetail.get({ platform, externalId: "work-1" });
    expect(result.item).toMatchObject({ externalId: "work-1", platform });
    expect(requests.at(-1)).toEqual({ path, body, apiKey: "ak_discovery_test" });
  });
});
