import { describe, expect, it } from "vitest";
import { resolveStoragePath, StoragePathSecurityError } from "./storage-path";

describe("resolveStoragePath", () => {
  it("resolves a normal logical key beneath the media root", () => {
    const resolved = resolveStoragePath("/var/data/xsj-media", "workspaces/w/sources/s/assets/a/original.mp4");
    expect(resolved).toContain("workspaces");
    expect(resolved).toContain("original.mp4");
  });

  it.each([
    "../../etc/passwd",
    "..\\..\\secret",
    "/etc/passwd",
    "C:\\Windows\\system.ini",
    "%2e%2e%2fsecret",
    "%252e%252e%252fsecret",
    "workspaces/w/../secret",
    "workspaces/w/%00secret",
  ])("blocks unsafe key %s", (key) => {
    expect(() => resolveStoragePath("/var/data/xsj-media", key)).toThrow(StoragePathSecurityError);
  });
});
