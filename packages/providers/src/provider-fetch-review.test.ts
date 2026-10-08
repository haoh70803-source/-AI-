import { afterEach, describe, expect, it, vi } from "vitest";
import { providerFetch } from "./provider-fetch";
afterEach(() => vi.unstubAllEnvs());
describe("isolated account review external-call guard", () => {
  it("rejects before DNS or network even when a valid provider URL is configured", async () => {
    vi.stubEnv("LOCAL_REVIEW_OFFLINE", "true");
    await expect(providerFetch("https://provider.example.invalid/request")).rejects.toThrow("LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED");
  });
});
