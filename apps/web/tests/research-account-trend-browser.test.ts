import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, onTestFailed, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../server/discovery/service", () => ({ searchDiscoveryContent: vi.fn(async () => ({ cached: true, items: [
  { externalId: "related-a", platform: "DOUYIN", title: "AI 做内容的常见方法", description: null, authorName: "作者甲", publishedAt: "2026-09-25T00:00:00Z", originalUrl: "https://example.test/a", sourceItemId: null },
  { externalId: "related-b", platform: "DOUYIN", title: "AI 帮我整理选题", description: null, authorName: "作者乙", publishedAt: "2026-09-26T00:00:00Z", originalUrl: "https://example.test/b", sourceItemId: null },
] })) }));
import { db } from "@content-center/db";
import { auth } from "../lib/auth";
import { MockLLMProvider } from "@content-center/providers";
import { startWorkDeepResearch } from "../server/research/work-research-service";
import { startAccountV2Research } from "../server/research/account-v2-service";
import { startTopicOpportunityV2 } from "../server/research/topic-opportunity-v2-service";
import { trendStableKey } from "../server/research/trends";
import { executeResearchRun } from "../server/research/service";
import { sampleAnswer, sampleBody, sampleDecisionPass } from "./work-research-fixture";
import { accountAnswer } from "./research-account-fixture";
import type { AccountV2State } from "../server/research/account-v2-contract";
function answer() {
  return { trendMeaning: "当前榜单记录了 AI 话题。", whyNow: "最近一次快照仍能看到它。", whyNowLimit: "榜单观察时间不等于话题发生时间。",
    speakers: [{ author: "作者甲", contentRefs: ["R1"], observation: "从常见方法切入。" }, { author: "作者乙", contentRefs: ["R2"], observation: "从整理选题切入。" }],
    angleClusters: [{ angle: "方法介绍", howItIsTold: "标题强调 AI 做内容。", contentRefs: ["R1"] },
      { angle: "选题整理", howItIsTold: "标题强调整理选题。", contentRefs: ["R2"] }],
    crowded: [{ direction: "两个标题都说 AI 辅助内容工作。", contentRefs: ["R1", "R2"], limitation: "只是本次搜索的两个标题。" }],
    underused: [{ possibleAngle: "结合真实业务资料展示判断过程。", comparedWith: ["R1", "R2"], whyUnderused: "当前候选标题没有提到资料证据。", limitation: "未读取完整作品，不能断言全平台空白。" }],
    businessFit: { audience: "正在做内容的团队", canSpeak: "PARTIAL", reason: "项目和资料提供一个真实问题，但缺少使用结果。", ownEvidenceRefs: ["M1"], missingEvidence: ["自己的使用前后记录"] },
    opportunities: [{ topic: "用自有资料做选题", angle: "展示从资料到选题的判断过程", audience: "内容团队", whyNow: "AI 话题正在榜单中被观察到。",
      difference: "从业务资料出发而不是泛讲工具。", mechanism: "过程演示", ownProof: "展示自己的资料与真实操作过程", flow: ["问题", "资料", "判断", "结果"],
      testVariable: "开头先讲问题还是先展示结果", trendContentRefs: ["R1", "R2"], ownEvidenceRefs: ["M1"], limitation: "还没有自己的效果记录，不宣称效率提升。" }],
    researchLimits: ["相关候选只有标题，没有完整正文。"] };
}

