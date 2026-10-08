import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { Agent, fetch as fetchMedia } from "undici";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { LookupFunction } from "node:net";
import {
  MAX_IMAGE_DOWNLOAD_BYTES,
  MAX_VIDEO_DOWNLOAD_BYTES,
  MEDIA_DOWNLOAD_MAX_REDIRECTS,
  MEDIA_DOWNLOAD_TIMEOUT_MS,
} from "@content-center/config";
import type { StorageAssetScope, StorageProvider } from "./contracts";
import { IngestProviderError } from "./ingest-error";
import { resolvePublicAddress, type AddressResolver, type ResolvedAddress } from "./safe-url";
import { RedFoxError } from "./redfox/errors";

type MediaKind = "VIDEO" | "IMAGE";

export type MediaFetcherOptions = {
  resolver?: AddressResolver;
  allowedTestOrigin?: string;
  timeoutMs?: number;
  maxRedirects?: number;
  maxVideoBytes?: number;
  maxImageBytes?: number;
};

type OpenedResponse = {
  status: number;
  headers: { location?: string; contentType?: string; contentLength?: string; contentRange?: string };
  response: NodeJS.ReadableStream & { resume(): void; destroy(error?: Error): void };
};

async function openResponse(url: URL, address: ResolvedAddress, timeoutMs: number): Promise<OpenedResponse> {
  const lookup: LookupFunction = (_hostname, options, callback) => callback(null, options.all ? [{address:address.address,family:address.family}] : address.address, options.all ? undefined : address.family);
  const dispatcher = new Agent({connect:{lookup,timeout:Math.min(timeoutMs,15000)}});
  try {
    const result = await fetchMedia(url, {dispatcher, method:"GET", redirect:"manual", headers:{accept:"*/*","user-agent":"ContentCenterBot/0.1 (+media-ingest)",range:"bytes=0-"},signal:AbortSignal.timeout(timeoutMs)});
    const body = result.body ? Readable.fromWeb(result.body as Parameters<typeof Readable.fromWeb>[0]) : Readable.from([]);
    const cleanup = () => { void dispatcher.close().catch(() => undefined); };
    body.once("end",cleanup); body.once("close",cleanup); body.once("error",cleanup);
    return {status:result.status,headers:{location:result.headers.get("location") || undefined,contentType:result.headers.get("content-type") || undefined,contentLength:result.headers.get("content-length") || undefined,contentRange:result.headers.get("content-range") || undefined},response:body};
  } catch(error) { await dispatcher.destroy().catch(() => undefined); throw error; }
}

function expectedMime(kind: MediaKind, contentType: string | undefined): string {
  const mime = contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!mime || (kind === "VIDEO" ? !mime.startsWith("video/") : !mime.startsWith("image/"))) {
    throw new RedFoxError("REDFOX_MEDIA_DOWNLOAD_FAILED", "远程媒体 MIME 类型不受支持。", false, undefined, "INVALID_MEDIA_MIME");
  }
  if (mime === "text/html" || mime === "application/json") {
    throw new RedFoxError("REDFOX_MEDIA_DOWNLOAD_FAILED", "远程地址返回的不是媒体文件。", false, undefined, "INVALID_MEDIA_MIME");
  }
  return mime;
}

function mapMediaError(error: unknown): RedFoxError {
  if (error instanceof RedFoxError) return error;
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return new RedFoxError("REDFOX_MEDIA_DOWNLOAD_FAILED", "媒体下载超时。", true, undefined, "TIMEOUT");
  if (error instanceof IngestProviderError) {
    return new RedFoxError(
      "REDFOX_MEDIA_DOWNLOAD_FAILED",
      error.code === "SSRF_BLOCKED" ? "媒体地址未通过安全校验。" : "远程媒体下载失败。",
      error.retryable,
      error.httpStatus,
      error.code,
    );
  }
  return new RedFoxError("REDFOX_MEDIA_DOWNLOAD_FAILED", "远程媒体下载失败。", true);
}

export class MediaFetcher {
  constructor(
    private readonly storage: StorageProvider,
    private readonly options: MediaFetcherOptions = {},
  ) {}

