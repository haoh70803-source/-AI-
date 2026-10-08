import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { createReadStream } from "node:fs";
import {
  createMediaRelayToken,
  RenderMediaRelayStorageProvider,
  resolveStoragePath,
  verifyMediaRelayToken,
} from "@content-center/providers";
import { test, expect } from "@playwright/test";

const scope = { workspaceId: "workspace-1", sourceItemId: "source-1", assetId: "asset-1" };

async function readRequest(request: IncomingMessage, target: string) {
  await pipeline(request, createWriteStream(target, { flags: "wx" }));
}

test("Render Media Relay streams upload/download, signs expiry, and deletes", async () => {
  const root = await mkdtemp(join(tmpdir(), "content-center-relay-e2e-"));
  const key = "workspaces/workspace-1/sources/source-1/assets/asset-1/original.mp4";
  const target = resolveStoragePath(root, key);
  await mkdir(join(root, "workspaces/workspace-1/sources/source-1/assets/asset-1"), { recursive: true });
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const authorized = request.headers.authorization === "Bearer internal-secret"
      && request.headers["x-workspace-id"] === scope.workspaceId
      && request.headers["x-source-item-id"] === scope.sourceItemId
      && request.headers["x-asset-id"] === scope.assetId;
    if ((request.method === "PUT" || request.method === "DELETE") && !authorized) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (request.method === "PUT" && request.url === "/api/internal/media-storage/asset-1") {
      await readRequest(request, target);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ key }));
      return;
    }
    if (request.method === "DELETE" && request.url === "/api/internal/media-storage/asset-1") {
      await rm(target, { force: true });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ deleted: true }));
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/media/")) {
      const token = request.url.slice("/api/media/".length);
      const payload = verifyMediaRelayToken(token, "signing-secret");
      if (!payload || payload.assetId !== scope.assetId) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "video/mp4" });
      createReadStream(target).pipe(response);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("relay test server did not start");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const provider = new RenderMediaRelayStorageProvider({
      mediaStorageRoot: root,
      internalBaseUrl: baseUrl,
      publicBaseUrl: baseUrl,
      internalSecret: "internal-secret",
      signingSecret: "signing-secret",
    });
    const uploaded = await provider.upload({
      key: "ignored-by-relay",
      body: Readable.from([Buffer.from("relay stream body")]),
      contentType: "video/mp4",
      assetScope: scope,
    });
    expect(uploaded.data.key).toBe(key);
    const signed = await provider.getSignedUrl(key, 300, { assetScope: scope });
    expect((await fetch(signed.data.url)).status).toBe(200);
    const expired = createMediaRelayToken({ scope, expiresInSeconds: 300, secret: "signing-secret", now: 1_000_000 });
    expect(verifyMediaRelayToken(expired, "signing-secret", 1_000_301_000)).toBeNull();
    await provider.delete(key, scope);
    await expect(access(target)).rejects.toThrow();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
