import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as directAuthPost } from "../app/api/auth/[...all]/route";
import { registerInternalUser } from "../server/internal-signup";

describe("invite-protected internal signup", () => {
  const inviteCode = `test-invite-${randomUUID()}`;
  const email = `internal-signup-${randomUUID()}@example.test`;
  const previousEnabled = process.env.INTERNAL_SIGNUP_ENABLED;
  const previousInviteCode = process.env.INTERNAL_SIGNUP_INVITE_CODE;

  beforeAll(() => {
    process.env.INTERNAL_SIGNUP_ENABLED = "true";
    process.env.INTERNAL_SIGNUP_INVITE_CODE = inviteCode;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { members: { some: { user: { email } } } } });
    await db.user.deleteMany({ where: { email } });
    if (previousEnabled === undefined) delete process.env.INTERNAL_SIGNUP_ENABLED;
    else process.env.INTERNAL_SIGNUP_ENABLED = previousEnabled;
    if (previousInviteCode === undefined) delete process.env.INTERNAL_SIGNUP_INVITE_CODE;
    else process.env.INTERNAL_SIGNUP_INVITE_CODE = previousInviteCode;
    await db.$disconnect();
  });

  function request(body: Record<string, unknown>) {
    return new Request("http://localhost:3000/api/internal-signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("denies a wrong or missing invite code", async () => {
    const base = { name: "Internal User", email, password: "safe-test-password" };
    await expect(registerInternalUser(request({ ...base, inviteCode: "wrong" }))).resolves.toMatchObject({ status: 403 });
    await expect(registerInternalUser(request(base))).resolves.toMatchObject({ status: 400 });
    await expect(db.user.findUnique({ where: { email } })).resolves.toBeNull();
  });

  it("blocks the raw Better Auth signup endpoint", async () => {
    const directRequest = new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bypass User", email, password: "safe-test-password" }),
    });
    expect((await directAuthPost(directRequest)).status).toBe(403);
    expect((await directAuthPost(new Request("http://localhost:3000/api/auth/sign-up/email/", { method: "POST" }))).status).toBe(403);
    await expect(db.user.findUnique({ where: { email } })).resolves.toBeNull();
  });

  it("creates a USER session and personal workspace with the correct invite code", async () => {
    const response = await registerInternalUser(request({ name: "Internal User", email, password: "safe-test-password", inviteCode }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")?.includes(`${process.env.AUTH_COOKIE_PREFIX || "better-auth"}.session_token=`)).toBe(true);

    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { workspaceMemberships: { include: { workspace: true } } },
    });
    expect(user.systemRole).toBe("USER");
    expect(user.workspaceMemberships).toHaveLength(1);
    expect(user.workspaceMemberships[0]).toMatchObject({ role: "OWNER" });
  });
});
