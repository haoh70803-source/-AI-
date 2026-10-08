import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { auth } from "../lib/auth";
import { bootstrapSystemAdmin } from "../server/admin/bootstrap";
import {
  runStagingAdminBootstrap,
  STAGING_ADMIN_BOOTSTRAP_EMAIL_INVALID,
  STAGING_ADMIN_BOOTSTRAP_EMAIL_REQUIRED,
  STAGING_ADMIN_BOOTSTRAP_PASSWORD_REQUIRED,
  STAGING_ADMIN_BOOTSTRAP_PASSWORD_WEAK,
  STAGING_ADMIN_BOOTSTRAP_STAGING_ONLY,
} from "../server/admin/staging-bootstrap";

async function main() {
  const result = await runStagingAdminBootstrap(process.env, (input) => bootstrapSystemAdmin(input, {
    findUserByEmail: async (value) => db.user.findUnique({ where: { email: value }, select: { id: true, systemRole: true } }),
    promoteUser: async (userId) => { await db.user.update({ where: { id: userId }, data: { systemRole: "SYSTEM_ADMIN" } }); },
    createUser: async (input) => {
      const created = await auth.api.signUpEmail({ body: { name: "System Admin", ...input } });
      return { id: created.user.id };
    },
    ensurePersonalWorkspace: async (userId) => { await ensurePersonalWorkspaceForUser(db, { userId }); },
  }));

  if (result.status === "DISABLED") {
    console.info("STAGING_ADMIN_BOOTSTRAP: DISABLED");
    return;
  }

  console.info(`STAGING_ADMIN_BOOTSTRAP: ${result.status === "ADMIN_CREATED" ? "CREATED" : "ALREADY_PRESENT"}`);
}

main().catch((error) => {
  const safeCodes = new Set([
    STAGING_ADMIN_BOOTSTRAP_STAGING_ONLY,
    STAGING_ADMIN_BOOTSTRAP_EMAIL_REQUIRED,
    STAGING_ADMIN_BOOTSTRAP_EMAIL_INVALID,
    STAGING_ADMIN_BOOTSTRAP_PASSWORD_REQUIRED,
    STAGING_ADMIN_BOOTSTRAP_PASSWORD_WEAK,
  ]);
  const code = error instanceof Error && safeCodes.has(error.message) ? error.message : "STAGING_ADMIN_BOOTSTRAP_FAILED";
  console.error(`STAGING_ADMIN_BOOTSTRAP: ${code}`);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
