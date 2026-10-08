import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { hashPassword } from "better-auth/crypto";
import { createLocalAccountIssuer } from "@better-auth/core/db";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55438" || url.pathname !== "/content_center_12_review") throw Error("FUSION_DATABASE_SCOPE_REQUIRED");
  const email = "admin@workbench.local";
  if (await db.user.findUnique({ where: { email } })) { console.log("FUSION_ACCOUNT_ALREADY_EXISTS"); return; }
  if (await db.user.count()) throw Error("FUSION_BOOTSTRAP_REQUIRES_EMPTY_DATABASE");
  const password = process.env.FUSION_INITIAL_PASSWORD;
  if (!password || password.length < 16) throw Error("FUSION_INITIAL_PASSWORD_REQUIRED");
  const hashed = await hashPassword(password);
  const user = await db.$transaction(async tx => {
    const created = await tx.user.create({ data: { name: "工作台管理员", email, systemRole: "SYSTEM_ADMIN" } });
    await tx.account.create({ data: { userId: created.id, accountId: created.id, providerId: "credential", issuer: createLocalAccountIssuer("credential"), password: hashed } });
    return created;
  });
  await ensurePersonalWorkspaceForUser(db, { userId: user.id });
  console.log("FUSION_LOCAL_ACCOUNT_CREATED");
}
main().catch(error => { console.error(error instanceof Error && error.message.startsWith("FUSION_") ? error.message : "FUSION_BOOTSTRAP_FAILED"); process.exitCode = 1; }).finally(() => db.$disconnect());
