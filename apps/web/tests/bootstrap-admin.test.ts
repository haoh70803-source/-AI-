import { describe, expect, it, vi } from "vitest";
import { BOOTSTRAP_ADMIN_PASSWORD_REQUIRED_FOR_NEW_USER, bootstrapSystemAdmin } from "../server/admin/bootstrap";

function dependencies(user: { id: string; systemRole: "USER" | "SYSTEM_ADMIN" } | null) {
  return {
    findUserByEmail: vi.fn(async () => user),
    promoteUser: vi.fn(async () => undefined),
    createUser: vi.fn(async () => ({ id: "created-user" })),
    ensurePersonalWorkspace: vi.fn(async () => undefined),
  };
}

describe("system admin bootstrap", () => {
  it("promotes an existing USER without a password or workspace changes", async () => {
    const deps = dependencies({ id: "existing-user", systemRole: "USER" });
    await expect(bootstrapSystemAdmin({ email: " Admin@Example.Test " }, deps)).resolves.toEqual({ status: "ADMIN_PROMOTED", userId: "existing-user" });
    expect(deps.promoteUser).toHaveBeenCalledWith("existing-user");
    expect(deps.createUser).not.toHaveBeenCalled();
    expect(deps.ensurePersonalWorkspace).not.toHaveBeenCalled();
  });

  it("is idempotent for an existing SYSTEM_ADMIN", async () => {
    const deps = dependencies({ id: "admin", systemRole: "SYSTEM_ADMIN" });
    await expect(bootstrapSystemAdmin({ email: "admin@example.test" }, deps)).resolves.toEqual({ status: "ALREADY_SYSTEM_ADMIN", userId: "admin" });
    expect(deps.promoteUser).not.toHaveBeenCalled();
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("does not require a password when the existing user is not an admin", async () => {
    const deps = dependencies({ id: "existing-user", systemRole: "USER" });
    await expect(bootstrapSystemAdmin({ email: "admin@example.test", password: undefined }, deps)).resolves.toMatchObject({ status: "ADMIN_PROMOTED" });
  });

  it("requires a password only when creating a new user", async () => {
    const deps = dependencies(null);
    await expect(bootstrapSystemAdmin({ email: "new@example.test" }, deps)).rejects.toThrow(BOOTSTRAP_ADMIN_PASSWORD_REQUIRED_FOR_NEW_USER);
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("creates a new user through the injected Better Auth operation and promotes it", async () => {
    const deps = dependencies(null);
    await expect(bootstrapSystemAdmin({ email: "new@example.test", password: "test-only-password" }, deps)).resolves.toEqual({ status: "ADMIN_CREATED", userId: "created-user" });
    expect(deps.createUser).toHaveBeenCalledWith({ email: "new@example.test", password: "test-only-password" });
    expect(deps.promoteUser).toHaveBeenCalledWith("created-user");
    expect(deps.ensurePersonalWorkspace).toHaveBeenCalledWith("created-user");
  });

  it("does not touch an existing credential when promoting", async () => {
    const deps = dependencies({ id: "existing-user", systemRole: "USER" });
    await bootstrapSystemAdmin({ email: "admin@example.test" }, deps);
    expect(deps.createUser).not.toHaveBeenCalled();
    expect(deps.ensurePersonalWorkspace).not.toHaveBeenCalled();
  });
});
