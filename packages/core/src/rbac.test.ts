import { describe, expect, it } from "vitest";
import { canManageWorkspace, canReadWorkspace, hasWorkspaceRole, WORKSPACE_ROLES } from "./rbac";

describe("workspace roles", () => {
  it("allows every member to read but only owners and admins to manage", () => {
    expect(WORKSPACE_ROLES.every(canReadWorkspace)).toBe(true);
    expect(WORKSPACE_ROLES.filter(canManageWorkspace)).toEqual(["OWNER", "ADMIN"]);
    expect(hasWorkspaceRole("VIEWER", ["OWNER", "ADMIN"])).toBe(false);
  });
});
