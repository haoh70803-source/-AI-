import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { StorageAssetScope, StorageProvider, StorageSignedUrlOptions } from "./contracts";

const MIN_SIGNED_URL_TTL_SECONDS = 1;
const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const INTERNAL_MEDIA_PATH = "/api/internal/media-storage";

export type RenderMediaRelayStorageConfig = {
  mediaStorageRoot: string;
  internalBaseUrl: string;
  publicBaseUrl: string;
  internalSecret: string;
  signingSecret: string;
};

export type MediaRelayTokenPayload = {
  assetId: string;
  workspaceId: string;
  sourceItemId: string;
  expiresAt: number;
  disposition: "inline" | "attachment";
  purpose: "browser" | "doubao";
};

type RenderStorageEnvironment = Record<string, string | undefined>;

function required(env: RenderStorageEnvironment, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`UNCONFIGURED: ${key}`);
  return value;
}

function httpUrl(value: string, field: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`INVALID_${field}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`INVALID_${field}`);
  return value.replace(/\/+$/, "");
}

function internalHttpUrl(value: string) {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  return httpUrl(withScheme, "MEDIA_RELAY_INTERNAL_BASE_URL");
}

export function readRenderMediaRelayConfig(env: RenderStorageEnvironment = process.env): RenderMediaRelayStorageConfig {
  return readRenderMediaRelayConfigWithOptions(env);
}

export function readRenderMediaRelayConfigWithOptions(
  env: RenderStorageEnvironment = process.env,
  options: { requireMediaStorageRoot?: boolean } = {},
): RenderMediaRelayStorageConfig {
  const publicBaseUrl = httpUrl(required(env, "APP_URL"), "APP_URL");
  const internalBaseUrl = internalHttpUrl(
    env.MEDIA_RELAY_INTERNAL_BASE_URL?.trim() || env.MEDIA_RELAY_BASE_URL?.trim() || publicBaseUrl,
  );
  return {
    mediaStorageRoot: options.requireMediaStorageRoot === false ? env.MEDIA_STORAGE_ROOT?.trim() || "" : required(env, "MEDIA_STORAGE_ROOT"),
    internalBaseUrl,
    publicBaseUrl,
    internalSecret: required(env, "MEDIA_RELAY_INTERNAL_SECRET"),
    signingSecret: required(env, "MEDIA_RELAY_SIGNING_SECRET"),
  };
}

function assertTtl(expiresInSeconds: number) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < MIN_SIGNED_URL_TTL_SECONDS || expiresInSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new Error("INVALID_SIGNED_URL_TTL");
  }
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createMediaRelayToken(input: {
  scope: StorageAssetScope;
  expiresInSeconds: number;
  secret: string;
  disposition?: "inline" | "attachment";
  purpose?: "browser" | "doubao";
  now?: number;
}) {
  assertTtl(input.expiresInSeconds);
  if (!input.secret) throw new Error("UNCONFIGURED: MEDIA_RELAY_SIGNING_SECRET");
  const payload: MediaRelayTokenPayload = {
    assetId: input.scope.assetId,
    workspaceId: input.scope.workspaceId,
    sourceItemId: input.scope.sourceItemId,
    expiresAt: Math.floor((input.now ?? Date.now()) / 1_000) + input.expiresInSeconds,
    disposition: input.disposition ?? "inline",
    purpose: input.purpose ?? "browser",
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, input.secret)}`;
}

