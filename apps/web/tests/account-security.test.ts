import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
import { requestPasswordRecovery, finishPasswordRecovery, requestEmailVerification, finishEmailVerification, issueInvitation, acceptInvitation, revokeInvitation, openCustomerWorkspace } from "../server/account-security";
import { createInternalPlatformUser } from "../server/account-space";
import type { AccountDelivery, AccountMail } from "../server/account-delivery";
const users: string[] = [], spaces: string[] = [], grants: string[] = [], mails: AccountMail[] = [];
const suffix=randomUUID(), originalPassword="fixture-original-password";
let owner="", invited="", other="", admin="", company="", foreign="", invitedPassword=originalPassword;
const email=(label:string)=>label+"-"+suffix+"@example.test";
const delivery: AccountDelivery=async mail=>{mails.push(mail);if(mail.url){const token=new URLSearchParams(new URL(mail.url).hash.slice(1)).get("token")!;grants.push("account-challenge:"+createHash("sha256").update(token).digest("hex"));}};
const token=()=>new URLSearchParams(new URL(mails.at(-1)!.url!).hash.slice(1)).get("token")!;
beforeAll(async()=>{
  for(const label of ["owner","invited","other","admin"]){const result=await auth.api.signUpEmail({body:{name:"Fixture "+label,email:email(label),password:originalPassword}});users.push(result.user.id);}
  owner=users[0]!;invited=users[1]!;other=users[2]!;admin=users[3]!;
  await db.user.update({where:{id:admin},data:{systemRole:"SYSTEM_ADMIN"}});
  for(const label of ["company","foreign"]){const row=await db.workspace.create({data:{name:"Fixture "+label,slug:label+"-"+suffix,members:{create:{userId:owner,role:"OWNER"}}}});spaces.push(row.id);}
  company=spaces[0]!;foreign=spaces[1]!;
},60000);
afterAll(async()=>{
  await db.verification.deleteMany({where:{OR:[{id:{in:grants}},{identifier:{in:spaces.map(id=>"account-invite:"+id)}},{identifier:{in:users.map(id=>"account-audit:"+id)}}]}});
  await db.workspace.deleteMany({where:{id:{in:spaces}}});
  await db.user.deleteMany({where:{id:{in:users}}});
},60000);
it("fails closed without delivery before creating users, spaces or challenges",async()=>{
  const before=await db.verification.count();
  await expect(requestPasswordRecovery(email("owner"))).rejects.toMatchObject({status:503});
  await expect(issueInvitation(company,owner,{email:email("fresh"),role:"EDITOR"})).rejects.toMatchObject({status:503});
  const spaceCount=await db.workspace.count();
  await expect(openCustomerWorkspace(admin,{name:"Not created",email:email("fresh")})).rejects.toMatchObject({status:503});
  expect(await db.workspace.count()).toBe(spaceCount);expect(await db.verification.count()).toBe(before);
});
it("gives identical recovery responses for known, missing and globally disabled users",async()=>{
  const a=await requestPasswordRecovery(email("owner"),delivery), count=mails.length;
  const b=await requestPasswordRecovery(email("missing"),delivery);
  await db.user.update({where:{id:other},data:{disabledAt:new Date()}});
  const c=await requestPasswordRecovery(email("other"),delivery);
  expect(a).toEqual(b);expect(b).toEqual(c);expect(mails.length).toBe(count);
  await db.user.update({where:{id:other},data:{disabledAt:null}});
});
it("atomically consumes reset once, revokes all sessions and never auto-signs in",async()=>{
  await requestPasswordRecovery(email("invited"),delivery);const grant=token();
  const outcomes=await Promise.allSettled([finishPasswordRecovery({token:grant,password:"aaaaaaaa"}),finishPasswordRecovery({token:grant,password:"bbbbbbbb"})]);
  expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  expect(await db.session.count({where:{userId:invited}})).toBe(0);
  await expect(finishPasswordRecovery({token:grant,password:"cccccccc"})).rejects.toMatchObject({status:400});
  const chosen=outcomes[0].status==="fulfilled"?"aaaaaaaa":"bbbbbbbb";invitedPassword=chosen;
  expect((await auth.api.signInEmail({body:{email:email("invited"),password:chosen}})).user.id).toBe(invited);
});
it("rejects expired, wrong-purpose and disabled-user recovery without reactivating anything",async()=>{
  await requestPasswordRecovery(email("other"),delivery);const grant=token();
  await db.user.update({where:{id:other},data:{disabledAt:new Date()}});
  await expect(finishPasswordRecovery({token:grant,password:"aaaaaaaa"})).rejects.toMatchObject({status:400});
  expect((await db.user.findUniqueOrThrow({where:{id:other},select:{disabledAt:true}})).disabledAt).not.toBeNull();
  await db.user.update({where:{id:other},data:{disabledAt:null}});
  expect((await auth.api.signInEmail({body:{email:email("other"),password:originalPassword}})).user.id).toBe(other);
  await db.verification.update({where:{id:grants.at(-1)!},data:{expiresAt:new Date(0)}});
  await expect(finishPasswordRecovery({token:grant,password:"aaaaaaaa"})).rejects.toMatchObject({status:400});
  await requestEmailVerification(other,delivery);const verification=token();
  await expect(finishPasswordRecovery({token:verification,password:"aaaaaaaa"})).rejects.toMatchObject({status:400});
});
it("verifies only the matching active signed-in identity and rejects replay",async()=>{
  await requestEmailVerification(other,delivery);const grant=token();
  await expect(finishEmailVerification(grant,owner)).rejects.toMatchObject({status:403});
  await finishEmailVerification(grant,other);
  expect((await db.user.findUniqueOrThrow({where:{id:other},select:{emailVerified:true}})).emailVerified).toBe(true);
  await expect(finishEmailVerification(grant,other)).rejects.toMatchObject({status:400});
});
it("requires the existing invited identity, preserves credentials and refuses email substitutions",async()=>{
  await issueInvitation(company,owner,{email:email("other"),role:"EDITOR"},delivery);const grant=token();
  await expect(acceptInvitation({token:grant,email:email("owner")},owner)).rejects.toMatchObject({status:403});
  await expect(acceptInvitation({token:grant,email:email("other")})).rejects.toMatchObject({status:401});
  await expect(acceptInvitation({token:grant,email:email("other"),password:"aaaaaaaa"},other)).rejects.toMatchObject({status:400});
  await acceptInvitation({token:grant,email:email("other")},other);
  expect((await auth.api.signInEmail({body:{email:email("other"),password:originalPassword}})).user.id).toBe(other);
  await expect(acceptInvitation({token:grant,email:email("other")},other)).rejects.toMatchObject({status:400});
});
it("blocks foreign revocation, disabled invitees, duplicate memberships and revoked links",async()=>{
  const invitation=await issueInvitation(company,owner,{email:email("invited"),role:"VIEWER"},delivery);const grant=token();
  await expect(revokeInvitation(foreign,owner,invitation.id)).rejects.toMatchObject({status:404});
  await db.user.update({where:{id:invited},data:{disabledAt:new Date()}});
  await expect(acceptInvitation({token:grant,email:email("invited")},invited)).rejects.toMatchObject({status:400});
  await db.user.update({where:{id:invited},data:{disabledAt:null}});
  await revokeInvitation(company,owner,invitation.id);
  await expect(acceptInvitation({token:grant,email:email("invited")},invited)).rejects.toMatchObject({status:400});
  await expect(issueInvitation(company,owner,{email:email("other"),role:"VIEWER"},delivery)).rejects.toMatchObject({status:409});
});
it("serializes invite acceptance against revocation, refuses expiry and prevents role escalation",async()=>{
  await expect(issueInvitation(company,other,{email:email("escalation"),role:"ADMIN"},delivery)).rejects.toMatchObject({status:403});
  await issueInvitation(company,owner,{email:email("invited"),role:"EDITOR"},delivery);const expired=token();
  await db.verification.update({where:{id:grants.at(-1)!},data:{expiresAt:new Date(0)}});
  await expect(acceptInvitation({token:expired,email:email("invited")},invited)).rejects.toMatchObject({status:400});
  const invitation=await issueInvitation(company,owner,{email:email("invited"),role:"EDITOR"},delivery);const grant=token();
  const results=await Promise.allSettled([acceptInvitation({token:grant,email:email("invited")},invited),revokeInvitation(company,owner,invitation.id)]);
  expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  await expect(acceptInvitation({token:grant,email:email("invited")},invited)).rejects.toMatchObject({status:400});
});
it("atomically creates a plain USER and personal space with an eight-character password",async()=>{
  const data={name:"Internal Fixture",email:email("internal"),password:"aaaaaaaa"};
  await expect(createInternalPlatformUser(owner,data)).rejects.toMatchObject({status:403});
  const user=await createInternalPlatformUser(admin,data);users.push(user.id);
  const member=await db.workspaceMember.findFirstOrThrow({where:{userId:user.id},select:{workspaceId:true,role:true}});spaces.push(member.workspaceId);
  expect(member.role).toBe("OWNER");expect((await db.user.findUniqueOrThrow({where:{id:user.id},select:{systemRole:true}})).systemRole).toBe("USER");
  expect((await auth.api.signInEmail({body:{email:data.email,password:data.password}})).user.id).toBe(user.id);
  await expect(createInternalPlatformUser(admin,data)).rejects.toMatchObject({status:409});
});
it("removes a failed delivery grant and opens a new customer scope without attaching the platform admin",async()=>{
  const before=await db.verification.count({where:{identifier:"account-invite:"+company}});
  await expect(issueInvitation(company,owner,{email:email("failed"),role:"EDITOR"},async()=>{throw Error("sandbox delivery failed");})).rejects.toMatchObject({status:503});
  expect(await db.verification.count({where:{identifier:"account-invite:"+company}})).toBe(before);
  const result=await openCustomerWorkspace(admin,{name:"Fixture customer",email:email("new-owner")},delivery);spaces.push(result.workspace.id);const grant=token();
  expect(await db.workspaceMember.count({where:{workspaceId:result.workspace.id}})).toBe(0);
  const accepted=await Promise.allSettled([acceptInvitation({token:grant,email:email("new-owner"),name:"Fixture new owner",password:"aaaaaaaa"}),acceptInvitation({token:grant,email:email("new-owner"),name:"Fixture duplicate owner",password:"bbbbbbbb"})]);
  expect(accepted.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  const user=await db.user.findUniqueOrThrow({where:{email:email("new-owner")},select:{id:true}});users.push(user.id);
  expect(await db.workspaceMember.count({where:{workspaceId:result.workspace.id,role:"OWNER",user:{disabledAt:null}}})).toBe(1);
  expect(await db.workspaceMember.count({where:{workspaceId:result.workspace.id,userId:admin}})).toBe(0);
},30000);

it("changes a fixture password through actual Better Auth, audits it and revokes other sessions",async()=>{
  const login=await auth.api.signInEmail({body:{email:email("invited"),password:invitedPassword},asResponse:true});
  const cookie=login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  const current=await auth.api.getSession({headers:new Headers({cookie})});if(!current)throw Error("Fixture session missing");
  const changed=await auth.api.changePassword({headers:new Headers({cookie}),body:{currentPassword:invitedPassword,newPassword:"dddddddd",revokeOtherSessions:true},asResponse:true});expect(changed.ok).toBe(true);
  const updatedCookie=changed.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  const refreshed=await auth.api.getSession({headers:new Headers({cookie:updatedCookie})});expect(refreshed?.user.id).toBe(invited);
  expect(await db.session.count({where:{userId:invited}})).toBe(1);expect(await db.session.count({where:{id:current.session.id,userId:invited}})).toBe(0);
  const workspaceAudit=await db.auditLog.count({where:{action:"account.password_changed",resourceId:invited}});
  const accountAudit=await db.verification.count({where:{identifier:"account-audit:"+invited,value:{contains:"account.password_changed"}}});
  expect(workspaceAudit+accountAudit).toBe(1);
  expect((await auth.api.signInEmail({body:{email:email("invited"),password:"dddddddd"}})).user.id).toBe(invited);
});
