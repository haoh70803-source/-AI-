import { describe, expect, it, vi, afterEach } from "vitest";
import { signDirectorySelection, verifyDirectorySelection } from "../server/local-directory-picker";
afterEach(() => vi.unstubAllEnvs());
describe("local directory selections", () => {
  it("binds a native directory choice to the company and user", () => { vi.stubEnv("AUTH_SECRET", "local-test-signing-key"); const token = signDirectorySelection("company", "owner", "D:\\Selected"); expect(verifyDirectorySelection(token, "company", "owner")).toBe("D:\\Selected"); expect(() => verifyDirectorySelection(token, "other", "owner")).toThrow(); expect(() => verifyDirectorySelection(token, "company", "other")).toThrow(); expect(() => verifyDirectorySelection(token + "x", "company", "owner")).toThrow(); });
  it("expires unused directory selections", () => { vi.stubEnv("AUTH_SECRET", "local-test-signing-key"); const token = signDirectorySelection("company", "owner", "D:\\Selected"); const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now()+360000); try { expect(() => verifyDirectorySelection(token,"company","owner")).toThrow(); } finally { clock.mockRestore(); } });
});
