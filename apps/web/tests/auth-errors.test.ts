import { describe, expect, it } from "vitest";
import { loginErrorMessage, AUTH_CREDENTIAL_MESSAGE, AUTH_NETWORK_MESSAGE, AUTH_SERVICE_MESSAGE } from "../lib/auth-errors";
import { loginResponse } from "../server/auth-response";
describe("login failure classification", () => {
  it("keeps nonexistent, incorrect-password and disabled-account failures indistinguishable", () => {
    for (const code of ["INVALID_EMAIL_OR_PASSWORD", "USER_NOT_FOUND", "FAILED_TO_CREATE_SESSION"]) {
      expect(loginErrorMessage({ status: 401, code })).toBe(AUTH_CREDENTIAL_MESSAGE);
    }
    expect(loginErrorMessage({ status: 400 })).toBe(AUTH_CREDENTIAL_MESSAGE);
  });
  it("distinguishes network, unavailable service and rate limiting", () => {
    expect(loginErrorMessage({ status: 0 })).toBe(AUTH_NETWORK_MESSAGE);
    expect(loginErrorMessage(null)).toBe(AUTH_NETWORK_MESSAGE);
    expect(loginErrorMessage({ status: 500 })).toBe(AUTH_SERVICE_MESSAGE);
    expect(loginErrorMessage({ status: 503 })).toBe(AUTH_SERVICE_MESSAGE);
    expect(loginErrorMessage({ code: "AUTH_SERVICE_UNAVAILABLE" })).toBe(AUTH_SERVICE_MESSAGE);
    expect(loginErrorMessage({ status: 429 })).toContain("频繁");
  });
  it("sanitizes thrown infrastructure failures", async () => {
    const response = await loginResponse(async () => { throw new Error("private database details"); });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "AUTH_SERVICE_UNAVAILABLE", message: AUTH_SERVICE_MESSAGE });
  });
  it("replaces raw server errors and preserves auth failures and successful cookies", async () => {
    expect(await (await loginResponse(async () => new Response("private details", { status: 500 }))).text()).not.toContain("private");
    for (const status of [400, 401, 403, 429]) {
      const original = new Response("auth failure", { status });
      expect(await loginResponse(async () => original)).toBe(original);
    }
    const success = new Response("ok", { headers: { "set-cookie": "test-session=placeholder; HttpOnly" } });
    expect(await loginResponse(async () => success)).toBe(success);
  });
});