export function verifyMediaRelayToken(token: string, secret: string, now = Date.now(), expectedPurpose?: MediaRelayTokenPayload["purpose"]): MediaRelayTokenPayload | null {
  if (!secret) return null;
  const [encodedPayload, providedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra.length > 0) return null;
  const expectedSignature = sign(encodedPayload, secret);
  const provided = Buffer.from(providedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const candidate = payload as Partial<MediaRelayTokenPayload>;
  if (
    typeof candidate.assetId !== "string"
    || typeof candidate.workspaceId !== "string"
    || typeof candidate.sourceItemId !== "string"
    || typeof candidate.expiresAt !== "number"
    || !Number.isInteger(candidate.expiresAt)
    || candidate.expiresAt <= Math.floor(now / 1_000)
    || (candidate.disposition !== "inline" && candidate.disposition !== "attachment")
    || (candidate.purpose !== "browser" && candidate.purpose !== "doubao")
    || (expectedPurpose !== undefined && candidate.purpose !== expectedPurpose)
  ) return null;
  return candidate as MediaRelayTokenPayload;
}

export function hasValidMediaRelayInternalAuthorization(request: Request, secret: string) {
  if (!secret) return false;
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(value.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function scopedHeaders(scope: StorageAssetScope, secret: string) {
  return {
    authorization: `Bearer ${secret}`,
    "x-workspace-id": scope.workspaceId,
    "x-source-item-id": scope.sourceItemId,
    "x-asset-id": scope.assetId,
  };
}

async function responseJson(response: Response) {
  return await response.json().catch(() => ({})) as { key?: string; error?: string; message?: string };
}

function relayError(response: Response, body: { error?: string; message?: string }) {
  return new Error(body.error || body.message || `RENDER_MEDIA_RELAY_HTTP_${response.status}`);
}

export class RenderMediaRelayStorageProvider implements StorageProvider {
  constructor(private readonly config: RenderMediaRelayStorageConfig) {}

  async upload(input: Parameters<StorageProvider["upload"]>[0]) {
    if (!input.assetScope) throw new Error("RENDER_MEDIA_RELAY_SCOPE_REQUIRED");
    const headers: Record<string, string> = {
      ...scopedHeaders(input.assetScope, this.config.internalSecret),
    };
    if (input.contentType) headers["content-type"] = input.contentType;
    if (input.contentLength !== undefined) headers["content-length"] = String(input.contentLength);
    const body = input.body instanceof Uint8Array ? input.body : Readable.toWeb(input.body as Readable);
    const response = await fetch(`${this.config.internalBaseUrl}${INTERNAL_MEDIA_PATH}/${encodeURIComponent(input.assetScope.assetId)}`, {
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      method: "PUT",
      headers,
      body: body as unknown as BodyInit,
      duplex: "half",
      cache: "no-store",
    } as RequestInit & { duplex: "half" });
    const data = await responseJson(response);
    if (!response.ok || !data.key) throw relayError(response, data);
    return { providerMode: "REAL" as const, data: { key: data.key } };
  }

  async delete(key: string, assetScope?: StorageAssetScope) {
    void key;
    if (!assetScope) throw new Error("RENDER_MEDIA_RELAY_SCOPE_REQUIRED");
    const response = await fetch(`${this.config.internalBaseUrl}${INTERNAL_MEDIA_PATH}/${encodeURIComponent(assetScope.assetId)}`, {
      signal: AbortSignal.timeout(10_000),
      method: "DELETE",
      headers: scopedHeaders(assetScope, this.config.internalSecret),
      cache: "no-store",
    });
    const data = await responseJson(response);
    if (!response.ok) throw relayError(response, data);
    return { providerMode: "REAL" as const, data: { key } };
  }

  async getSignedUrl(key: string, expiresInSeconds = 300, options?: StorageSignedUrlOptions) {
    void key;
    if (!options?.assetScope) throw new Error("RENDER_MEDIA_RELAY_SCOPE_REQUIRED");
    const token = createMediaRelayToken({
      scope: options.assetScope,
      expiresInSeconds,
      secret: this.config.signingSecret,
      disposition: options.disposition,
      purpose: options.purpose,
    });
    const url = new URL(`${this.config.publicBaseUrl}/api/media/${token}`);
    if ((options.purpose ?? "browser") === "doubao") url.searchParams.set("purpose", "doubao");
    return {
      providerMode: "REAL" as const,
      data: { url: url.toString() },
    };
  }
}

export function renderMediaRelayStorageFromEnv(env: RenderStorageEnvironment = process.env) {
  return new RenderMediaRelayStorageProvider(readRenderMediaRelayConfigWithOptions(env, { requireMediaStorageRoot: false }));
}
