import { describe, expect, it } from "vitest";
import { normalizeSourceUrl } from "./source-url";

describe("normalizeSourceUrl", () => {
  it("trims, lowercases the host, removes fragments and tracking parameters", () => {
    expect(normalizeSourceUrl(" HTTPS://Example.COM/article?id=42&utm_source=news#comments ")).toBe(
      "https://example.com/article?id=42",
    );
  });

  it("preserves query parameters that may change page content", () => {
    expect(normalizeSourceUrl("https://example.com/search?q=content&page=2")).toBe(
      "https://example.com/search?q=content&page=2",
    );
  });

  it("uses a supplied canonical URL first", () => {
    expect(normalizeSourceUrl("https://example.com/a?utm_medium=x", "https://example.com/canonical#top")).toBe(
      "https://example.com/canonical",
    );
  });

  it("rejects non-HTTP schemes", () => {
    expect(() => normalizeSourceUrl("file:///etc/passwd")).toThrow(/HTTP/);
  });
});
