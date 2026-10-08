import { describe, expect, it } from "vitest";
import { slugifyWorkspaceName } from "./slug";

describe("slugifyWorkspaceName", () => {
  it("creates a safe slug and falls back for non-latin names", () => {
    expect(slugifyWorkspaceName("My Content Team")).toBe("my-content-team");
    expect(slugifyWorkspaceName("内容团队")).toBe("workspace");
  });
});
