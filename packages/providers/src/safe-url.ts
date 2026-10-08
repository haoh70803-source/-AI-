import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";
import { normalizeSourceUrl } from "@content-center/core";
import { IngestProviderError } from "./ingest-error";
import { assertReviewExternalAllowed } from "./review-policy";

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;
export type SafeTransport = (
  url: URL,
  address: ResolvedAddress,
  options: { timeoutMs: number; maxBytes: number },
) => Promise<{ status: number; headers: Record<string, string | undefined>; body: string }>;

export type SafeFetchOptions = {
  resolver?: AddressResolver;
  transport?: SafeTransport;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  allowedTestOrigin?: string;
};

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const a = parts[0] ?? -1;
  const b = parts[1] ?? -1;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isBlockedAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  const family = isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family !== 6) return true;
  if (normalized.startsWith("::")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isBlockedIpv4(mapped) : false;
}

async function defaultResolver(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

export async function resolvePublicAddress(
  input: string,
  resolver: AddressResolver = defaultResolver,
  allowedTestOrigin?: string,
): Promise<{ url: URL; addresses: ResolvedAddress[] }> {
  assertReviewExternalAllowed();
  let url: URL;
  try {
    url = new URL(normalizeSourceUrl(input));
  } catch {
    throw new IngestProviderError("INVALID_URL", "URL 无效或协议不受支持。", false);
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new IngestProviderError("SSRF_BLOCKED", "目标地址不允许访问。", false);
  }

  const testOriginAllowed =
    process.env.NODE_ENV !== "production" && allowedTestOrigin && url.origin === allowedTestOrigin;
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
    : await resolver(hostname).catch(() => {
        throw new IngestProviderError("DNS_TEMPORARY", "域名暂时无法解析。", true);
      });

    if (addresses.length === 0) throw new IngestProviderError("DNS_TEMPORARY", "域名没有可用地址。", true);
  if (!testOriginAllowed && addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new IngestProviderError("SSRF_BLOCKED", "目标地址不允许访问。", false);
  }
  return { url, addresses };
}

const defaultTransport: SafeTransport = (url, address, options) =>
  new Promise((resolve, reject) => {
    const requester = url.protocol === "https:" ? httpsRequest : httpRequest;
    const lookup: LookupFunction = (_hostname, options, callback) => {
      callback(
        null,
        options.all ? [{ address: address.address, family: address.family }] : address.address,
        options.all ? undefined : address.family,
      );
    };
    const request = requester(
      url,
      {
        method: "GET",
        headers: {
          accept: "text/html,text/plain;q=0.9",
          "user-agent": "ContentCenterBot/0.1 (+public-page-ingest)",
        },
        lookup,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const headers = {
          location: response.headers.location,
          "content-type": response.headers["content-type"],
          "content-length": response.headers["content-length"],
        };
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ status, headers, body: "" });
          return;
        }

        const declaredLength = Number(headers["content-length"] ?? 0);
        if (declaredLength > options.maxBytes) {
          response.destroy();
          reject(new IngestProviderError("RESPONSE_TOO_LARGE", "网页响应超过大小限制。", false));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > options.maxBytes) {
            response.destroy(new IngestProviderError("RESPONSE_TOO_LARGE", "网页响应超过大小限制。", false));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, headers, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new IngestProviderError("TIMEOUT", "网页请求超时。", true));
    });
    request.on("error", (error) => {
      reject(
        error instanceof IngestProviderError
          ? error
          : new IngestProviderError("NETWORK_TEMPORARY", "网页暂时无法访问。", true),
      );
    });
    request.end();
  });

export async function fetchPublicText(input: string, options: SafeFetchOptions = {}) {
  assertReviewExternalAllowed();
  const resolver = options.resolver ?? defaultResolver;
  const transport = options.transport ?? defaultTransport;
  const maxRedirects = options.maxRedirects ?? 4;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let current = input;

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const { url, addresses } = await resolvePublicAddress(current, resolver, options.allowedTestOrigin);
    const address = addresses[0];
    if (!address) throw new IngestProviderError("DNS_TEMPORARY", "域名没有可用地址。", true);
    const response = await transport(url, address, { timeoutMs, maxBytes });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) throw new IngestProviderError("INVALID_REDIRECT", "网页重定向缺少目标地址。", false);
      if (redirect === maxRedirects) throw new IngestProviderError("TOO_MANY_REDIRECTS", "网页重定向次数过多。", false);
      current = new URL(location, url).toString();
      continue;
    }
    if (response.status >= 500) {
      throw new IngestProviderError("UPSTREAM_5XX", "网页服务暂时不可用。", true, response.status);
    }
    if (response.status >= 400 || response.status < 200) {
      throw new IngestProviderError("UPSTREAM_4XX", `网页返回 HTTP ${response.status}。`, false, response.status);
    }
    const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new IngestProviderError("UNSUPPORTED_CONTENT", "URL 不是可提取的公开网页。", false);
    }
    return { finalUrl: url.toString(), body: response.body, contentType };
  }
  throw new IngestProviderError("TOO_MANY_REDIRECTS", "网页重定向次数过多。", false);
}
