import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import type { LookupFunction } from "node:net";
import { resolvePublicAddress } from "./safe-url";
import { assertReviewExternalAllowed } from "./review-policy";

/** Credential-bearing requests: pinned DNS, no redirects, bounded response, no raw errors. */
export const providerFetch: typeof fetch = async (input, init = {}) => {
  assertReviewExternalAllowed();
  const target = new URL(input instanceof Request ? input.url : String(input));
  const testOrigin = process.env.ENVIRONMENT_ID === "LOCAL_TEST" ? process.env.PROVIDER_TEST_ORIGIN : undefined;
  if ((target.protocol !== "https:" && target.origin !== testOrigin) || target.username || target.password) throw new Error("PROVIDER_ADDRESS_INVALID");
  const { addresses } = await resolvePublicAddress(target.href, undefined, testOrigin);
  const address = addresses[0]!;
  return new Promise<Response>((resolve, reject) => {
    const lookup: LookupFunction = (_host, options, callback) => callback(null, options.all ? [address] : address.address, options.all ? undefined : address.family);
    const request = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
      method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers)), lookup,
      signal: init.signal ?? AbortSignal.timeout(20_000),
    }, response => {
      const status = response.statusCode ?? 502;
      if (status >= 300 && status < 400) { response.resume(); reject(new Error("PROVIDER_REDIRECT_BLOCKED")); return; }
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      let size = 0;
      // Preserve SSE streaming and backpressure for the existing AI runtime.
      const iterator = response[Symbol.asyncIterator]();
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const chunk = await iterator.next();
            if (chunk.done) { controller.close(); return; }
            size += chunk.value.length;
            if (size > 16 * 1024 * 1024) { response.destroy(); controller.error(new Error("PROVIDER_RESPONSE_TOO_LARGE")); return; }
            controller.enqueue(chunk.value);
          } catch { controller.error(init.signal?.aborted ? new DOMException("Request timed out", "TimeoutError") : new Error("PROVIDER_NETWORK_FAILED")); }
        },
        cancel() { response.destroy(); },
      });
      resolve(new Response(status === 204 ? null : stream, { status, headers }));
    });
    if (!init.signal) request.setTimeout(20_000, () => request.destroy(new Error("PROVIDER_TIMEOUT")));
    request.on("error", () => reject(init.signal?.aborted ? new DOMException("Request aborted", "AbortError") : new Error("PROVIDER_NETWORK_FAILED")));
    request.end(typeof init.body === "string" ? init.body : undefined);
  });
};
