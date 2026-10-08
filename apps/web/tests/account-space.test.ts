import { randomUUID } from "node:crypto";
import { db, findWorkspaceForUser } from "@content-center/db";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { auth } from "../lib/auth";
import { createMember, changeMember, transferWorkspaceOwner } from "../server/account-space";
import { resolveWorkspaceMembership } from "../server/workspace-context";

describe("account space: permissions and isolation", () => {
  const prefix = `account-${randomUUID()}`;
  const emails: string[] = [];
  let handoffCompany = "";
  let owner = "", company = "", otherCompany = "", admin = "", adminMember = "", editor = "", editorMember = "", ownerMember = "";
  const password = "test-account-password-123";
  const input = (name: string, role: "ADMIN" | "EDITOR" | "VIEWER" = "EDITOR") => { const email = `${prefix}-${name}@example.test`.toLowerCase(); emails.push(email); return { name, email, password, role }; };
  beforeAll(async () => {
    const data = input("Owner"); const registration = await auth.api.signUpEmail({ body: data }); owner = registration.user.id;
    const a = await db.workspace.create({ data: { name: "Company A", slug: `${prefix}-a`, members: { create: { userId: owner, role: "OWNER" } } } }); company = a.id;
    otherCompany = (await db.workspace.create({ data: { name: "Company B", slug: `${prefix}-b`, members: { create: { userId: owner, role: "OWNER" } } } })).id;
    ownerMember = (await db.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: company, userId: owner } } })).id;
    adminMember = (await createMember(company, owner, input("Admin", "ADMIN"))).id;
    admin = (await db.workspaceMember.findUniqueOrThrow({ where: { id: adminMember } })).userId;
    editorMember = (await createMember(company, owner, input("Editor"))).id;
    editor = (await db.workspaceMember.findUniqueOrThrow({ where: { id: editorMember } })).userId;
  });
  afterAll(async () => { await db.workspace.deleteMany({ where: { id: { in: [company, otherCompany, handoffCompany].filter(Boolean) } } }); await db.user.deleteMany({ where: { email: { in: emails } } }); await db.$disconnect(); });
  it("creates a member usable by the existing Better Auth login", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: editor } });
    const login = await auth.api.signInEmail({ body: { email: user.email, password } });
    expect(login.user.id).toBe(editor);
    expect(await db.account.count({ where: { userId: editor, providerId: "credential" } })).toBe(1);
  });
  it("blocks editors, administrator escalation, self changes and owner changes", async () => {
    await expect(createMember(company, editor, input("Denied"))).rejects.toMatchObject({ status: 403 });
    await expect(createMember(company, admin, input("AdminDenied", "ADMIN"))).rejects.toMatchObject({ status: 403 });
    for (const actor of [owner, admin]) await expect(changeMember(company, actor, ownerMember, { role: "VIEWER" })).rejects.toMatchObject({ status: 403 });
    await expect(changeMember(company, admin, adminMember, { disabled: true })).rejects.toMatchObject({ status: 403 });
    await expect(changeMember(company, admin, editorMember, { role: "ADMIN" })).rejects.toMatchObject({ status: 403 });
  });
  it("blocks cross-company reads and mutations even for an owner", async () => {
    expect(await findWorkspaceForUser(db, { userId: editor, workspaceId: otherCompany })).toBeNull();
    await expect(changeMember(otherCompany, owner, editorMember, { disabled: true })).rejects.toMatchObject({ status: 404 });
  });
  it("pins selection and refuses an old session after company membership is disabled", async () => {
    const session = await db.session.findFirstOrThrow({ where: { userId: editor } });
    expect((await resolveWorkspaceMembership(editor, session.id))?.workspaceId).toBe(company);
    await db.workspaceMember.create({ data: { workspaceId: otherCompany, userId: editor, role: "EDITOR" } });
    await changeMember(company, admin, editorMember, { disabled: true });
    expect(await resolveWorkspaceMembership(editor, session.id)).toBeNull();
    expect(await findWorkspaceForUser(db, { userId: editor, workspaceId: company })).toBeNull();
    expect(await findWorkspaceForUser(db, { userId: editor, workspaceId: otherCompany })).not.toBeNull();
    await changeMember(company, admin, editorMember, { disabled: false });
    expect((await resolveWorkspaceMembership(editor, session.id))?.workspaceId).toBe(company);
  });
  it("does not reuse an existing identity or reset its password", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: editor } });
    await expect(createMember(otherCompany, owner, { name: "Replacement", email: user.email, password, role: "EDITOR" })).rejects.toMatchObject({ status: 409 });
    expect((await db.user.findUniqueOrThrow({ where: { id: editor } })).name).toBe("Editor");
  });
  it("honors company and global user disablement", async () => {
    const session = await db.session.findFirstOrThrow({ where: { userId: editor } });
    await db.workspace.update({ where: { id: company }, data: { disabledAt: new Date() } });
    expect(await resolveWorkspaceMembership(editor, session.id)).toBeNull();
    await db.workspace.update({ where: { id: company }, data: { disabledAt: null } });
    await db.user.update({ where: { id: editor }, data: { disabledAt: new Date() } });
    expect(await resolveWorkspaceMembership(editor, session.id)).toBeNull();
    await db.user.update({ where: { id: editor }, data: { disabledAt: null } });
  });
  it("refuses a misleading membership restore when the global account is disabled", async () => {
    await changeMember(company, owner, editorMember, { disabled: true });
    await db.user.update({ where: { id: editor }, data: { disabledAt: new Date() } });
    await expect(changeMember(company, owner, editorMember, { disabled: false })).rejects.toMatchObject({ status: 409 });
    expect((await db.workspaceMember.findUniqueOrThrow({ where: { id: editorMember } })).disabledAt).not.toBeNull();
    await db.user.update({ where: { id: editor }, data: { disabledAt: null } });
    await changeMember(company, owner, editorMember, { disabled: false });
  });
  it("serializes competing owner transfers and keeps exactly one effective owner", async () => {
    handoffCompany = (await db.workspace.create({ data: { name: "Handoff fixture", slug: prefix+"-handoff", members: { create: [{ userId: owner, role: "OWNER" },{userId: admin,role:"ADMIN"},{userId:editor,role:"EDITOR"}] } } })).id;
    const [a,b] = await Promise.all([db.workspaceMember.findUniqueOrThrow({where:{workspaceId_userId:{workspaceId:handoffCompany,userId:admin}}}),db.workspaceMember.findUniqueOrThrow({where:{workspaceId_userId:{workspaceId:handoffCompany,userId:editor}}})]);
    await expect(transferWorkspaceOwner(otherCompany,owner,a.id)).rejects.toMatchObject({status:400});
    const outcomes = await Promise.allSettled([transferWorkspaceOwner(handoffCompany,owner,a.id),transferWorkspaceOwner(handoffCompany,owner,b.id)]);
    expect(outcomes.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(await db.workspaceMember.count({where:{workspaceId:handoffCompany,role:"OWNER",disabledAt:null,user:{disabledAt:null}}})).toBe(1);
    expect((await db.workspaceMember.findUniqueOrThrow({where:{workspaceId_userId:{workspaceId:handoffCompany,userId:owner}}})).role).toBe("ADMIN");
  });
  it("changes roles and removes only membership, preserving the user", async () => {
    await changeMember(company, admin, editorMember, { role: "VIEWER" });
    expect((await db.workspaceMember.findUniqueOrThrow({ where: { id: editorMember } })).role).toBe("VIEWER");
    await changeMember(company, admin, editorMember, null, true);
    expect(await db.workspaceMember.findUnique({ where: { id: editorMember } })).toBeNull();
    expect(await db.user.findUnique({ where: { id: editor } })).not.toBeNull();
  });
});
