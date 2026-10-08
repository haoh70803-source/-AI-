import { randomUUID, createHash } from "node:crypto";
import { afterAll, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
import { accountDelivery } from "../server/account-delivery";
import { requestPasswordRecovery, issueInvitation, acceptInvitation } from "../server/account-security";
import { createMember, createInternalPlatformUser, transferWorkspaceOwner, changeMember } from "../server/account-space";
import { setUserDisabled } from "../server/admin/user-lifecycle";
const users:string[]=[], spaces:string[]=[], grants:string[]=[];
const suffix=randomUUID();
async function user(label:string,password="aaaaaaaa",systemRole:"USER"|"SYSTEM_ADMIN"="USER"){
  const email="final-boundary-"+label+"-"+suffix+"@example.test";
  const created=await auth.api.signUpEmail({body:{name:"Boundary "+label,email,password}});users.push(created.user.id);
  if(systemRole==="SYSTEM_ADMIN")await db.user.update({where:{id:created.user.id},data:{systemRole}});
  return {id:created.user.id,email,password};
}
async function company(ownerId:string,memberId?:string){
  const row=await db.workspace.create({data:{name:"Boundary fixture",slug:"final-boundary-"+randomUUID(),members:{create:[{userId:ownerId,role:"OWNER"},...(memberId?[{userId:memberId,role:"EDITOR" as const}]:[])]}}});spaces.push(row.id);return row.id;
}
afterAll(async()=>{
  vi.unstubAllEnvs();
  await db.verification.deleteMany({where:{OR:[{id:{in:grants}},{identifier:{in:spaces.map(id=>"account-invite:"+id)}},{identifier:{in:users.map(id=>"account-audit:"+id)}}]}});
  await db.workspace.deleteMany({where:{id:{in:spaces}}});
  await db.user.deleteMany({where:{id:{in:users}}});
},60000);
it("enforces password bounds through actual signup, platform creation, member creation and change",async()=>{
  const owner=await user("bounds-owner"),admin=await user("bounds-admin","aaaaaaaa","SYSTEM_ADMIN"),space=await company(owner.id);
  const login=await auth.api.signInEmail({body:{email:owner.email,password:owner.password},asResponse:true});
  const cookie=login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  for(const length of [7,129]){
    const input={name:"Boundary invalid",email:"invalid-"+length+"-"+suffix+"@example.test",password:"a".repeat(length)};
    await expect(auth.api.signUpEmail({body:input})).rejects.toThrow();
    await expect(createInternalPlatformUser(admin.id,input)).rejects.toThrow();
    await expect(createMember(space,owner.id,{...input,role:"EDITOR"})).rejects.toThrow();
    await expect(auth.api.changePassword({headers:new Headers({cookie}),body:{currentPassword:owner.password,newPassword:input.password,revokeOtherSessions:true}})).rejects.toThrow();
    expect(await db.user.count({where:{email:input.email}})).toBe(0);
  }
  const max=await user("bounds-max","a".repeat(128));
  expect((await auth.api.signInEmail({body:{email:max.email,password:max.password}})).user.id).toBe(max.id);
},60000);
it("cannot enable sandbox mail in LOCAL_REAL even with a mock flag or injected callback",async()=>{
  const called=vi.fn(async()=>{});
  const before=await db.verification.count();
  try{
    vi.stubEnv("ENVIRONMENT_ID","LOCAL_REAL");vi.stubEnv("MOCK_MODE","true");
    expect(accountDelivery()).toBeUndefined();
    await expect(requestPasswordRecovery("boundary@example.test",called)).rejects.toMatchObject({status:503});
    expect(called).not.toHaveBeenCalled();
  }finally{vi.unstubAllEnvs();}
  expect(await db.verification.count()).toBe(before);
});
it("binds new invitees to the recorded email, workspace and role, rejecting client overrides before consuming",async()=>{
  const owner=await user("invite-owner"),space=await company(owner.id);
  const email="final-boundary-new-invite-"+suffix+"@example.test";
  let token="";
  await issueInvitation(space,owner.id,{email,role:"VIEWER"},async mail=>{token=new URLSearchParams(new URL(mail.url!).hash.slice(1)).get("token")!;grants.push("account-challenge:"+createHash("sha256").update(token).digest("hex"));});
  const input={token,email,name:"Boundary invitee",password:"aaaaaaaa"};
  for(const patch of [{role:"OWNER"},{systemRole:"SYSTEM_ADMIN"},{workspaceId:"foreign"},{delivery:"mock"},{email:"different-"+suffix+"@example.test"}])
    await expect(acceptInvitation({...input,...patch})).rejects.toThrow();
  for(const length of [7,129])await expect(acceptInvitation({...input,password:"a".repeat(length)})).rejects.toThrow();
  await acceptInvitation(input);
  const accepted=await db.user.findUniqueOrThrow({where:{email},select:{id:true,systemRole:true}});users.push(accepted.id);
  expect(accepted.systemRole).toBe("USER");
  expect((await db.workspaceMember.findUniqueOrThrow({where:{workspaceId_userId:{workspaceId:space,userId:accepted.id}}})).role).toBe("VIEWER");
  expect(await db.workspaceMember.count({where:{userId:accepted.id}})).toBe(1);
});
it("keeps an effective owner during concurrent target removal and owner transfer",async()=>{
  const owner=await user("remove-owner"),target=await user("remove-target"),space=await company(owner.id,target.id);
  const member=await db.workspaceMember.findUniqueOrThrow({where:{workspaceId_userId:{workspaceId:space,userId:target.id}}});
  const results=await Promise.allSettled([changeMember(space,owner.id,member.id,null,true),transferWorkspaceOwner(space,owner.id,member.id)]);
  expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  expect(await db.workspaceMember.count({where:{workspaceId:space,role:"OWNER",disabledAt:null,user:{disabledAt:null}}})).toBe(1);
});
it("keeps an effective owner during concurrent global target disable and transfer",async()=>{
  const owner=await user("disable-owner"),target=await user("disable-target"),admin=await user("disable-admin","aaaaaaaa","SYSTEM_ADMIN"),space=await company(owner.id,target.id);
  const member=await db.workspaceMember.findUniqueOrThrow({where:{workspaceId_userId:{workspaceId:space,userId:target.id}}});
  const results=await Promise.allSettled([setUserDisabled({adminId:admin.id,userId:target.id,disabled:true}),transferWorkspaceOwner(space,owner.id,member.id)]);
  expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  expect(await db.workspaceMember.count({where:{workspaceId:space,role:"OWNER",disabledAt:null,user:{disabledAt:null}}})).toBe(1);
});
it("refuses every concurrent ordinary owner downgrade, disable and removal",async()=>{
  const owner=await user("protected-owner"),admin=await user("protected-admin"),space=await company(owner.id,admin.id);
  const ownerMember=await db.workspaceMember.findUniqueOrThrow({where:{workspaceId_userId:{workspaceId:space,userId:owner.id}}});
  await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId:space,userId:admin.id}},data:{role:"ADMIN"}});
  const results=await Promise.allSettled([changeMember(space,admin.id,ownerMember.id,{role:"VIEWER"}),changeMember(space,admin.id,ownerMember.id,{disabled:true}),changeMember(space,admin.id,ownerMember.id,null,true)]);
  expect(results.every(result=>result.status==="rejected")).toBe(true);
  expect(await db.workspaceMember.count({where:{workspaceId:space,role:"OWNER",disabledAt:null,user:{disabledAt:null}}})).toBe(1);
});
