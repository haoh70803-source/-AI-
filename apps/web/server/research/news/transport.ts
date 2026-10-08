import { request } from "node:https";
export type PublicResponse = { status: number; etag: string | null; retryAfter: string | null; body: unknown };
export type PublicOperation = "snapshot" | "changes" | "dailies" | "daily";
export class NewsTransportError extends Error {
  constructor(readonly code: string, readonly status = 503, readonly retryAt: number | null = null) { super(code); }
}
const paths = { snapshot: "/selected/snapshot", changes: "/selected/changes", dailies: "/dailies", daily: "/dailies/" } as const;
const keys: Record<PublicOperation, string[]> = { snapshot: ["fields", "limit", "page"], changes: ["fields", "limit", "cursor"], dailies: ["limit"], daily: [] };
export function publicNewsUrl(operation: PublicOperation, query: Record<string, string> = {}, date?: string) {
  if (!(operation in paths)) throw new NewsTransportError("OPERATION_DENIED", 400);
  if (operation === "daily" && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)) throw new NewsTransportError("INVALID_DATE", 400);
  const url = new URL("https://aihot.news/api/v1" + paths[operation] + (operation === "daily" ? date : ""));
  for (const [key, value] of Object.entries(query)) {
    if (!keys[operation].includes(key) || value.length > 8192 || /[\r\n]/.test(value)) throw new NewsTransportError("QUERY_DENIED", 400);
    if (key === "fields" && value !== "default") throw new NewsTransportError("FIELDS_DENIED", 400);
    if (key === "limit" && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > (operation === "snapshot" ? 1000 : operation === "dailies" ? 180 : 100))) throw new NewsTransportError("LIMIT_DENIED", 400);
    url.searchParams.set(key, value);
  }
  return url;
}
// Deliberately separate from model/collector providers: fixed public origin,
// GET only, no local auth/cookie/context headers, and redirects are never followed.
export function createPublicNewsTransport(allowed = false) {
  return (operation: PublicOperation, query: Record<string, string> = {}, date?: string, etag?: string | null): Promise<PublicResponse> => {
    if (!allowed) return Promise.reject(new NewsTransportError("PUBLIC_NEWS_DISABLED", 503));
    const url = publicNewsUrl(operation, query, date);
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { Accept: "application/json", "Accept-Encoding": "identity", "User-Agent": "XinWorld-local-news/1.0" };
      if (etag && etag.length <= 512 && !/[\r\n]/.test(etag)) headers["If-None-Match"] = etag;
      const req = request(url, { method: "GET", headers, maxHeaderSize: 16384 }, res => {
        const status = res.statusCode || 503;
        const responseHeaders = { status, etag: typeof res.headers.etag === "string" ? res.headers.etag : null, retryAfter: typeof res.headers["retry-after"] === "string" ? res.headers["retry-after"] : null };
        if (status === 304) { res.resume(); resolve({ ...responseHeaders, body: null }); return; }
        if (status >= 300 && status < 400) { res.resume(); reject(new NewsTransportError("REDIRECT_DENIED", 502)); return; }
        if (Number(res.headers["content-length"] || 0) > 4 * 1024 * 1024 || (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
          res.destroy(); reject(new NewsTransportError("RESPONSE_TOO_LARGE_OR_ENCODED", 502)); return;
        }
        const chunks: Buffer[] = []; let length = 0;
        res.on("data", (chunk: Buffer) => { length += chunk.length; if (length > 4 * 1024 * 1024) { res.destroy(); reject(new NewsTransportError("RESPONSE_TOO_LARGE", 502)); } else chunks.push(chunk); });
        res.on("error", () => reject(new NewsTransportError("UPSTREAM_IO", 503)));
        res.on("end", () => {
          if (status !== 200) { resolve({ ...responseHeaders, body: null }); return; }
          if (!String(res.headers["content-type"] || "").includes("application/json")) { reject(new NewsTransportError("INVALID_CONTENT_TYPE", 502)); return; }
          try { resolve({ ...responseHeaders, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); } catch { reject(new NewsTransportError("INVALID_JSON", 502)); }
        });
      });
      const timeout = setTimeout(() => req.destroy(new Error("timeout")), 10000);
      req.on("close", () => clearTimeout(timeout));
      req.on("error", () => reject(new NewsTransportError("UPSTREAM_IO_OR_TIMEOUT", 503)));
      req.end();
    });
  };
}
export type PublicNewsTransport = ReturnType<typeof createPublicNewsTransport>;
