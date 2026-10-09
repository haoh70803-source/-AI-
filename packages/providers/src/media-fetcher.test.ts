import { createServer, type Server } from "node:http";
import type { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Only this loopback fixture bypasses the review outbound gate; SSRF checks stay real.
vi.mock("./review-policy", () => ({ assertReviewExternalAllowed: () => undefined }));
import type { StorageProvider } from "./contracts";
import { MediaFetcher } from "./media-fetcher";

const tinyMp4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let server: Server;
let origin: string;

class RecordingStorage implements StorageProvider {
  uploads: Array<{ key: string; body: Buffer; contentType?: string; contentLength?: number }> = [];

  async upload(input: Parameters<StorageProvider["upload"]>[0]) {
    const chunks: Buffer[] = [];
    if (input.body instanceof Uint8Array) chunks.push(Buffer.from(input.body));
    else for await (const chunk of input.body as Readable) chunks.push(Buffer.from(chunk));
    this.uploads.push({ key: input.key, body: Buffer.concat(chunks), contentType: input.contentType, contentLength: input.contentLength });
    return { providerMode: "REAL" as const, data: { key: input.key } };
  }

  async delete(key: string) {
    return { providerMode: "REAL" as const, data: { key } };
  }

  async getSignedUrl(key: string) {
    return { providerMode: "REAL" as const, data: { url: `https://storage.example/${key}` } };
  }
}

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/video") return response.writeHead(200, { "content-type": "video/mp4", "content-length": tinyMp4.length }).end(tinyMp4);
    if (request.url === "/image") return response.writeHead(200, { "content-type": "image/png", "content-length": tinyPng.length }).end(tinyPng);
    if (request.url === "/wrong") return response.writeHead(200, { "content-type": "text/html" }).end("<html>no</html>");
    if (request.url === "/large") return response.writeHead(200, { "content-type": "video/mp4", "content-length": "1000" }).end(tinyMp4);
    if (request.url === "/redirect") return response.writeHead(302, { location: "/video" }).end();
    if (request.url === "/ssrf") {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server address missing");
      return response.writeHead(302, { location: `http://127.0.0.1:${address.port}/video` }).end();
    }
    if (request.url === "/timeout") return;
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not bind");
  origin = `http://fixture.test:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function fixture(options: ConstructorParameters<typeof MediaFetcher>[1] = {}) {
  const storage = new RecordingStorage();
  return {
    storage,
    fetcher: new MediaFetcher(storage, {
      allowedTestOrigin: origin,
      timeoutMs: 100,
      resolver: async () => [{ address: "127.0.0.1", family: 4 }],
      ...options,
    }),
  };
}

describe("MediaFetcher", () => {
  it.each([
    ["video", "VIDEO" as const, "video/mp4", tinyMp4],
    ["image", "IMAGE" as const, "image/png", tinyPng],
  ])("streams a valid %s to StorageProvider", async (path, kind, mime, fixtureBody) => {
    const { storage, fetcher } = fixture();
    const result = await fetcher.downloadToStorage({ remoteUrl: `${origin}/${path}`, kind, storageKey: `asset/${path}` });
    expect(result).toMatchObject({ mimeType: mime, sizeBytes: fixtureBody.length });
    expect(storage.uploads[0]).toMatchObject({ key: `asset/${path}`, contentType: mime, contentLength: fixtureBody.length, body: fixtureBody });
  });

  it("allows the key to be built from the detected MIME type", async () => {
    const { storage, fetcher } = fixture();
    await fetcher.downloadToStorage({
      remoteUrl: `${origin}/video`,
      kind: "VIDEO",
      storageKey: ({ mimeType }) => `workspaces/w/sources/s/assets/a/original.${mimeType.split("/")[1]}`,
    });
    expect(storage.uploads[0]?.key).toBe("workspaces/w/sources/s/assets/a/original.mp4");
  });

  it("rejects a wrong MIME", async () => {
    await expect(fixture().fetcher.downloadToStorage({ remoteUrl: `${origin}/wrong`, kind: "VIDEO", storageKey: "asset/wrong" }))
      .rejects.toMatchObject({ code: "REDFOX_MEDIA_DOWNLOAD_FAILED", retryable: false, providerCode: "INVALID_MEDIA_MIME" });
  });

  it("rejects declared oversized media", async () => {
    await expect(fixture({ maxVideoBytes: 20 }).fetcher.downloadToStorage({ remoteUrl: `${origin}/large`, kind: "VIDEO", storageKey: "asset/large" }))
      .rejects.toMatchObject({ code: "REDFOX_MEDIA_DOWNLOAD_FAILED", retryable: false, providerCode: "RESPONSE_TOO_LARGE" });
  });

  it("revalidates and follows a safe redirect", async () => {
    const { storage, fetcher } = fixture();
    await fetcher.downloadToStorage({ remoteUrl: `${origin}/redirect`, kind: "VIDEO", storageKey: "asset/redirect" });
    expect(storage.uploads[0]?.body).toEqual(tinyMp4);
  });

  it("blocks a redirect to a private IP even when the fixture origin is allowed", async () => {
    await expect(fixture().fetcher.downloadToStorage({ remoteUrl: `${origin}/ssrf`, kind: "VIDEO", storageKey: "asset/ssrf" }))
      .rejects.toMatchObject({ code: "REDFOX_MEDIA_DOWNLOAD_FAILED", retryable: false, providerCode: "SSRF_BLOCKED" });
  });

  it("times out without uploading", async () => {
    const { storage, fetcher } = fixture({ timeoutMs: 20 });
    await expect(fetcher.downloadToStorage({ remoteUrl: `${origin}/timeout`, kind: "VIDEO", storageKey: "asset/timeout" }))
      .rejects.toMatchObject({ code: "REDFOX_MEDIA_DOWNLOAD_FAILED", retryable: true, providerCode: "TIMEOUT" });
    expect(storage.uploads).toHaveLength(0);
  });
});
