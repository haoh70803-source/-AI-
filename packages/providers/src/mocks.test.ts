import { describe, expect, it, vi } from "vitest";
import {
  MockLLMProvider,
  MockPublishingProvider,
  MockSourceProvider,
  MockStorageProvider,
  MockTranscriptionProvider,
} from "./mocks";

describe("mock providers", () => {
  it("marks every response as MOCK and emits the required log marker", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const results = await Promise.all([
      new MockSourceProvider().resolve("https://example.test"),
      new MockTranscriptionProvider().transcribe({ audio: { mode: "BINARY_DATA", data: new Uint8Array() } }),
      new MockLLMProvider().generate({ prompt: "test" }),
      new MockPublishingProvider().publish({ content: "test" }),
      new MockStorageProvider().upload({ key: "test", body: new Uint8Array() }),
    ]);

    expect(results.every((result) => result.providerMode === "MOCK")).toBe(true);
    expect(warning).toHaveBeenCalledTimes(5);
    expect(warning.mock.calls.every(([message]) => message === "MOCK_PROVIDER_USED")).toBe(true);
    warning.mockRestore();
  });
});
