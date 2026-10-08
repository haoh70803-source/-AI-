import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
const origin="http://localhost:3020",suffix=randomUUID(),email="http-security-"+suffix+"@example.test",password="fixture-password-123";
let userId="",cookie="",sessionId="",foreignUserId="",foreignWorkspaceId="",foreignProjectId="";
async function call(path:string,method="GET",body?:unknown,headers:Record<string,string>={}){return fetch(origin+path,{method,headers:{cookie,origin,...(body?{"content-type":"application/json"}:{}),...headers},body:body?JSON.stringify(body):undefined,redirect:"manual",signal:AbortSignal.timeout(90000)});}
beforeAll(async()=>{
  const result=await auth.api.signUpEmail({body:{name:"HTTP Fixture",email,password}});userId=result.user.id;
  await db.user.update({where:{id:userId},data:{systemRole:"SYSTEM_ADMIN"}});
  const foreignUser=await db.user.create({data:{name:"Foreign customer fixture",email:"foreign-http-"+suffix+"@example.test"},select:{id:true}});foreignUserId=foreignUser.id;
  const foreignWorkspace=await db.workspace.create({data:{name:"Foreign customer fixture",slug:"foreign-http-"+suffix,members:{create:{userId:foreignUserId,role:"OWNER"}}},select:{id:true}});foreignWorkspaceId=foreignWorkspace.id;
  const foreignProject=await db.contentProject.create({data:{workspaceId:foreignWorkspaceId,createdById:foreignUserId,title:"Foreign private fixture"},select:{id:true}});foreignProjectId=foreignProject.id;
  const login=await auth.api.signInEmail({body:{email,password},asResponse:true});cookie=login.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ");
  const current=await auth.api.getSession({headers:new Headers({cookie})});
  if(!current)throw Error("Fixture session missing");sessionId=current.session.id;
},60000);
afterAll(async()=>{if(foreignWorkspaceId)await db.workspace.deleteMany({where:{id:foreignWorkspaceId}});if(foreignUserId)await db.user.deleteMany({where:{id:foreignUserId}});if(userId){await db.verification.deleteMany({where:{identifier:"account-audit:"+userId}});await db.user.deleteMany({where:{id:userId}});}},60000);
it("allows platform governance without a workspace and denies it to anonymous callers",async()=>{
  for(const path of ["/platform/accounts","/platform/spaces","/api/admin/workspaces"])expect((await call(path)).status).toBe(200);
  expect([401,403,404]).toContain((await call("/api/projects/"+foreignProjectId)).status);
  const anonymous=await fetch(origin+"/api/admin/workspaces");expect(anonymous.status).toBe(401);
},180000);
it("rejects cross-origin, opaque Origin and simple-body admin mutations before any creation",async()=>{
  const before=await db.user.count();
  for(const headers of ([{origin:"https://foreign.invalid"},{"sec-fetch-site":"cross-site"},{origin:"null"}] as Record<string,string>[]))expect((await call("/api/admin/users","POST",{name:"Must not create",email:"blocked-"+suffix+"@example.test",password:"aaaaaaaa"},headers)).status).toBe(403);
  expect((await call("/api/admin/users","POST",{name:"Must not create"} ,{"content-type":"text/plain"})).status).toBe(415);
  expect(await db.user.count()).toBe(before);
});
it("reports missing delivery without creating a customer scope or disclosing recovery account existence",async()=>{
  const before=await db.workspace.count();
  expect((await call("/api/admin/workspaces","POST",{name:"Not created",email})).status).toBe(503);
  expect(await db.workspace.count()).toBe(before);
  const responses=[];
  for(const recoveryEmail of [email,"missing-"+suffix+"@example.test"]){const response=await call("/api/account/recovery","POST",{email:recoveryEmail});expect(response.status).toBe(503);responses.push(await response.json());}
  expect(responses[0]).toEqual(responses[1]);
});
it("does not let rejected cross-site login requests consume legitimate login quota",async()=>{
  for(let i=0;i<6;i++)expect((await call("/api/auth/sign-in/email","POST",{email,password},{origin:"https://untrusted.invalid"})).status).toBe(403);
  expect((await call("/api/auth/sign-in/email","POST",{email,password},{"content-type":"text/plain"})).status).toBe(415);
  expect((await call("/api/auth/sign-in/email")).status).toBe(405);
  for(let i=0;i<3;i++)expect((await call("/api/auth/sign-in/email","POST",{email,password})).status).toBe(200);
},90000);
it("returns generic login failure and rate limits even with spoofed forwarded headers",async()=>{
  const badEmail="unknown-"+suffix+"@example.test";
  const responses=[];
  for(let i=0;i<7;i++){const response=await call("/api/auth/sign-in/email","POST",{email:badEmail,password:"aaaaaaaa"},{"x-forwarded-for":"203.0.113."+i});responses.push(response.status);if(response.status===401)expect((await response.json()).code).toBe("INVALID_CREDENTIALS");}
  expect(responses).toContain(401);expect(responses).toContain(429);
},90000);
it("does not revoke current or foreign sessions and rejects a globally disabled existing session",async()=>{
  const response=await call("/api/settings/sessions","DELETE",{id:sessionId});expect(response.status).toBe(200);expect((await response.json()).count).toBe(0);
  await db.user.update({where:{id:userId},data:{disabledAt:new Date()}});
  expect((await call("/api/settings/sessions")).status).toBe(401);
  expect((await call("/api/admin/workspaces")).status).toBe(403);
  const nativeSession=await call("/api/auth/get-session");expect(nativeSession.status).toBe(200);expect(await nativeSession.json()).toBeNull();
  expect((await call("/api/auth/update-user","POST",{name:"Must never apply"})).status).toBe(401);
  expect((await call("/api/auth/change-password","POST",{currentPassword:password,newPassword:"aaaaaaaa",revokeOtherSessions:true})).status).toBe(401);
  expect((await db.user.findUniqueOrThrow({where:{id:userId},select:{name:true}})).name).toBe("HTTP Fixture");
  await db.user.update({where:{id:userId},data:{disabledAt:null}});
});