const origin = "http://127.0.0.1:3020";
let browser: Browser, context: BrowserContext, workspaceId="", userId="", accountId="", stableKey="", accountRun="", topicRun="", projectId="";
let output=""; const completed: string[]=[];
let ownSourceId="", viewerId="", emptyUserId="", emptyWorkspaceId=""; let viewerContext: BrowserContext, emptyContext: BrowserContext;
const actor = () => ({workspaceId,userId});
beforeAll(async()=>{
 const target=process.env.FINAL_ACCEPTANCE_OUTPUT ?? "";
 const url=new URL(process.env.DATABASE_URL!);
 if(process.env.ENVIRONMENT_ID!=="LOCAL_REVIEW" || url.port!=="55436" || url.pathname!=="/content_center_upgrade_review" || !target.startsWith("output/research-account-trend-20261005/iteration-")) throw Error("ISOLATED_ACCOUNT_TREND_BROWSER_ONLY");
 output=resolve(process.cwd(),target,"browser-"+new Date().toISOString().replace(/[-:.]/g,"")+"-"+randomUUID().slice(0,8));await mkdir(output,{recursive:true});
 const email="account-trend-"+randomUUID()+"@example.test",password="fixture-"+randomUUID();
 userId=(await auth.api.signUpEmail({body:{name:"隔离研究测试",email,password}})).user.id;
 workspaceId=(await db.workspace.create({data:{name:"账号与趋势隔离验收",slug:randomUUID(),members:{create:{userId,role:"OWNER"}}}})).id;
 projectId=(await db.contentProject.create({data:{workspaceId,createdById:userId,title:"隔离内容项目",audience:"内容团队"}})).id;
 const suffix=randomUUID();
 accountId=(await db.benchmarkAccount.create({data:{workspaceId,createdById:userId,name:"隔离示例：问题讲解账号",platform:"DOUYIN",externalAccountId:suffix}})).id;
 const runtime={provider:new MockLLMProvider(input=>{
  if(JSON.parse(input.prompt).task.includes("决策层"))return sampleDecisionPass();
  const answer=sampleAnswer();answer.structureBlocks.forEach(block=>{block.startMs=null;block.endMs=null;});return answer;
 }),providerName:"FIXTURE",model:"account-trend-work-fixture",mode:"FIXTURE" as const};
 for(let i=0;i<2;i++){
  const externalId=suffix+"-"+i;
  const work=await db.benchmarkContentSnapshot.create({data:{workspaceId,benchmarkAccountId:accountId,platform:"DOUYIN",externalId,title:"隔离作品 "+(i+1)+"：从问题到方法",url:"https://example.test/work-"+i,publishedAt:new Date(Date.UTC(2026,8,i+1)),metadata:{},observations:{create:{metrics:{likes:10+i}}}}});
  await db.sourceItem.create({data:{workspaceId,createdById:userId,sourcePlatform:"DOUYIN",externalId,sourceType:"TEXT",rawText:sampleBody,status:"READY",title:"隔离可读正文"}});
  const workRun=await startWorkDeepResearch(actor(),accountId,work.id,{requestKey:randomUUID()});
  await executeResearchRun(actor(),workRun.sessionId,workRun.runId,{runtime});
  const stored=await db.researchRun.findUniqueOrThrow({where:{id:workRun.runId}});expect(stored.status,stored.errorMessage||undefined).toBe("COMPLETED");
 }
 const reserved=await startAccountV2Research(actor(),accountId,{requestKey:randomUUID()});accountRun=reserved.runId;
 const state=(await db.researchRun.findUniqueOrThrow({where:{id:accountRun}})).coverage as {accountV2:AccountV2State};
 await executeResearchRun(actor(),reserved.sessionId,accountRun,{runtime:{provider:new MockLLMProvider(()=>accountAnswer(state.accountV2)),providerName:"FIXTURE",model:"account-trend-account-fixture",mode:"FIXTURE"}});
 const source=await db.sourceItem.create({data:{workspaceId,createdById:userId,sourcePlatform:"DOUYIN",externalId:suffix+"-own",sourceType:"TEXT",rawText:"团队用自己的业务资料整理选题，并记录判断。隔离夹具，不是正式业务资料。",status:"READY",title:"隔离示例：自有业务记录"}});
 ownSourceId=source.id;
 const identity={provider:"FIXTURE",platform:"DOUYIN" as const,trendType:"HOT" as const,externalKey:suffix};stableKey=trendStableKey(identity);
 await db.trendSnapshot.create({data:{workspaceId,...identity,title:"隔离示例：AI 内容话题",keyword:"AI",rank:3,metrics:{},observedAt:new Date("2026-09-02T07:37:56.928Z"),windowStart:new Date("2026-09-01"),windowEnd:new Date("2026-09-02")}});
 const topic=await startTopicOpportunityV2(actor(),stableKey,{requestKey:randomUUID(),projectId,materialIds:[source.id]});topicRun=topic.runId;
 await executeResearchRun(actor(),topic.sessionId,topicRun,{runtime:{provider:new MockLLMProvider(()=>answer()),providerName:"FIXTURE",model:"account-trend-topic-fixture",mode:"FIXTURE"}});
 for(const id of [accountRun,topicRun]){const run=await db.researchRun.findUniqueOrThrow({where:{id}});expect(run.status,run.errorMessage||undefined).toBe("COMPLETED");}
 const signin=await auth.api.signInEmail({body:{email,password},asResponse:true});expect(signin.ok).toBe(true);
 browser=await chromium.launch({channel:"msedge",headless:true});context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.addCookies(signin.headers.getSetCookie().map(value=>{const pair=value.split(";")[0]!,separator=pair.indexOf("=");return{name:pair.slice(0,separator),value:pair.slice(separator+1),url:origin};}));
},180_000);
afterAll(async()=>{
 await Promise.allSettled([context?.close(),viewerContext?.close(),emptyContext?.close(),browser?.close()]);
 if(workspaceId||emptyWorkspaceId)await db.workspace.deleteMany({where:{id:{in:[workspaceId,emptyWorkspaceId].filter(Boolean)}}});
 if(userId||viewerId||emptyUserId)await db.user.deleteMany({where:{id:{in:[userId,viewerId,emptyUserId].filter(Boolean)}}});
 const cleaned=await db.workspace.count({where:{id:{in:[workspaceId,emptyWorkspaceId].filter(Boolean)}}})===0&&await db.user.count({where:{id:{in:[userId,viewerId,emptyUserId].filter(Boolean)}}})===0;
 if(output)await writeFile(resolve(output,"evidence.json"),JSON.stringify({completed,fixtureCleanupVerified:cleaned,formalBusinessWrites:0,paidModelCalls:0,automaticCollectionCalls:0,realUserPasswordUsed:false},null,2));
 expect(cleaned).toBe(true);await db.$disconnect();
},60_000);
async function pageFor(path:string){
 const page=await context.newPage();page.setDefaultTimeout(20_000);
 onTestFailed(async()=>{await page.screenshot({path:resolve(output,"failed-"+randomUUID()+".png"),fullPage:true,timeout:3000}).catch(()=>undefined);await page.close();});
 expect((await page.goto(origin+path,{waitUntil:"domcontentloaded"}))?.status()).toBe(200);return page;
}
async function selectOnly(page:Page,runId:string,buttonName:string){
 const before=await db.researchRun.findUniqueOrThrow({where:{id:runId}});
 const artifacts=await db.artifact.count({where:{workspaceId}});
 await page.waitForFunction(()=>document.querySelector(".research-use-findings")?.getAttribute("data-ready")==="true");
 const trigger=page.getByRole("button",{name:buttonName,exact:true});await trigger.click();
 const preparation=page.locator(".research-use-findings");
 await preparation.getByRole("button",{name:"带入项目，先审阅",exact:true}).waitFor();
 expect(await preparation.locator('input[type="checkbox"]:checked').count()).toBe(1);
 await preparation.getByRole("button",{name:"取消本次准备",exact:true}).click();
 await expect.poll(()=>trigger.evaluate(node=>document.activeElement===node)).toBe(true);
 expect(await db.artifact.count({where:{workspaceId}})).toBe(artifacts);
 expect((await db.researchRun.findUniqueOrThrow({where:{id:runId}})).blocks).toEqual(before.blocks);
}
it("account: nearby works, visible method limitations, selection and optional history on desktop/mobile",async()=>{
 const page=await pageFor("/research/benchmarks/"+accountId);
 await page.waitForFunction(()=>document.querySelector(".account-v2-panel")?.getAttribute("data-ready")==="true");
 await page.locator(".account-v2-patterns article").waitFor();
 expect(await page.locator(".account-v2-patterns article").count()).toBe(1);expect(await page.locator(".account-v2-lead .research-snapshot-note").innerText()).toContain("2026/9/2");expect(await page.locator(".dossier-identity-actions").innerText()).toContain("采集／观察记录于");
 expect(await page.locator(".account-v2-patterns article .account-v2-work-links a").count()).toBe(2);
 expect(await page.locator(".account-v2-patterns article .research-caption").isVisible()).toBe(true);
 expect(await page.locator("#account-details").getAttribute("open")).toBeNull();
 await page.screenshot({path:resolve(output,"account-desktop.png"),fullPage:true});
 await selectOnly(page,accountRun,"选这个方法用于创作");
 await page.getByRole("link",{name:"观察与历史详情",exact:true}).click();
 expect(await page.locator("#account-details").getAttribute("open")).not.toBeNull();
 await page.locator("#account-details > summary").click();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(output,"account-mobile.png")});await page.screenshot({path:resolve(output,"account-mobile-full.png"),fullPage:true});
 await page.goto(origin+"/research/benchmarks/"+accountId+"?tab=data",{waitUntil:"domcontentloaded"});
 await expect.poll(()=>page.locator("#account-details").getAttribute("open")).not.toBeNull();
 expect(await page.locator("#patterns").isVisible()).toBe(true);
 completed.push("account-desktop-mobile-selection-history");await page.close();
},120_000);
it("trend: saved snapshot freshness, title-only sources, own proof and isolated single-angle preparation",async()=>{
 const page=await pageFor("/research/trends/"+stableKey);
 await page.waitForFunction(()=>document.querySelector(".topic-v2-panel")?.getAttribute("data-ready")==="true");
 await page.locator(".topic-v2-opportunities article").waitFor();
 expect(await page.locator(".topic-v2-opportunities article").count()).toBe(1);
 expect(await page.locator(".research-snapshot-note").innerText()).toContain("2026/9/2");expect(await page.locator(".topic-v2-report>header h2").innerText()).toContain("该次快照榜单");
 expect(await page.locator(".research-snapshot-note").innerText()).toContain("未自动实时更新");
 expect(await page.locator(".topic-v2-opportunities article").innerText()).toContain("仅标题，未读正文");
 expect(await page.locator(".research-specialist-fit").innerText()).toContain("补齐自己的证据后再发布");
 const snapshots=page.getByText(/查看排名变化与历史快照/);
 expect(await page.locator(".research-trend-figure").isVisible()).toBe(false);
 await page.screenshot({path:resolve(output,"trend-desktop.png"),fullPage:true});
 await selectOnly(page,topicRun,"选这个角度用于创作");
 await snapshots.click();expect(await page.locator(".research-trend-figure").isVisible()).toBe(true);
 await snapshots.click();await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:resolve(output,"trend-mobile.png")});await page.screenshot({path:resolve(output,"trend-mobile-full.png"),fullPage:true});
 completed.push("trend-desktop-mobile-title-only-own-proof-selection");await page.close();
},120_000);

