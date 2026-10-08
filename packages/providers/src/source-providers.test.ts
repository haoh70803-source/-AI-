import { describe, expect, it, vi } from "vitest";
import { GenericUrlSourceProvider, ManualTextSourceProvider, MockVideoSourceProvider } from "./source-providers";

describe("ingest source providers", () => {
  it("keeps manual text as readable source content without fabricating a transcript", async () => {
    const result = await new ManualTextSourceProvider().ingest({ value: "真实输入正文", title: "标题" });
    expect(result).toMatchObject({
      providerMode: "REAL",
      data: { rawText: "真实输入正文" },
    });
    expect(result.data.transcript).toBeUndefined();
  });

  it("extracts normalized plain text and metadata from a public HTML page", async () => {
    const provider = new GenericUrlSourceProvider({
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      transport: async () => ({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: `<!doctype html><html><head><title>Fixture Article</title><meta name="author" content="Tester"><link rel="canonical" href="/article?utm_source=test"></head><body><article><h1>Fixture Article</h1><p>This is stable local fixture content for extraction testing.</p><p>Second paragraph contains enough useful text.</p></article></body></html>`,
      }),
    });
    const result = await provider.ingest({ value: "https://example.com/input" });
    expect(result.providerMode).toBe("REAL");
    expect(result.data.metadata).toMatchObject({ title: "Fixture Article", author: "Tester", url: "https://example.com/article" });
    expect(result.data.rawText).toContain("stable local fixture content");
    expect(result.data.transcript).toBeUndefined();
  });

  it("marks mock video output and never accepts a regular video URL", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = new MockVideoSourceProvider();
    expect(provider.supports("https://www.douyin.com/video/1")).toBe(false);
    const result = await provider.ingest({ value: "mock://video/demo-1" });
    expect(result.providerMode).toBe("MOCK");
    expect(result.data.transcript?.fullText).toContain("MOCK MODE");
    expect(warning).toHaveBeenCalledWith("MOCK_PROVIDER_USED", { provider: "MOCK_VIDEO" });
    warning.mockRestore();
  });
});
