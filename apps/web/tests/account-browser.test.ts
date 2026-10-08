import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
const origin="http://localhost:3020",suffix=randomUUID(),email="browser-account-"+suffix+"@example.test";
let browser:Browser,context:BrowserContext,page:Page,userId="",workspaceId="";
const output=resolve(process.cwd(),"../../output/account-upgrade-private/account-implementation-20261004");
beforeAll(async()=>{
  const result=await auth.api.signUpEmail({body:{name:"Browser Fixture",email,password:"fixture-password-123"}});userId=result.user.id;
  const workspace=await db.workspace.create({data:{name:"Browser fixture company",slug:"browser-account-"+suffix,members:{create:{userId,role:"OWNER"}}}});workspaceId=workspace.id;
  const login=await auth.api.signInEmail({body:{email,password:"fixture-password-123"},asResponse:true});
  browser=await chromium.launch({headless:true});context=await browser.newContext();
  await context.addCookies(login.headers.getSetCookie().map(value=>{const pair=value.split(";")[0]!;const split=pair.indexOf("=");return{name:pair.slice(0,split),value:pair.slice(split+1),url:origin};}));
  await mkdir(output,{recursive:true});
},90000);
beforeEach(async()=>{page=await context.newPage();});
afterEach(async()=>{await page?.close();});
afterAll(async()=>{await browser?.close();if(workspaceId)await db.workspace.deleteMany({where:{id:workspaceId}});if(userId){await db.verification.deleteMany({where:{identifier:"account-audit:"+userId}});await db.user.deleteMany({where:{id:userId}});}},90000);
it("renders password settings at narrow widths, accepts 8–128 and focuses mismatched confirmation",async()=>{
  await page.goto(origin+"/settings/account");await page.getByText("当前设备",{exact:true}).waitFor();await page.locator('details.settings-password summary').click();
  for(const width of [320,375,768]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    await page.screenshot({path:resolve(output,"account-settings-"+width+".png")});
  }
  const next=page.locator('input[name="new"]');expect(await next.getAttribute("minlength")).toBe("8");expect(await next.getAttribute("maxlength")).toBe("128");
  await page.locator('input[name="current"]').fill("fixture-password-123");await next.fill("aaaaaaaa");await page.locator('input[name="confirm"]').fill("bbbbbbbb");
  await page.getByRole("button",{name:"确认修改密码",exact:true}).click();
  await page.getByRole("status").filter({hasText:"两次新密码不一致"}).waitFor();
  expect(await page.locator('input[name="confirm"]').evaluate(el=>el===document.activeElement)).toBe(true);
  await page.locator('input[name="current"]').fill("");await next.fill("");await page.locator('input[name="confirm"]').fill("");
  await page.keyboard.press("Tab");expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe("BODY");
},120000);
it("shows recovery unavailability without exposing grants and supports history navigation",async()=>{
  await page.goto(origin+"/login");await page.getByText("忘记密码或无法登录？",{exact:true}).click();await page.getByRole("link",{name:"查看密码恢复方式"}).click();
  await page.getByRole("heading",{name:"找回密码",exact:true}).waitFor();
  expect(await page.getByRole("button",{name:"申请恢复邮件"}).isDisabled()).toBe(true);
  expect(await page.locator('input[name="token"]').count()).toBe(0);
  await page.waitForLoadState("networkidle");
  await page.goBack({waitUntil:"networkidle"});await page.getByRole("button",{name:"登录",exact:true}).waitFor();expect(new URL(page.url()).pathname).toBe("/login");
  await page.goForward({waitUntil:"networkidle"});await page.getByRole("heading",{name:"找回密码",exact:true}).waitFor();expect(new URL(page.url()).pathname).toBe("/account/recovery");
  await page.screenshot({path:resolve(output,"account-recovery-unavailable.png")});
},90000);
it("clears malformed callback fragments and gives an actionable missing-link state",async()=>{
  await page.goto(origin+"/account/reset#token=invalid");await page.getByRole("alert").filter({hasText:"链接缺失"}).waitFor();
  expect(new URL(page.url()).hash).toBe("");expect(await page.getByRole("button",{name:"确认提交"}).isDisabled()).toBe(true);
  await page.goto(origin+"/account/invite#token=invalid");await page.getByRole("alert").filter({hasText:"链接缺失"}).waitFor();expect(new URL(page.url()).hash).toBe("");
},90000);
it("separates global login disablement from membership and keeps invitations explicitly unavailable",async()=>{
  await db.user.update({where:{id:userId},data:{systemRole:"SYSTEM_ADMIN"}});
  const memberUser=await db.user.create({data:{name:"Disabled browser fixture",email:"disabled-browser-"+suffix+"@example.test",disabledAt:new Date()},select:{id:true}});
  try{
    await db.workspaceMember.create({data:{workspaceId,userId:memberUser.id,role:"EDITOR"}});
    await page.goto(origin+"/settings/members");await page.getByText("登录账号已被平台停用",{exact:false}).waitFor();
    expect(await page.getByRole("button",{name:"停用成员资格",exact:true}).isDisabled()).toBe(true);
    expect(await page.getByRole("button",{name:"发送邀请",exact:true}).isDisabled()).toBe(true);
    await page.screenshot({path:resolve(output,"account-members-disabled.png")});
  }finally{await db.workspaceMember.deleteMany({where:{workspaceId,userId:memberUser.id}});await db.user.delete({where:{id:memberUser.id}});}
},90000);
it("recovers from a device-read network failure without leaving the UI busy",async()=>{
  await page.route("**/api/settings/sessions",route=>route.abort("failed"));
  await page.goto(origin+"/settings/account");await page.getByRole("status").filter({hasText:"无法读取登录设备"}).waitFor();
  expect(await page.getByRole("button",{name:"刷新设备",exact:true}).isEnabled()).toBe(true);
  await page.unroute("**/api/settings/sessions");await page.getByRole("button",{name:"刷新设备",exact:true}).click();
  await page.getByText("当前设备",{exact:true}).waitFor();
},90000);

it("keeps the account page usable when sign-out fails and lets the user retry",async()=>{
  await page.route("**/api/auth/sign-out",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({code:"AUTH_SERVICE_UNAVAILABLE",message:"Fixture unavailable"})}));
  await page.goto(origin+"/settings/account");await page.getByRole("button",{name:"退出登录",exact:true}).click();
  await page.getByRole("status").filter({hasText:"退出未完成"}).waitFor();
  expect(new URL(page.url()).pathname).toBe("/settings/account");expect(await page.getByRole("button",{name:"退出登录",exact:true}).isEnabled()).toBe(true);
  await page.unroute("**/api/auth/sign-out");
  await page.keyboard.press("Escape");await page.waitForURL("**/dashboard");
},90000);
