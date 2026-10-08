import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMediaRelayToken,
  readRenderMediaRelayConfig,
  RenderMediaRelayStorageProvider,
  verifyMediaRelayToken,
} from "./render-media-relay";

const scope = { workspaceId: "workspace-1", sourceItemId: "source-1", assetId: "asset-1" };

afterEach(() => vi.unstubAllGlobals());

describe("RenderMediaRelayStorageProvider", () => {
  it("requires production relay configuration without exposing secret values", () => {
    const config = readRenderMediaRelayConfig({
      APP_URL: "https://content.example",
      MEDIA_STORAGE_ROOT: "/var/data/xsj-media",
      MEDIA_RELAY_INTERNAL_BASE_URL: "http://web.internal",
      MEDIA_RELAY_INTERNAL_SECRET: "internal-secret",
      MEDIA_RELAY_SIGNING_SECRET: "signing-secret",
    });
    expect(config).toMatchObject({ publicBaseUrl: "https://content.example", internalBaseUrl: "http://web.internal" });
    expect(() => readRenderMediaRelayConfig({ APP_URL: "https://content.example" })).toThrow("UNCONFIGURED");
  });

  it("accepts Render private hostport references for the internal relay", () => {
    const config = readRenderMediaRelayConfig({
      APP_URL: "https://content.example",
      MEDIA_STORAGE_ROOT: "/var/data/xsj-media",
      MEDIA_RELAY_INTERNAL_BASE_URL: "xsj-content-web-staging:10000",
      MEDIA_RELAY_INTERNAL_SECRET: "internal-secret",
      MEDIA_RELAY_SIGNING_SECRET: "signing-secret",
    });
    expect(config.internalBaseUrl).toBe("http://xsj-content-web-staging:10000");
  });

  it("streams upload with scope headers and never submits a raw object key", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-workspace-id")).toBe(scope.workspaceId);
      expect(headers.get("x-source-item-id")).toBe(scope.sourceItemId);
      expect(headers.get("x-asset-id")).toBe(scope.assetId);
      expect(headers.get("x-storage-key")).toBeNull();
      expect(init?.body).toBeInstanceOf(ReadableStream);
      return new Response(JSON.stringify({ key: "workspaces/workspace-1/sources/source-1/assets/asset-1/original.mp4" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new RenderMediaRelayStorageProvider({
      mediaStorageRoot: "/tmp/xsj-media",
      internalBaseUrl: "http://web.internal",
      publicBaseUrl: "https://content.example",
      internalSecret: "internal-secret",
      signingSecret: "signing-secret",
    });
    const result = await provider.upload({
      key: "workspaces/ignored/raw-key",
      body: Readable.from([Buffer.from("large enough to be a stream")]),
      contentType: "video/mp4",
      assetScope: scope,
    });
    expect(result.data.key).toContain("workspaces/workspace-1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("creates independently signed, expiring browser and Doubao tokens", () => {
    const token = createMediaRelayToken({ scope, expiresInSeconds: 300, secret: "signing-secret", purpose: "doubao", now: 1_000_000 });
    expect(verifyMediaRelayToken(token, "signing-secret", 1_000_001, "doubao")).toMatchObject({ ...scope, purpose: "doubao" });
    expect(verifyMediaRelayToken(token, "signing-secret", 1_000_001, "browser")).toBeNull();
    expect(verifyMediaRelayToken(token, "signing-secret", 1_000_300_000)).toBeNull();
    expect(verifyMediaRelayToken(`${token}tampered`, "signing-secret")).toBeNull();
  });

  it("requires asset scope for relay signed URLs and deletes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new RenderMediaRelayStorageProvider({
      mediaStorageRoot: "/tmp/xsj-media",
      internalBaseUrl: "http://web.internal",
      publicBaseUrl: "https://content.example",
      internalSecret: "internal-secret",
      signingSecret: "signing-secret",
    });
    await expect(provider.getSignedUrl("ignored", 300)).rejects.toThrow("RENDER_MEDIA_RELAY_SCOPE_REQUIRED");
    await expect(provider.delete("ignored")).rejects.toThrow("RENDER_MEDIA_RELAY_SCOPE_REQUIRED");
    await provider.delete("ignored", scope);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