  async downloadToStorage(input: {
    remoteUrl: string;
    kind: MediaKind;
    storageKey: string | ((input: { mimeType: string }) => string);
    assetScope?: StorageAssetScope;
    onBeforeStore?: () => void | Promise<void>;
  }) {
    const experience = process.env.EXPERIENCE_LIMITS_ENABLED === "true" || process.env.DEMO_MODE === "true";
    const maxBytes = experience ? 50 * 1024 * 1024 : input.kind === "VIDEO"
      ? (this.options.maxVideoBytes ?? MAX_VIDEO_DOWNLOAD_BYTES)
      : (this.options.maxImageBytes ?? MAX_IMAGE_DOWNLOAD_BYTES);
    const timeoutMs = this.options.timeoutMs ?? MEDIA_DOWNLOAD_TIMEOUT_MS;
    const maxRedirects = this.options.maxRedirects ?? MEDIA_DOWNLOAD_MAX_REDIRECTS;
    const tempDirectory = await mkdtemp(join(tmpdir(), "content-center-media-"));
    const tempFile = join(tempDirectory, "asset");

    try {
      let current = input.remoteUrl;
      for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
        const { url, addresses } = await resolvePublicAddress(current, this.options.resolver, this.options.allowedTestOrigin);
        if (!addresses.length) throw new IngestProviderError("DNS_TEMPORARY", "域名没有可用地址。", true);
        let opened: OpenedResponse | undefined;
        let connectionError: unknown;
        for (const address of addresses.slice(0, 4)) {
          try { opened = await openResponse(url, address, timeoutMs); break; }
          catch (error) { connectionError = error; }
        }
        if (!opened) throw connectionError || new IngestProviderError("TIMEOUT", "媒体连接失败。", true);
        if (opened.status >= 300 && opened.status < 400) {
          opened.response.resume();
          if (!opened.headers.location) throw new IngestProviderError("INVALID_REDIRECT", "媒体重定向缺少目标地址。", false);
          if (redirect === maxRedirects) throw new IngestProviderError("TOO_MANY_REDIRECTS", "媒体重定向次数过多。", false);
          current = new URL(opened.headers.location, url).toString();
          continue;
        }
        if (opened.status >= 500) {
          opened.response.resume();
          throw new IngestProviderError("UPSTREAM_5XX", "媒体服务暂时不可用。", true, opened.status);
        }
        if (opened.status < 200 || opened.status >= 300) {
          opened.response.resume();
          throw new IngestProviderError("UPSTREAM_4XX", `媒体地址返回 HTTP ${opened.status}。`, false, opened.status);
        }
        const declaredLength = Number(opened.headers.contentLength ?? 0);
        if (declaredLength > maxBytes) {
          opened.response.destroy();
          throw new IngestProviderError("RESPONSE_TOO_LARGE", "媒体文件超过大小限制。", false);
        }
        const mimeType = expectedMime(input.kind, opened.headers.contentType);
        let sizeBytes = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            sizeBytes += chunk.length;
            callback(sizeBytes > maxBytes ? new IngestProviderError("RESPONSE_TOO_LARGE", "媒体文件超过大小限制。", false) : null, chunk);
          },
        });
        await pipeline(opened.response, limiter, createWriteStream(tempFile), { signal: AbortSignal.timeout(timeoutMs) });
        if (opened.status === 206) {
          const range = opened.headers.contentRange?.match(/^bytes 0-(\d+)\/(\d+)$/);
          if (!range || Number(range[1]) + 1 !== Number(range[2]) || sizeBytes !== Number(range[2])) throw new IngestProviderError("PARTIAL_MEDIA", "媒体下载不完整。", true);
        }
        if (sizeBytes === 0) throw new IngestProviderError("EMPTY_MEDIA", "媒体文件为空。", false);
        await input.onBeforeStore?.();
        const storageKey = typeof input.storageKey === "function" ? input.storageKey({ mimeType }) : input.storageKey;
        await this.storage.upload({
          key: storageKey,
          body: createReadStream(tempFile),
          contentType: mimeType,
          contentLength: sizeBytes,
          assetScope: input.assetScope,
        });
        return { storageKey, mimeType, sizeBytes, finalUrl: url.toString() };
      }
      throw new IngestProviderError("TOO_MANY_REDIRECTS", "媒体重定向次数过多。", false);
    } catch (error) {
      throw mapMediaError(error);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }
}
