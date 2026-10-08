import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedFoxClient } from "./client";
import { RedFoxError } from "./errors";
import { RedFoxSourceProvider } from "./provider";

let server: Server;
let baseUrl: string;

function payloadFor(url: string) {
  const mediaBase = "https://media.example.com";
  if (url.includes("photo")) return { code: 2000, data: { awemeType: "photo", platform: "douyin", title: "图文", imageUrls: [`${mediaBase}/1.jpg`, `${mediaBase}/2.jpg`] } };
  if (url.includes("missing-video")) return { code: 200, data: { awemeType: "video", platform: "dy" } };
  if (url.includes("empty-images")) return { code: 200, data: { awemeType: "photo", platform: "dy", imageUrls: [] } };
  if (url.includes("unknown-type")) return { code: 200, data: { awemeType: "live", platform: "dy" } };
  if (url.includes("xiaohongshu")) return { code: 200, data: { awemeType: "video", platform: "xhs", title: "小红书视频", videoUrl: `${mediaBase}/clip.mp4`, awemeId: "xhs-1" } };
  if (url.includes("other-platform")) return { code: 200, data: { awemeType: "video", platform: "youtube", videoUrl: `${mediaBase}/clip.mp4` } };
  return { code: 200, data: { awemeType: "video", platform: "dy", title: "真实视频", videoUrl: `${mediaBase}/clip.mp4`, awemeId: "123" } };
}

const priorProviderOrigin = process.env.PROVIDER_TEST_ORIGIN;
const priorEnvironmentId = process.env.ENVIRONMENT_ID;
afterAll(() => { if (priorProviderOrigin) process.env.PROVIDER_TEST_ORIGIN = priorProviderOrigin; else delete process.env.PROVIDER_TEST_ORIGIN; if (priorEnvironmentId) process.env.ENVIRONMENT_ID = priorEnvironmentId; else delete process.env.ENVIRONMENT_ID; });
beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { url: string; source: string };
    if (request.headers["x-api-key"] !== "ak_test" || body.source !== "AI内容生产中心") {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ code: 400, msg: "bad fixture request" }));
      return;
    }
    if (body.url.includes("timeout")) return;
    if (body.url.includes("invalid-json")) {
      response.writeHead(200, { "content-type": "application/json" }).end("not-json");
      return;
    }
    if (body.url.includes("invalid-schema")) {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ unexpected: true }));
      return;
    }
    if (body.url.includes("empty-data")) {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ code: 200, data: null }));
      return;
    }
    const cases: Array<[string, number, unknown]> = [
      ["3106", 200, { code: 3106, msg: "missing" }],
      ["3107", 200, { code: 3107, msg: "expired" }],
      ["bad-request", 200, { code: 400, msg: "bad" }],
      ["rate-limit", 429, { code: 429, msg: "slow" }],
      ["server-error", 500, { code: 500, msg: "down" }],
      ["unknown-code", 200, { code: 4999, msg: "unknown" }],
    ];
    const matched = cases.find(([needle]) => body.url.includes(needle));
    if (matched) {
      response.writeHead(matched[1], { "content-type": "application/json", "x-request-id": "req-test" }).end(JSON.stringify(matched[2]));
      return;
    }
    response.writeHead(200, { "content-type": "application/json", "x-request-id": "req-success" }).end(JSON.stringify(payloadFor(body.url)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.ENVIRONMENT_ID = "LOCAL_TEST";
  process.env.PROVIDER_TEST_ORIGIN = baseUrl;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function provider(timeoutMs = 500) {
  return new RedFoxSourceProvider(new RedFoxClient({ apiKey: "ak_test", baseUrl, timeoutMs }));
}

async function expectCode(work: Promise<unknown>, code: string, retryable: boolean) {
  await expect(work).rejects.toMatchObject({ code, retryable });
}

describe("RedFoxClient and RedFoxSourceProvider", () => {
  it("normalizes a 200 video response", async () => {
    const result = await provider().resolve("https://www.douyin.com/video/video");
    expect(result).toMatchObject({ providerMode: "REAL", data: { sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "真实视频", media: [{ type: "VIDEO" }] } });
  });

  it("normalizes a 2000 photo response", async () => {
    const result = await provider().resolve("https://www.douyin.com/note/photo");
    expect(result.data.media).toHaveLength(2);
    expect(result.data.sourceType).toBe("IMAGE");
  });

  it("normalizes a Xiaohongshu video response", async () => {
    const result = await provider().resolve("https://www.xiaohongshu.com/explore/xiaohongshu");
    expect(result.data).toMatchObject({ sourceType: "VIDEO", sourcePlatform: "XIAOHONGSHU", title: "小红书视频" });
  });

  it("infers Douyin from a validated official share URL when parseWork omits platform", async () => {
    const client = new RedFoxClient({
      apiKey: "ak_test",
      baseUrl,
      fetch: async () => new Response(JSON.stringify({ code: 2000, data: { awemeType: "video", title: "真实响应", videoUrl: "https://media.example.com/clip.mp4", imageUrls: [] } }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const result = await new RedFoxSourceProvider(client).resolve("https://www.iesdouyin.com/share/video/7661555559430581370");
    expect(result.data).toMatchObject({ sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "真实响应" });
  });

  it.each([
    ["3106", "REDFOX_AUTH_FAILED", false],
    ["3107", "REDFOX_AUTH_FAILED", false],
    ["bad-request", "REDFOX_BAD_REQUEST", false],
    ["rate-limit", "REDFOX_RATE_LIMITED", true],
    ["server-error", "REDFOX_SERVER_ERROR", true],
    ["invalid-json", "REDFOX_INVALID_RESPONSE", false],
    ["invalid-schema", "REDFOX_INVALID_RESPONSE", false],
    ["empty-data", "REDFOX_EMPTY_DATA", false],
    ["unknown-code", "REDFOX_API_ERROR", false],
  ])("maps %s to %s", async (slug, code, retryable) => {
    await expectCode(provider().resolve(`https://www.douyin.com/video/${slug}`), code, retryable);
  });

  it("reports exhausted credit without reflecting provider text or retrying", async () => {
    const client = new RedFoxClient({ apiKey: "private-key", fetch: async () => new Response(JSON.stringify({ code: 3201, msg: "private-key provider message", data: null }), { status: 200 }) });
    await expect(client.getAccountDetail({ platform: "DOUYIN", accountId: "account" })).rejects.toMatchObject({ code: "REDFOX_QUOTA_EXCEEDED", retryable: false, httpStatus: 402, message: "RedFox 积分余额不足，请充值或在设置中更换有余额的 API Key。" });
  });

  it("maps timeout as retryable", async () => {
    await expectCode(provider(20).resolve("https://www.douyin.com/video/timeout"), "REDFOX_TIMEOUT", true);
  });

  it.each([
    ["unknown-type", "REDFOX_UNSUPPORTED_CONTENT_TYPE"],
    ["missing-video", "REDFOX_MEDIA_MISSING"],
    ["empty-images", "REDFOX_MEDIA_MISSING"],
    ["other-platform", "REDFOX_UNSUPPORTED_PLATFORM"],
  ])("rejects normalized content case %s", async (slug, code) => {
    await expectCode(provider().resolve(`https://www.douyin.com/video/${slug}`), code, false);
  });

  it("does not accept an empty key", () => {
    expect(() => new RedFoxClient({ apiKey: "" })).toThrow(RedFoxError);
  });
});