async function fixtureContext(name:string, workspace?:string, role:"OWNER"|"VIEWER"="OWNER"){
 const email="extra-"+randomUUID()+"@example.test",password="fixture-"+randomUUID();
 const id=(await auth.api.signUpEmail({body:{name,email,password}})).user.id;
 if(workspace)await db.workspaceMember.create({data:{workspaceId:workspace,userId:id,role}});
 const signin=await auth.api.signInEmail({body:{email,password},asResponse:true});
 const ctx=await browser.newContext({viewport:{width:1600,height:1000},reducedMotion:"reduce"});
 await ctx.addCookies(signin.headers.getSetCookie().map(value=>{const pair=value.split(";")[0]!,i=pair.indexOf("=");return{name:pair.slice(0,i),value:pair.slice(i+1),url:origin};}));
 return{id,ctx};
}
async function finishAccount(id:string, sessionId:string, zero=false){
 const state=(await db.researchRun.findUniqueOrThrow({where:{id}})).coverage as {accountV2:AccountV2State};
 const result=accountAnswer(state.accountV2);if(zero){result.patterns=[];result.skillCandidates=[];result.evolution=[];}
 await executeResearchRun(actor(),sessionId,id,{runtime:{provider:new MockLLMProvider(()=>result),providerName:"FIXTURE",model:"account-controls-fixture",mode:"FIXTURE"}});
 const run=await db.researchRun.findUniqueOrThrow({where:{id}});expect(run.status,run.errorMessage||undefined).toBe("COMPLETED");
}
async function finishTopic(id:string,sessionId:string,zero=false){
 const result=answer();if(zero)result.opportunities=[];
 await executeResearchRun(actor(),sessionId,id,{runtime:{provider:new MockLLMProvider(()=>result),providerName:"FIXTURE",model:"topic-controls-fixture",mode:"FIXTURE"}});
 const run=await db.researchRun.findUniqueOrThrow({where:{id}});expect(run.status,run.errorMessage||undefined).toBe("COMPLETED");
}
it("account updates reuse data, force persists one new version, save retries and viewer cannot write",async()=>{
 const page=await pageFor("/research/benchmarks/"+accountId);await page.waitForFunction(()=>document.querySelector(".account-v2-panel")?.getAttribute("data-ready")==="true");
 let starts=0;let fail=true;let forced="";
 const startUrl=origin+"/api/research/benchmarks/"+accountId+"/research-v2";
 await page.route(startUrl,async route=>{
  starts++;if(fail){fail=false;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"隔离模拟：暂时失败，请重试"})});}
  const reserved=await startAccountV2Research(actor(),accountId,route.request().postDataJSON());
  if(!reserved.unchanged){forced=reserved.runId;await finishAccount(reserved.runId,reserved.sessionId);}
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(reserved)});
 });
 await page.getByRole("button",{name:"依据新增作品更新",exact:true}).click();
 await page.getByRole("status").filter({hasText:"隔离模拟"}).waitFor();
 await page.getByRole("button",{name:"依据新增作品更新",exact:true}).evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
 await page.getByRole("status").filter({hasText:"没有变化"}).waitFor();expect(starts).toBe(2);expect(forced).toBe("");
 await page.getByRole("button",{name:"主动重新研究",exact:true}).evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
 await expect.poll(()=>forced).not.toBe("");await expect.poll(()=>page.locator(".account-v2-lead").innerText(),{timeout:20_000}).toContain("第 2 版");expect(starts).toBe(3);
 accountRun=forced;
 const result=await db.researchRun.findUniqueOrThrow({where:{id:accountRun}});expect(result.savedAt).toBeNull();
 const saveUrl=origin+"/api/research/sessions/"+result.sessionId+"/runs/"+result.id;let saves=0;let saveFail=true;
 await page.route(saveUrl,async route=>{if(route.request().method()!=="POST")return route.continue();saves++;if(saveFail){saveFail=false;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"隔离模拟：保存失败，研究仍保留"})});}return route.continue();});
 await page.getByRole("button",{name:"保存 / 分享研究成果",exact:true}).click();
 const panel=page.locator(".research-use-findings");
 await panel.getByRole("button",{name:"只保存原研究（仅本人）",exact:true}).click();
 await panel.getByRole("alert").filter({hasText:"隔离模拟"}).waitFor();
 await panel.getByRole("button",{name:"只保存原研究（仅本人）",exact:true}).evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
 await expect.poll(async()=>Boolean((await db.researchRun.findUniqueOrThrow({where:{id:accountRun}})).savedAt)).toBe(true);expect(saves).toBe(2);
 const viewer=await fixtureContext("隔离只读成员",workspaceId,"VIEWER");viewerId=viewer.id;viewerContext=viewer.ctx;
 expect((await viewerContext.request.post(startUrl,{data:{requestKey:randomUUID(),force:true}})).status()).toBe(403);
 completed.push("account-update-force-save-retry-double-click-viewer-403");await page.close();
},90_000);
it("trend switches actual project/material inputs, retries, force persists and viewer is rejected",async()=>{
 const project=await db.contentProject.create({data:{workspaceId,createdById:userId,title:"隔离第二项目",audience:"内容团队"}});
 const source=await db.sourceItem.create({data:{workspaceId,createdById:userId,sourceType:"TEXT",sourcePlatform:"DOUYIN",externalId:randomUUID(),title:"隔离第二资料",rawText:"团队用自己的业务资料整理选题，并记录每次判断。",status:"READY"}});
 const page=await pageFor("/research/trends/"+stableKey);await page.waitForFunction(()=>document.querySelector(".topic-v2-panel")?.getAttribute("data-ready")==="true");
 if (!(await page.locator(".research-specialist-inputs").evaluate(node=>(node as HTMLDetailsElement).open))) await page.locator(".research-specialist-inputs > summary").click();
 await page.locator(".topic-v2-controls select").selectOption(projectId);await page.getByLabel("隔离示例：自有业务记录",{exact:true}).check();
 await page.locator(".topic-v2-controls select").selectOption(project.id);expect(await page.getByLabel("隔离示例：自有业务记录",{exact:true}).isChecked()).toBe(false);
 const material=page.getByLabel("隔离第二资料",{exact:true});await material.check();
 expect(await page.locator(".topic-v2-materials input:checked").count()).toBe(1);
 let starts=0,fail=true,latest="";
 const url=origin+"/api/research/trends/"+stableKey+"/opportunity-v2";
 await page.route(url,async route=>{
  starts++;const payload=route.request().postDataJSON();expect(payload.projectId).toBe(project.id);expect(payload.materialIds).toEqual([source.id]);
  if(fail){fail=false;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"隔离模拟：研究失败，请重试"})});}
  const reserved=await startTopicOpportunityV2(actor(),stableKey,payload);latest=reserved.runId;
  if(!reserved.unchanged)await finishTopic(reserved.runId,reserved.sessionId);
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(reserved)});
 });
 await page.getByRole("button",{name:"用新数据更新选题机会",exact:true}).click();
 await page.getByRole("status").filter({hasText:"隔离模拟"}).waitFor();
 expect(await material.isChecked()).toBe(true);
 await page.getByRole("button",{name:"用新数据更新选题机会",exact:true}).evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
 await expect.poll(()=>latest).not.toBe("");await expect.poll(()=>page.locator(".topic-v2-report>header").innerText(),{timeout:20_000}).toContain("隔离第二项目");expect(starts).toBe(2);
 const first=latest;if (!(await page.locator(".research-specialist-inputs").evaluate(node=>(node as HTMLDetailsElement).open))) await page.locator(".research-specialist-inputs > summary").click();
 await page.getByRole("button",{name:"主动重新研究",exact:true}).evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
 await expect.poll(()=>latest).not.toBe(first);await expect.poll(()=>page.locator(".topic-v2-report>header").innerText(),{timeout:20_000}).toContain("第 2 版");expect(starts).toBe(3);topicRun=latest;
 const stored=await db.researchRun.findUniqueOrThrow({where:{id:topicRun}});expect(stored.status).toBe("COMPLETED");
 expect((await viewerContext.request.post(url,{data:{requestKey:randomUUID(),projectId:project.id,materialIds:[source.id],force:true}})).status()).toBe(403);
 await page.getByRole("button",{name:"保存 / 分享研究成果",exact:true}).click();
 await page.locator(".research-use-findings").getByRole("button",{name:"只保存原研究（仅本人）",exact:true}).evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
 await expect.poll(async()=>Boolean((await db.researchRun.findUniqueOrThrow({where:{id:topicRun}})).savedAt)).toBe(true);
 expect(await db.artifact.count({where:{workspaceId}})).toBe(0);
 completed.push("trend-project-material-update-retry-force-private-save-viewer-403");await page.close();
},90_000);

