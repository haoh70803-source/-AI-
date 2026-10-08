import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../lib/auth";

describe("Better Auth integration", () => {
  const email = `auth-${randomUUID()}@example.test`;
  const sessionEmail = `auth-session-${randomUUID()}@example.test`;

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: [email, sessionEmail] } } });
    await db.$disconnect();
  });

  it("registers and signs in with email/password using the database", async () => {
    const registration = await auth.api.signUpEmail({
      body: { name: "Auth Test", email, password: "safe-test-password" },
    });
    expect(registration.user.email).toBe(email);
    await expect(db.user.findUnique({ where: { email } })).resolves.not.toBeNull();

    const login = await auth.api.signInEmail({ body: { email, password: "safe-test-password" } });
    expect(login.user.email).toBe(email);
    await db.user.update({ where: { id: registration.user.id }, data: { disabledAt: new Date() } });
    await expect(auth.api.signInEmail({ body: { email, password: "safe-test-password" } })).rejects.toThrow();
  });
  it("revokes logged-out sessions and rejects expired sessions", async () => {
    const registration = await auth.api.signUpEmail({ body: { name: "Session Review Fixture", email: sessionEmail, password: "safe-test-password" } });
    async function loginHeaders() {
      const response = await auth.api.signInEmail({ body: { email: sessionEmail, password: "safe-test-password" }, asResponse: true });
      expect(response.ok).toBe(true);
      return new Headers({ cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") });
    }
    const headers = await loginHeaders();
    expect(Boolean(await auth.api.getSession({ headers }))).toBe(true);
    const signout = await auth.api.signOut({ headers, asResponse: true });
    expect(signout.ok).toBe(true);
    expect(Boolean(await auth.api.getSession({ headers }))).toBe(false);
    const renewed = await loginHeaders();
    await db.session.updateMany({ where: { userId: registration.user.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect(Boolean(await auth.api.getSession({ headers: renewed }))).toBe(false);
  });
});
