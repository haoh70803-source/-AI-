import type { SystemRole } from "@content-center/db";

export const BOOTSTRAP_ADMIN_PASSWORD_REQUIRED_FOR_NEW_USER = "BOOTSTRAP_ADMIN_PASSWORD_REQUIRED_FOR_NEW_USER";

type BootstrapUser = { id: string; systemRole: SystemRole };

type BootstrapDependencies = {
  findUserByEmail: (email: string) => Promise<BootstrapUser | null>;
  promoteUser: (userId: string) => Promise<void>;
  createUser: (input: { email: string; password: string }) => Promise<{ id: string }>;
  ensurePersonalWorkspace: (userId: string) => Promise<void>;
};

export type BootstrapResult =
  | { status: "ALREADY_SYSTEM_ADMIN"; userId: string }
  | { status: "ADMIN_PROMOTED"; userId: string }
  | { status: "ADMIN_CREATED"; userId: string };

export async function bootstrapSystemAdmin(
  input: { email: string; password?: string },
  dependencies: BootstrapDependencies,
): Promise<BootstrapResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("BOOTSTRAP_ADMIN_EMAIL_REQUIRED");

  const existing = await dependencies.findUserByEmail(email);
  if (existing) {
    if (existing.systemRole === "SYSTEM_ADMIN") return { status: "ALREADY_SYSTEM_ADMIN", userId: existing.id };
    await dependencies.promoteUser(existing.id);
    return { status: "ADMIN_PROMOTED", userId: existing.id };
  }

  if (!input.password || input.password.length < 8) {
    throw new Error(BOOTSTRAP_ADMIN_PASSWORD_REQUIRED_FOR_NEW_USER);
  }
  const created = await dependencies.createUser({ email, password: input.password });
  await dependencies.promoteUser(created.id);
  await dependencies.ensurePersonalWorkspace(created.id);
  return { status: "ADMIN_CREATED", userId: created.id };
}
