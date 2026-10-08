export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function canReadWorkspace(role: WorkspaceRole): boolean {
  return WORKSPACE_ROLES.includes(role);
}

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function hasWorkspaceRole(
  role: WorkspaceRole,
  allowedRoles: readonly WorkspaceRole[],
): boolean {
  return allowedRoles.includes(role);
}
