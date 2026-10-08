import { describe, expect, it, vi } from "vitest";
import type { IntegrationService } from "@content-center/integrations";
vi.mock("@content-center/providers", async importOriginal => ({ ...await importOriginal<typeof import("@content-center/providers")>(), providerFetch: vi.fn() }));
import { providerFetch } from "@content-center/providers";
import { testIntegration } from "../server/integration-test";
const secret = "never-echo-this-key";
const service = { getDecryptedIntegrationConfig: async () => ({ baseUrl: "https://example.invalid/v1", apiKey: secret, model: "model" }) } as unknown as IntegrationService;
describe("connection failure messages", () => {
  it.each([
    [401, {}, "API Key 无效"],
    [404, { error: { code: "model_not_found", message: secret } }, "模型不存在"],
    [404, { message: secret }, "API 地址"],
    [429, { error: { code: "rate_limit", message: secret } }, "请求过于频繁"],
  ])("maps %s without reflecting upstream secrets", async (status, body, expected) => {
    vi.mocked(providerFetch).mockResolvedValueOnce(new Response(JSON.stringify(body), { status: Number(status) }));
    const result = await testIntegration("company", "LLM", undefined, service);
    expect(result.ok).toBe(false); expect(result.message).toContain(expected); expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("maps a real transport abort to a friendly timeout", async () => {
    vi.mocked(providerFetch).mockRejectedValueOnce(new DOMException(secret, "AbortError"));
    const result = await testIntegration("company", "LLM", undefined, service);
    expect(result.message).toContain("连接超时"); expect(JSON.stringify(result)).not.toContain(secret);
  });
});