it("both active research panels stop polling after five failures and preserve the previous readable result",async()=>{
 for(const kind of ["account","trend"]){
  const path=kind==="account"?"/research/benchmarks/"+accountId:"/research/trends/"+stableKey;
  const page=await pageFor(path);
  await page.waitForFunction(()=>document.querySelector(".account-v2-panel,.topic-v2-panel")?.getAttribute("data-ready")==="true");
  if(kind==="trend"){if (!(await page.locator(".research-specialist-inputs").evaluate(node=>(node as HTMLDetailsElement).open))) await page.locator(".research-specialist-inputs > summary").click();expect(await page.getByRole("button",{name:"主动重新研究",exact:true}).isDisabled()).toBe(true);await page.locator(".topic-v2-controls select").selectOption(projectId);await page.getByLabel("隔离示例：自有业务记录",{exact:true}).check();}
  let reserved:{sessionId:string;runId:string}|null=null;let polls=0;
  const url=origin+(kind==="account"?"/api/research/benchmarks/"+accountId+"/research-v2":"/api/research/trends/"+stableKey+"/opportunity-v2");
  await page.route(url,async route=>{
   reserved=kind==="account"?await startAccountV2Research(actor(),accountId,{requestKey:randomUUID(),force:true}):await startTopicOpportunityV2(actor(),stableKey,{requestKey:randomUUID(),projectId,materialIds:[ownSourceId],force:true});
   await page.route(origin+"/api/research/sessions/"+reserved.sessionId+"/runs/"+reserved.runId,route=>{polls++;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"隔离模拟：状态不可用"})});});
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(reserved)});
  });
  await page.getByRole("button",{name:"主动重新研究",exact:true}).click();
  const message=kind==="account"?"暂时无法连接研究状态":"状态暂时不可用";
  onTestFailed(async()=>console.info("ISOLATED_POLL_DIAGNOSTIC",{kind,reserved,polls,status:await page.locator(".account-v2-panel,.topic-v2-panel").innerText().catch(()=>"(closed)")}));await page.getByRole("status").filter({hasText:message}).waitFor({timeout:30_000});
  expect(polls).toBe(5);expect(await page.locator(kind==="account"?".account-v2-lead":".topic-v2-report>header").isVisible()).toBe(true);
  expect(reserved).not.toBeNull();const id=(reserved as unknown as {runId:string}).runId;
  expect((await db.researchRun.findUniqueOrThrow({where:{id}})).status).toBe("QUEUED");
  await db.researchRun.update({where:{id},data:{status:"FAILED",errorMessage:"隔离轮询验收已清理"}});
  await page.close();
 }
 completed.push("account-and-trend-five-poll-failures-preserve-old-result");
},100_000);
it("empty workspace shows no project/material and zero or one readable account work without inventing research",async()=>{
 const empty=await fixtureContext("隔离空资料用户");emptyUserId=empty.id;emptyContext=empty.ctx;
 emptyWorkspaceId=(await db.workspace.create({data:{name:"隔离空资料验收",slug:randomUUID(),members:{create:{userId:emptyUserId,role:"OWNER"}}}})).id;
 const account=await db.benchmarkAccount.create({data:{workspaceId:emptyWorkspaceId,createdById:emptyUserId,name:"隔离无正文账号",platform:"DOUYIN",externalAccountId:randomUUID()}});
 const identity={provider:"FIXTURE",platform:"DOUYIN" as const,trendType:"HOT" as const,externalKey:randomUUID()};
 const key=trendStableKey(identity);
 await db.trendSnapshot.create({data:{workspaceId:emptyWorkspaceId,...identity,title:"隔离无资料趋势",keyword:"AI",rank:null,metrics:{},observedAt:new Date("2026-09-02T07:37:56.928Z"),windowStart:new Date("2026-09-01"),windowEnd:new Date("2026-09-02")}});
 const page=await emptyContext.newPage();
 expect((await page.goto(origin+"/research/benchmarks/"+account.id,{waitUntil:"domcontentloaded"}))?.status()).toBe(200);
 await page.waitForFunction(()=>document.querySelector(".account-v2-panel")?.getAttribute("data-ready")==="true");
 expect(await page.getByRole("button",{name:"开始账号综合研究",exact:true}).isDisabled()).toBe(true);
 expect(await page.locator(".account-v2-intro").innerText()).toContain("已读懂 0 条");
 expect(await page.getByText("跨作品模式需要不同作品互相印证。",{exact:false}).isVisible()).toBe(true);
 await page.screenshot({path:resolve(output,"account-empty.png"),fullPage:true});
 const externalId=randomUUID();const work=await db.benchmarkContentSnapshot.create({data:{workspaceId:emptyWorkspaceId,benchmarkAccountId:account.id,platform:"DOUYIN",externalId,title:"隔离唯一可读作品",url:"https://example.test/empty-work",publishedAt:new Date("2026-09-02"),metadata:{},observations:{create:{metrics:{}}}}});
 await db.sourceItem.create({data:{workspaceId:emptyWorkspaceId,createdById:emptyUserId,sourcePlatform:"DOUYIN",externalId,sourceType:"TEXT",rawText:sampleBody,status:"READY",title:"隔离唯一正文"}});
 const member={workspaceId:emptyWorkspaceId,userId:emptyUserId};const run=await startWorkDeepResearch(member,account.id,work.id,{requestKey:randomUUID()});
 await executeResearchRun(member,run.sessionId,run.runId,{runtime:{provider:new MockLLMProvider(input=>{if(JSON.parse(input.prompt).task.includes("决策层"))return sampleDecisionPass();const a=sampleAnswer();a.structureBlocks.forEach(b=>{b.startMs=null;b.endMs=null;});return a;}),providerName:"FIXTURE",model:"empty-account-fixture",mode:"FIXTURE"}});
 await page.reload({waitUntil:"domcontentloaded"});expect(await page.locator(".account-v2-intro").innerText()).toContain("已读懂 1 条");
 expect(await page.getByRole("button",{name:"开始账号综合研究",exact:true}).isDisabled()).toBe(true);
 // Delete only this isolated material, so the empty trend really has no own material.
 await db.sourceItem.deleteMany({where:{workspaceId:emptyWorkspaceId}});
 await page.goto(origin+"/research/trends/"+key,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector(".topic-v2-panel")?.getAttribute("data-ready")==="true");
 expect(await page.getByText("当前没有可用项目。先到",{exact:false}).isVisible()).toBe(true);
 expect(await page.getByRole("button",{name:"研究趋势并找选题机会",exact:true}).isDisabled()).toBe(true);
 await page.screenshot({path:resolve(output,"trend-no-project.png"),fullPage:true});
 await db.contentProject.create({data:{workspaceId:emptyWorkspaceId,createdById:emptyUserId,title:"隔离空材料项目"}});
 await page.reload({waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>document.querySelector(".topic-v2-panel")?.getAttribute("data-ready")==="true");await page.getByText("还没有可选的自有资料。",{exact:false}).waitFor();
 expect(await page.getByRole("button",{name:"研究趋势并找选题机会",exact:true}).isDisabled()).toBe(true);
 await page.screenshot({path:resolve(output,"trend-no-material.png"),fullPage:true});
 completed.push("no-project-no-material-zero-one-readable-work-actual-empty-fixtures");await page.close();
},90_000);
it("valid zero-method and zero-opportunity results show honest empty messages without selectable phantom findings",async()=>{
 const account=await startAccountV2Research(actor(),accountId,{requestKey:randomUUID(),force:true});await finishAccount(account.runId,account.sessionId,true);
 const page=await pageFor("/research/benchmarks/"+accountId);
 await page.waitForFunction(()=>document.querySelector(".account-v2-panel")?.getAttribute("data-ready")==="true");
 expect(await page.getByText("当前作品还不足以确认稳定做法；可以继续深拆其他方向。",{exact:true}).isVisible()).toBe(true);
 expect(await page.getByRole("button",{name:"选这个方法用于创作",exact:true}).count()).toBe(0);
 await page.screenshot({path:resolve(output,"account-zero-method.png"),fullPage:true});
 const topic=await startTopicOpportunityV2(actor(),stableKey,{requestKey:randomUUID(),projectId,materialIds:[ownSourceId],force:true});await finishTopic(topic.runId,topic.sessionId,true);
 await page.goto(origin+"/research/trends/"+stableKey,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>document.querySelector(".topic-v2-panel")?.getAttribute("data-ready")==="true");
 expect(await page.getByText("当前项目与资料尚不足以形成可靠的选题机会。",{exact:true}).isVisible()).toBe(true);
 expect(await page.getByRole("button",{name:"选这个角度用于创作",exact:true}).count()).toBe(0);
 await page.screenshot({path:resolve(output,"trend-zero-opportunity.png"),fullPage:true});
 completed.push("valid-zero-pattern-zero-opportunity-no-invented-cards");await page.close();
},90_000);
