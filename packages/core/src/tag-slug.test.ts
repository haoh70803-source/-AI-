import { describe, expect, it } from "vitest";
import { slugifyTag } from "./slug";

describe("slugifyTag", () => {
  it("creates stable slugs without discarding Chinese text", () => {
    expect(slugifyTag("  内容 营销 2026  ")).toBe("内容-营销-2026");
  });
});
