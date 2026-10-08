import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import {chromium,type Browser,type BrowserContext} from "@playwright/test";
import {afterAll,beforeAll,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {db} from "@content-center/db";
import {auth} from "../lib/auth";
import {MockLLMProvider} from "@content-center/providers";
import {startWorkDeepResearch} from "../server/research/work-research-service";
import {executeResearchRun,saveResearchResult} from "../server/research/service";
import {sampleAnswer,sampleDecisionPass,sampleBody} from "./work-research-fixture";
const origin="http://localhost:3030",output="E:/codex1/2026-10-04/task-4/teacher-workbench-20261006/browser";
let browser:Browser,context:BrowserContext,foreign:BrowserContext,userId="",workspaceId="",otherId="",otherWorkspaceId="",accountId="",workId="",sourceId="",reportId="",topicId="";
const sessionIds:string[]=[],checks:string[]=[],pageErrors:string[]=[];let externalRequests=0,modelRequests=0;
const req=createRequire(import.meta.url);
const sign=req(req.resolve("better-call",{paths:[path.dirname(req.resolve("better-auth/cookies"))]})).serializeSignedCookie as (name:string,value:string,secret:string,options:object)=>Promise<string>;
async function session(target:BrowserContext,id:string,workspace:string){
 const token=randomUUID()+randomUUID();const row=await db.session.create({data:{userId:id,token,activeWorkspaceId:workspace,expiresAt:new Date(Date.now()+30*60000),userAgent:"Disposable teacher acceptance"}});sessionIds.push(row.id);
 const signed=await sign("content-center-release-review.session_token",token,(await auth.$context).secret,{path:"/",httpOnly:true,sameSite:"lax"}),pair=signed.split(";")[0]!,at=pair.indexOf("=");
 await target.addCookies([{name:pair.slice(0,at),value:pair.slice(at+1),url:origin}]);
}
beforeAll(async()=>{
 if(new URL(process.env.DATABASE_URL!).port!=="55436")throw Error("ISOLATED_REVIEW_REQUIRED");
 await mkdir(output,{recursive:true});
 const target=await db.user.findFirst({where:{email:"2629194738@qq.com",systemRole:"SYSTEM_ADMIN",disabledAt:null},select:{id:true}});if(!target)throw Error("REVIEW_ADMIN_REQUIRED");userId=target.id;
 otherId=(await db.user.create({data:{name:"Disposable outsider",email:"teacher-browser-"+randomUUID()+"@example.test",systemRole:"SYSTEM_ADMIN"}})).id;
 workspaceId=(await db.workspace.create({data:{name:"Disposable teacher fixture",slug:randomUUID(),members:{create:{userId,role:"OWNER"}}}})).id;
 otherWorkspaceId=(await db.workspace.create({data:{name:"Disposable foreign fixture",slug:randomUUID(),members:{create:{userId:otherId,role:"OWNER"}}}})).id;
 const externalId="fixture-"+randomUUID();
 accountId=(await db.benchmarkAccount.create({data:{workspaceId,createdById:userId,platform:"DOUYIN",externalAccountId:externalId,name:"隔离验收老师",originalUrl:"https://www.douyin.com/user/"+externalId}})).id;
 for(let i=0;i<6;i++){const work=await db.benchmarkContentSnapshot.create({data:{workspaceId,benchmarkAccountId:accountId,platform:"DOUYIN",externalId:externalId+"-"+i,title:i===0?"隔离验收作品·动态三段":"隔离样本 "+i,url:"https://www.douyin.com/video/fixture"+i,publishedAt:new Date(),metadata:{durationMs:18000},observations:{create:{metrics:{likes:[1,2,3,4,5,90][i],comments:null}}}}});if(i===0)workId=work.id;}
 sourceId=(await db.sourceItem.create({data:{workspaceId,createdById:userId,sourcePlatform:"DOUYIN",externalId:externalId+"-0",sourceType:"VIDEO",title:"隔离正文",status:"READY",transcript:{create:{workspaceId,provider:"FIXTURE",providerMode:"REAL",fullText:sampleBody,segments:[{startMs:0,endMs:6000,text:"先展示用户的真实问题。"},{startMs:6000,endMs:12000,text:"接着演示操作。"},{startMs:12000,endMs:18000,text:"最后解释结果如何用于自己。"}]}}}})).id;
 const actor={workspaceId,userId},run=await startWorkDeepResearch(actor,accountId,workId,{requestKey:randomUUID()});reportId=run.runId;
 await executeResearchRun(actor,run.sessionId,reportId,{runtime:{provider:new MockLLMProvider(input=>JSON.parse(input.prompt).task.includes("决策层")?sampleDecisionPass():sampleAnswer()),providerName:"FIXTURE",model:"teacher-browser-fixture",mode:"FIXTURE"}});
 await saveResearchResult(actor,run.sessionId,reportId);
 topicId=(await db.contentIdea.create({data:{workspaceId,createdById:userId,title:"隔离验收原选题",references:{create:{sourceItemId:sourceId,platform:"DOUYIN",externalId:externalId+"-0",title:"原作品",url:"https://www.douyin.com/video/fixture0"}}}})).id;
 browser=await chromium.launch({channel:"msedge",headless:true});context=await browser.newContext({viewport:{width:1440,height:1000}});foreign=await browser.newContext();await session(context,userId,workspaceId);await session(foreign,otherId,otherWorkspaceId);
 context.on("request",request=>{const url=new URL(request.url());if(url.origin!==origin)externalRequests++;if(/\/analysis$|assistant|generate/.test(url.pathname)&&request.method()!=="GET")modelRequests++;});
},60000);
afterAll(async()=>{
 await context?.close();await foreign?.close();await browser?.close();
 if(sessionIds.length)await db.session.deleteMany({where:{id:{in:sessionIds}}});if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});if(otherWorkspaceId)await db.workspace.delete({where:{id:otherWorkspaceId}});if(otherId)await db.user.deleteMany({where:{id:otherId}});
 const cleaned=await db.workspace.count({where:{id:{in:[workspaceId,otherWorkspaceId].filter(Boolean)}}})===0 && await db.session.count({where:{id:{in:sessionIds}}})===0;
 await writeFile(path.join(output,"evidence.json"),JSON.stringify({checks,pageErrors,externalRequests,modelRequests,fixtureCleanupVerified:cleaned,formalDatabaseWrites:0,authentication:"temporary signed sessions in isolated 55436 only",liveProviderCalls:0,screenshots:["teacher-desktop.png","queue-desktop.png","work-detail.png","teacher-mobile.png"],mediaPlayback:"no stored fixture media; honest fallback and inline transcript verified; actual playback seek not verified"},null,2));expect(cleaned).toBe(true);await db.$disconnect();
},60000);
it("protects real HTTP boundaries and preserves state across duplicate homepage imports",async()=>{
 const anon=await browser.newContext();expect((await anon.request.post(origin+"/api/research/benchmarks/import",{data:{url:"https://www.douyin.com/user/x",purpose:"teacher"}})).status()).toBe(401);await anon.close();
 expect((await context.request.post(origin+"/api/research/benchmarks/import",{data:{url:"https://www.douyin.com/user/x",purpose:"teacher"}})).status()).toBe(403);
 expect((await foreign.request.post(origin+"/api/research/preferences",{headers:{Origin:origin},data:{kind:"WORK_DISMISSED",key:workId,action:"FOLLOW"}})).status()).toBe(404);
 expect((await foreign.request.get(origin+"/api/research/benchmarks/"+accountId+"/works/"+workId)).status()).toBe(404);
 const deniedPage=await foreign.request.get(origin+"/research/benchmarks/"+accountId+"/works/"+workId);expect(await deniedPage.text()).not.toContain("隔离验收作品·动态三段");
 const account=await db.benchmarkAccount.findUniqueOrThrow({where:{id:accountId}});
 const duplicate=await context.request.post(origin+"/api/research/benchmarks/import",{headers:{Origin:origin},data:{url:account.originalUrl,purpose:"teacher"}});expect(duplicate.status()).toBe(200);expect(await duplicate.json()).toMatchObject({existing:true,item:{id:accountId}});
 expect((await context.request.post(origin+"/api/research/benchmarks/"+accountId+"/sync",{headers:{Origin:origin}})).status()).toBe(409);
 checks.push("anonymous401-origin403-foreign404-existing-import-no-third-party-sync409");
});
it("shows account trends, switches purpose and makes each queue action distinct",async()=>{
 const page=await context.newPage();page.on("pageerror",error=>pageErrors.push(error.message));
 await page.goto(origin+"/research/benchmarks?period=7");await page.getByRole("heading",{name:"老师 / 对标"}).waitFor();
 expect(await page.locator(".teacher-card").count()).toBe(1);await page.getByLabel("学习目的",{exact:true}).selectOption("reference");await expect.poll(async()=>db.researchObjectPreference.count({where:{workspaceId,userId,kind:"BENCHMARK_REFERENCE",objectKey:accountId,followedAt:{not:null}}})).toBe(1);
 expect(await page.locator(".teacher-work-row").count()).toBe(6);await page.screenshot({path:path.join(output,"teacher-desktop.png"),fullPage:true});
 await page.goto(origin+"/research/works?view=unread&days=7&accountId="+accountId);const card=page.locator("#work-"+workId);await card.waitFor();await page.screenshot({path:path.join(output,"queue-desktop.png"),fullPage:true});
 expect(await card.getByRole("link",{name:"去看原作"}).getAttribute("target")).toBe("_blank");
 expect(await card.getByRole("link",{name:"看拆解",exact:true}).getAttribute("href")).toContain("#deep-report");
 expect(await card.getByRole("link",{name:"想复刻 · 创作预览"}).getAttribute("href")).toContain("#creation-preview");
 await card.getByRole("button",{name:"看过了",exact:true}).click();await card.waitFor({state:"detached"});
 await db.benchmarkContentSnapshot.update({where:{id:workId},data:{observedAt:new Date(Date.now()+1000)}});
 await page.goto(origin+"/research/works?view=read&days=7&accountId="+accountId);await page.locator("#work-"+workId).waitFor();await page.locator("#work-"+workId).getByRole("button",{name:"忽略建议"}).click();await page.locator("#work-"+workId).waitFor({state:"detached"});
 await page.goto(origin+"/research/works?view=dismissed&days=7&accountId="+accountId);await page.locator("#work-"+workId).getByRole("button",{name:"恢复建议"}).click();
 checks.push("real-trend-null-metrics-role-switch-independent-read-ignore-recovery-distinct-actions");
},60000);
it("opens existing dynamic report, inline original, true topic and returns to filters and anchor",async()=>{
 const page=await context.newPage(),returnTo="/research/works?view=read&days=7&accountId="+accountId+"#work-"+workId;
 await page.goto(origin+"/research/benchmarks/"+accountId+"/works/"+workId+"?returnTo="+encodeURIComponent(returnTo));await page.getByRole("heading",{name:"动态内容结构"}).waitFor();
 expect(await page.locator(".work-report-fragments>li").count()).toBe(3);
 await page.locator(".work-report-timeline").getByRole("link",{name:"2 · 实际演示"}).click();
 await page.locator("#fragment-2").getByText("展开本段原文",{exact:true}).click();expect(await page.locator("#fragment-2 blockquote").innerText()).toContain("接着演示操作");
 expect(await page.getByRole("link",{name:"已采用 · 隔离验收原选题 →"}).getAttribute("href")).toBe("/discovery/ideas/"+topicId);
 const runs=await db.researchRun.count({where:{workspaceId}});await page.getByRole("button",{name:"看完归档"}).click();await page.getByRole("button",{name:"已归档 · 恢复"}).waitFor();expect(await db.researchRun.count({where:{workspaceId}})).toBe(runs);expect(await db.contentIdea.count({where:{id:topicId}})).toBe(1);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,"work-detail.png"),fullPage:true});
 await page.getByRole("link",{name:"返回原列表 →",exact:true}).click();await page.waitForURL(url=>url.pathname==="/research/works");expect(page.url()).toContain("view=read");expect(page.url()).toContain("#work-"+workId);
 checks.push("existing-report-no-new-run-dynamic-three-blocks-inline-original-topic-archive-independent-return-filter-anchor");
},60000);
it("keeps mobile layout and import cancellation and network failures honest",async()=>{
 const page=await context.newPage();await page.setViewportSize({width:390,height:844});await page.goto(origin+"/research/benchmarks?period=7");await page.getByRole("heading",{name:"老师 / 对标"}).waitFor();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.screenshot({path:path.join(output,"teacher-mobile.png"),fullPage:true});await page.getByRole("button",{name:"＋ 添加 / 定位账号"}).click();await page.getByLabel("账号主页链接").fill("https://evil.test/user/a");await page.getByRole("button",{name:"定位已有账号",exact:true}).click();expect(await page.locator("dialog").getByRole("alert").innerText()).toContain("完整账号主页");
 await page.getByRole("button",{name:"取消",exact:true}).click();expect(await page.locator("dialog").evaluate(node=>(node as HTMLDialogElement).open)).toBe(false);
 await page.getByRole("button",{name:"＋ 添加 / 定位账号"}).click();await page.getByLabel("账号主页链接").fill("https://www.douyin.com/user/new-fixture");
 let requests=0;await page.route("**/api/research/benchmarks/import",route=>{requests++;return route.abort("failed");});await page.getByRole("button",{name:"定位已有账号",exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});await page.locator("dialog").getByRole("alert").waitFor();expect(await page.getByLabel("账号主页链接").inputValue()).toContain("new-fixture");expect(requests).toBe(1);
 expect(pageErrors).toEqual([]);expect(externalRequests).toBe(0);expect(modelRequests).toBe(0);checks.push("mobile-no-overflow-homepage-validation-cancel-network-failure-preserves-input-no-external-no-model");
},60000);
