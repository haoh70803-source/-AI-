import { describe, expect, it, vi } from "vitest";
import {
  resolveStagingAdminBootstrapConfig,
  runStagingAdminBootstrap,
  STAGING_ADMIN_BOOTSTRAP_EMAIL_REQUIRED,
  STAGING_ADMIN_BOOTSTRAP_PASSWORD_REQUIRED,
  STAGING_ADMIN_BOOTSTRAP_PASSWORD_WEAK,
  STAGING_ADMIN_BOOTSTRAP_STAGING_ONLY,
} from "../server/admin/staging-bootstrap";

const validEnv = {
  APP_ENV: "staging",
  STAGING_ADMIN_BOOTSTRAP_ENABLED: "true",
  STAGING_ADMIN_BOOTSTRAP_EMAIL: "admin@example.test",
  STAGING_ADMIN_BOOTSTRAP_PASSWORD: "Strong-admin-123",
};

describe("bounded staging admin bootstrap", () => {
  it("does nothing unless explicitly enabled", async () => {
    const bootstrap = vi.fn();
    await expect(runStagingAdminBootstrap({ APP_ENV: "staging" }, bootstrap)).resolves.toEqual({ status: "DISABLED" });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it("fails closed outside the explicit staging environment", () => {
    expect(() => resolveStagingAdminBootstrapConfig({ ...validEnv, APP_ENV: "production" })).toThrow(STAGING_ADMIN_BOOTSTRAP_STAGING_ONLY);
    expect(() => resolveStagingAdminBootstrapConfig({ ...validEnv, NODE_ENV: "production", APP_ENV: undefined })).toThrow(STAGING_ADMIN_BOOTSTRAP_STAGING_ONLY);
  });

  it("requires an email and a strong password", () => {
    expect(() => resolveStagingAdminBootstrapConfig({ ...validEnv, STAGING_ADMIN_BOOTSTRAP_EMAIL: "" })).toThrow(STAGING_ADMIN_BOOTSTRAP_EMAIL_REQUIRED);
    expect(() => resolveStagingAdminBootstrapConfig({ ...validEnv, STAGING_ADMIN_BOOTSTRAP_PASSWORD: "" })).toThrow(STAGING_ADMIN_BOOTSTRAP_PASSWORD_REQUIRED);
    expect(() => resolveStagingAdminBootstrapConfig({ ...validEnv, STAGING_ADMIN_BOOTSTRAP_PASSWORD: "short" })).toThrow(STAGING_ADMIN_BOOTSTRAP_PASSWORD_WEAK);
  });

  it("normalizes the email without exposing the password", () => {
    expect(resolveStagingAdminBootstrapConfig({ ...validEnv, STAGING_ADMIN_BOOTSTRAP_EMAIL: " Admin@Example.Test " })).toEqual({
      enabled: true,
      email: "admin@example.test",
      password: "Strong-admin-123",
    });
  });

  it("delegates creation and preserves the domain result for idempotent runs", async () => {
    const bootstrap = vi.fn()
      .mockResolvedValueOnce({ status: "ADMIN_CREATED", userId: "created-user" })
      .mockResolvedValueOnce({ status: "ALREADY_SYSTEM_ADMIN", userId: "created-user" });

    await expect(runStagingAdminBootstrap(validEnv, bootstrap)).resolves.toEqual({ status: "ADMIN_CREATED", userId: "created-user" });
    await expect(runStagingAdminBootstrap(validEnv, bootstrap)).resolves.toEqual({ status: "ALREADY_SYSTEM_ADMIN", userId: "created-user" });
    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(bootstrap).toHaveBeenNthCalledWith(1, { email: "admin@example.test", password: "Strong-admin-123" });
    expect(bootstrap).toHaveBeenNthCalledWith(2, { email: "admin@example.test", password: "Strong-admin-123" });
  });
});
