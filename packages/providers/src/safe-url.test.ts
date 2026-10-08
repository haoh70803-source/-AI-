import { describe, expect, it, vi } from "vitest";
import { IngestProviderError } from "./ingest-error";
import { fetchPublicText, isBlockedAddress, resolvePublicAddress } from "./safe-url";

const publicResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];

describe("SSRF protection", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fd00::1",
    "fe80::1",
  ])("blocks private or metadata address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it("rejects disallowed schemes and localhost", async () => {
    await expect(resolvePublicAddress("file:///etc/passwd", publicResolver)).rejects.toMatchObject({ code: "INVALID_URL" });
    await expect(resolvePublicAddress("http://localhost/admin", publicResolver)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("checks every redirect target before issuing the next request", async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 302,
      headers: { location: "http://127.0.0.1/internal", "content-type": "text/html" },
      body: "",
    });
    await expect(fetchPublicText("https://example.com", { resolver: publicResolver, transport })).rejects.toEqual(
      expect.objectContaining<Partial<IngestProviderError>>({ code: "SSRF_BLOCKED", retryable: false }),
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("accepts a public R2-style signed URL and still rejects private resolution", async () => {
    const publicR2Resolver = async (hostname: string) => hostname.endsWith("r2.cloudflarestorage.com")
      ? [{ address: "104.16.0.1", family: 4 as const }]
      : [{ address: "10.0.0.2", family: 4 as const }];
    await expect(resolvePublicAddress("https://account-id.r2.cloudflarestorage.com/private-bucket/object?X-Amz-Signature=test", publicR2Resolver)).resolves.toMatchObject({ url: expect.any(URL) });
    await expect(resolvePublicAddress("https://internal.example/object", publicR2Resolver)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("limits redirects", async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 302,
      headers: { location: "https://example.com/again", "content-type": "text/html" },
      body: "",
    });
    await expect(fetchPublicText("https://example.com", { resolver: publicResolver, transport, maxRedirects: 1 })).rejects.toMatchObject({
      code: "TOO_MANY_REDIRECTS",
    });
  });
});
