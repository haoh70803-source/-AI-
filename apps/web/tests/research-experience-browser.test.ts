import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it, vi, onTestFailed } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { runProjectAssistant, type AssistantStreamEvent } from "../server/assistant/service";
import { auth } from "../lib/auth";
const origin = "http://localhost:3020";
const evidence = resolve(process.cwd(), process.env.FINAL_ACCEPTANCE_OUTPUT || "__missing", "research-browser-" + new Date().toISOString().replaceAll(/[-:.]/g,"") + "-" + randomUUID().slice(0,8));
let browser: Browser, owner: BrowserContext, viewer: BrowserContext;
let userId="", viewerId="", workspaceId="", projectId="", runId="", sessionId="", materialId="", otherProject="", viewerProject="", viewerRun="", unsavedRun="", foreignId="", foreignWorkspace="", foreignProject="";
const source = { ref:"M1",kind:"MATERIAL",objectId:"fixture-material",title:"测试来源",href:null,capturedAt:null,publishedAt:null,eventAt:null,contentOrigin:"ORIGINAL",locator:null,excerpt:"可核对的测试来源",version:null };
const privateSource={...source,ref:"P1",kind:"CREATOR_PROFILE",title:"私人背景",excerpt:"不应自动分享的私人原文"};
const blocks = [{id:"finding-a",type:"text",title:"先看懂问题再选表达",text:"这是可调整的研究发现",provenance:"AI_INTERPRETATION",sourceRefs:["M1"],limitation:"仅测试样本"},
{id:"finding-b",type:"text",title:"另一种可行的角度",text:"第二条独立发现",provenance:"AI_INTERPRETATION",sourceRefs:["M1"],limitation:"仍需核对"},
{id:"personal",type:"text",title:"我的个人判断",text:"个人判断需要再核实",provenance:"AI_INTERPRETATION",sourceRefs:["P1"],limitation:"私人背景不是外部证据"},
{id:"sources",type:"sources",title:"研究依据",provenance:"REAL_DATA",sourceRefs:["M1","P1"],limitation:null,refs:[source,privateSource]}];
async function signIn(email:string,password:string){
 const response=await auth.api.signInEmail({body:{email,password},asResponse:true});expect(response.ok).toBe(true);
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.addCookies(response.headers.getSetCookie().map(v=>{const p=v.split(";")[0]!,i=p.indexOf("=");return{name:p.slice(0,i),value:p.slice(i+1),url:origin};}));return context;
}
beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL!);if(process.env.ENVIRONMENT_ID!=="LOCAL_REVIEW"||url.port!=="55436"||!url.pathname.includes("content_center_upgrade_review")||!(process.env.FINAL_ACCEPTANCE_OUTPUT?.startsWith("output/research-experience-20261005/implementation-") || process.env.FINAL_ACCEPTANCE_OUTPUT?.startsWith("output/research-redesign-20261005/iteration-") || process.env.FINAL_ACCEPTANCE_OUTPUT?.startsWith("output/research-account-trend-20261005/iteration-")))throw Error("ISOLATED_REVIEW_REQUIRED");
 await mkdir(evidence,{recursive:true});const s=randomUUID(),password="fixture-"+randomUUID(),email="research-experience-"+s+"@example.test",viewerEmail="research-experience-viewer-"+s+"@example.test";
 userId=(await auth.api.signUpEmail({body:{name:"研究体验测试",email,password}})).user.id;viewerId=(await auth.api.signUpEmail({body:{name:"只读测试",email:viewerEmail,password}})).user.id;
 workspaceId=(await db.workspace.create({data:{name:"研究体验隔离空间",slug:"research-experience-"+s,members:{create:[{userId,role:"OWNER"},{userId:viewerId,role:"VIEWER"}]}}})).id;
 projectId=(await db.contentProject.create({data:{workspaceId,createdById:userId,title:"研究转创作测试项目"}})).id;
 sessionId=(await db.researchSession.create({data:{workspaceId,createdById:userId,title:"怎么把发现用于自己的内容",entryTemplate:"DIRECT",requestKey:randomUUID()}})).id;
 runId=(await db.researchRun.create({data:{workspaceId,sessionId,requestedById:userId,question:"找出适合本次内容的角度",version:1,requestKey:randomUUID(),requestHash:"fixture",status:"COMPLETED",stage:"COMPLETED",savedAt:new Date(),finishedAt:new Date(),blocks,sourceRefs:[source],inputScope:{materialIds:[],benchmarkAccountIds:[],trendKeys:[],notes:"",useCreatorProfile:false,useOwnArtifacts:false}}})).id;
 materialId=(await db.sourceItem.create({data:{workspaceId,createdById:userId,sourceType:"TEXT",sourcePlatform:"GENERIC",title:"已有的业务资料",rawText:"已有业务资料的真实测试正文",status:"READY",projects:{create:{projectId,role:"REFERENCE"}}}})).id;
 otherProject=(await db.contentProject.create({data:{workspaceId,createdById:viewerId,title:"其他成员的项目对话",assistantThreads:{create:{workspaceId,createdById:viewerId}}}})).id;viewerProject=(await db.contentProject.create({data:{workspaceId,createdById:viewerId,title:"只读成员已有项目"}})).id;
 const vs=await db.researchSession.create({data:{workspaceId,createdById:viewerId,title:"只读成员私人研究",entryTemplate:"DIRECT",requestKey:randomUUID()}});viewerRun=(await db.researchRun.create({data:{workspaceId,sessionId:vs.id,requestedById:viewerId,question:"已有私人研究",version:1,requestKey:randomUUID(),requestHash:"fixture",status:"COMPLETED",stage:"COMPLETED",blocks,sourceRefs:[source,privateSource],inputScope:{materialIds:[],benchmarkAccountIds:[],trendKeys:[],notes:"",useCreatorProfile:false,useOwnArtifacts:false}}})).id;
 const us=await db.researchSession.create({data:{workspaceId,createdById:userId,title:"可独立保存的研究",entryTemplate:"DIRECT",requestKey:randomUUID()}});unsavedRun=(await db.researchRun.create({data:{workspaceId,sessionId:us.id,requestedById:userId,question:"先完成研究，暂不创作",version:1,requestKey:randomUUID(),requestHash:"fixture",status:"COMPLETED",stage:"COMPLETED",blocks,sourceRefs:[source,privateSource],inputScope:{materialIds:[],benchmarkAccountIds:[],trendKeys:[],notes:"",useCreatorProfile:false,useOwnArtifacts:false}}})).id;
 foreignId=(await db.user.create({data:{name:"其他空间测试",email:"research-experience-foreign-"+s+"@example.test"}})).id;foreignWorkspace=(await db.workspace.create({data:{name:"其他空间",slug:"research-experience-foreign-"+s,members:{create:{userId:foreignId,role:"OWNER"}}}})).id;foreignProject=(await db.contentProject.create({data:{workspaceId:foreignWorkspace,createdById:foreignId,title:"跨空间项目"}})).id;
 browser=await chromium.launch({channel:"msedge",headless:true});owner=await signIn(email,password);viewer=await signIn(viewerEmail,password);
},90000);
afterAll(async()=>{const closes=await Promise.allSettled([owner?.close(),viewer?.close(),browser?.close()]);await writeFile(resolve(evidence,"browser-close.json"),JSON.stringify(closes.map(value=>({status:value.status}))));await db.workspace.deleteMany({where:{id:{in:[workspaceId,foreignWorkspace].filter(Boolean)}}});await db.user.deleteMany({where:{id:{in:[userId,viewerId,foreignId].filter(Boolean)}}});await writeFile(resolve(evidence,"fixture-cleanup.json"),JSON.stringify({fixtureUsersRemaining:await db.user.count({where:{id:{in:[userId,viewerId,foreignId].filter(Boolean)}}}),formalDatabaseWrites:0,realModelCalls:0,mockModelCalls:mockCalls,checks}));await db.$disconnect();},60000);

const checks:string[]=[];let mockCalls=0;let lastSent:Record<string,unknown>|null=null;
async function go(page:Page,path:string){await page.goto(origin+path,{waitUntil:"domcontentloaded",timeout:90000});}
function track(page:Page,name:string){onTestFailed(async()=>{await page.screenshot({path:resolve(evidence,name+"-failure.png"),fullPage:true}).catch(()=>undefined);await writeFile(resolve(evidence,name+"-failure.json"),JSON.stringify({url:page.url(),text:await page.locator("body").innerText().catch(()=>""),formalDatabaseWrites:0}));await page.close();});}
const resultPath=()=>"/research/results/run/"+runId;
async function openFindings(page:Page,mode:"create"|"share"="create"){
 await page.waitForFunction(()=>document.querySelector('[data-testid="research-use-findings"]')?.getAttribute("data-ready")==="true");
 await page.getByRole("button",{name:mode==="create"?"用这些发现创作":"保存 / 分享研究成果",exact:true}).first().click();
 await page.getByRole("checkbox",{name:"先看懂问题再选表达",exact:true}).waitFor();
}
async function ownProject(page:Page){await go(page,"/dashboard?project="+projectId);await page.waitForFunction(()=>document.querySelector('[data-testid="studio-project-assistant"]')?.getAttribute("data-draft-ready")==="true");}
it("makes independent research/home/history clear without automatic model or sharing",async()=>{
 const page=await owner.newPage();track(page,"home-and-result");
 await go(page,"/research");await page.getByRole("textbox",{name:"你想研究什么？",exact:true}).waitFor();
 expect((await page.getByRole("textbox",{name:"你想研究什么？",exact:true}).boundingBox())!.y).toBeLessThan(900);
 await page.getByRole("button",{name:"单条内容",exact:true}).waitFor();expect(await db.artifact.count({where:{workspaceId}})).toBe(0);
 await page.screenshot({path:resolve(evidence,"after-home.png"),fullPage:true});
 await go(page,resultPath());await openFindings(page);await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).fill("只为本次使用调整的发现");
 await page.getByRole("button",{name:"取消本次准备",exact:true}).click();
 expect(await db.artifact.count({where:{workspaceId}})).toBe(0);expect(JSON.stringify((await db.researchRun.findUniqueOrThrow({where:{id:runId}})).blocks)).not.toContain("只为本次使用调整");
 await page.screenshot({path:resolve(evidence,"after-result.png"),fullPage:true});checks.push("independent-home-result-no-auto-model-no-share-original-unchanged");await page.close();
},120000);
it("keeps old input/references, supports cancel and confirmed replacement/append, refresh and explicit mock send with real artifact save",async()=>{
 const page=await owner.newPage();track(page,"private-handoff");
 await ownProject(page);const input=page.getByRole("textbox",{name:"和鑫小助说",exact:true});await input.fill("原来的内容计划");
 await page.getByRole("button",{name:"引用已有内容",exact:true}).click();await page.getByRole("textbox",{name:"搜索引用",exact:true}).fill("已有的业务资料");await page.getByRole("button",{name:/已有的业务资料/}).click();
 await page.getByRole("button",{name:"移除 已有的业务资料",exact:true}).waitFor();
 await expect.poll(async()=>await page.evaluate(()=>Object.values(sessionStorage).some(value=>value.includes("原来的内容计划")&&value.includes("已有的业务资料")))).toBe(true);
 await go(page,resultPath());await openFindings(page);await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).fill("这次只用的修订发现");
 await page.getByRole("checkbox",{name:"另一种可行的角度",exact:true}).uncheck();await page.getByRole("checkbox",{name:"我的个人判断",exact:true}).uncheck();
 await page.getByRole("combobox",{name:"研究使用项目",exact:true}).selectOption(projectId);await page.getByRole("textbox",{name:"本次创作意图",exact:true}).fill("请把本次发现写成一段内容");
 await page.getByRole("button",{name:"带入项目，先审阅",exact:true}).click();await page.getByRole("region",{name:"审阅研究带入内容"}).waitFor();
 expect(await input.inputValue()).toBe("原来的内容计划");expect(await db.assistantMessage.count({where:{thread:{projectId}}})).toBe(0);expect(await db.artifact.count({where:{projectId}})).toBe(0);
 await page.getByRole("button",{name:"取消带入，保留原输入",exact:true}).click();expect(await input.inputValue()).toBe("原来的内容计划");
 await page.goBack({waitUntil:"domcontentloaded",timeout:90000});await openFindings(page);
 expect(await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).inputValue()).toBe("这次只用的修订发现");
 await page.getByRole("button",{name:"带入项目，先审阅",exact:true}).click();await page.getByRole("button",{name:"替换输入文字…",exact:true}).click();
 const replace=page.getByRole("dialog",{name:"替换当前输入？",exact:true});await replace.waitFor();await replace.getByRole("button",{name:"取消",exact:true}).click();expect(await input.inputValue()).toBe("原来的内容计划");
 await page.getByRole("button",{name:"追加到现有输入",exact:true}).click();await expect.poll(()=>input.inputValue()).toBe("原来的内容计划\n\n请把本次发现写成一段内容");
 await page.reload({waitUntil:"domcontentloaded",timeout:90000});await page.waitForFunction(()=>document.querySelector('[data-testid="studio-project-assistant"]')?.getAttribute("data-draft-ready")==="true");
 expect(await input.inputValue()).toBe("原来的内容计划\n\n请把本次发现写成一段内容");expect(await page.getByRole("region",{name:"审阅研究带入内容"}).count()).toBe(0);
 expect(await page.getByRole("button",{name:"移除 已有的业务资料",exact:true}).count()).toBe(1);
 const provider=new MockLLMProvider(()=>{mockCalls++;return "这是结合用户选中发现形成的受控测试稿件。";});
 await page.route("**/api/projects/"+projectId+"/assistant",async route=>{
   if(route.request().method()!=="POST"){await route.continue();return;}
   const body=route.request().postDataJSON();lastSent=body;
   const events:AssistantStreamEvent[]=[];
   await runProjectAssistant({workspaceId,userId,projectId,...body},event=>events.push(event),{runtime:{provider,providerName:"KIMI",model:"kimi-k2.6",requestedModel:"kimi-k2.6",mode:"REAL"}});
   await route.fulfill({status:200,contentType:"text/event-stream",body:events.map(event=>"data: "+JSON.stringify(event)+"\n\n").join("")});
 });
 const sendButton=page.getByRole("button",{name:"发送给鑫小助",exact:true});
 if(await sendButton.isDisabled()){
   // The isolated host has no configured model. Keep that real UI restriction;
   // explicitly exercise the Mock service with the browser's actual prepared input.
   const draft=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||"null")?.draft,"research-creation:"+workspaceId+":"+userId+":"+projectId+":composer") as import("../lib/research-creation-draft").ProjectInputDraft;
   expect(draft.input).toBe(await input.inputValue());
   const body={content:draft.input,references:draft.references.map(({sourceType,sourceId,researchSelection})=>({sourceType,sourceId,...(researchSelection?{researchSelection}:{})})),skillVersionId:draft.skillId||null,...(draft.materialIds.length?{sourceItemIds:draft.materialIds}:{})};
   lastSent=body;
   await runProjectAssistant({workspaceId,userId,projectId,...body},()=>{}, {runtime:{provider,providerName:"KIMI",model:"kimi-k2.6",requestedModel:"kimi-k2.6",mode:"REAL"}});
   checks.push("unconfigured-real-ui-keeps-send-disabled-explicit-test-only-mock-service-with-actual-browser-draft");
   await page.reload({waitUntil:"domcontentloaded",timeout:90000});
 }else await sendButton.click();
 await page.getByRole("button",{name:"保存为成果",exact:true}).waitFor({timeout:60000});expect(mockCalls).toBe(1);
 expect(JSON.stringify(lastSent)).toContain("这次只用的修订发现");expect(JSON.stringify(lastSent)).toContain(materialId);expect(JSON.stringify(lastSent)).not.toContain("第二条独立发现");
 expect(await db.artifact.count({where:{projectId}})).toBe(0);
 await page.getByRole("button",{name:"保存为成果",exact:true}).click();const dialog=page.getByRole("dialog",{name:"保存为项目成果",exact:true});await dialog.waitFor();expect(await dialog.innerText()).toContain("只读成员");
 await dialog.getByRole("button",{name:"取消",exact:true}).click();expect(await db.artifact.count({where:{projectId}})).toBe(0);
 await page.getByRole("button",{name:"保存为成果",exact:true}).click();await dialog.getByRole("textbox",{name:"名称",exact:true}).fill("明确保存的个人创作成果");
 await dialog.getByRole("button",{name:"保存成果",exact:true}).evaluate(element=>{(element as HTMLButtonElement).click();(element as HTMLButtonElement).click();});
 await expect.poll(()=>db.artifact.count({where:{projectId}})).toBe(1);
 const artifact=await db.artifact.findFirstOrThrow({where:{projectId,title:"明确保存的个人创作成果"}});
 expect((await viewer.request.get(origin+"/api/projects/"+projectId+"/artifacts/"+artifact.id)).status()).toBe(200);
 expect((await viewer.request.get(origin+"/api/research/creation?resultId="+runId)).status()).toBe(404);
 await page.screenshot({path:resolve(evidence,"explicit-saved-creation.png"),fullPage:true});checks.push("private-prefill-cancel-replace-cancel-append-old-input-references-refresh-explicit-mock-send-real-shared-save");await page.close();
},240000);
it("shares actual selected preview only after confirmation; lost response retry is idempotent and cancel after sharing does not revoke",async()=>{
 const page=await owner.newPage();track(page,"explicit-sharing");await go(page,resultPath());await openFindings(page,"share");
 await page.getByRole("checkbox",{name:"先看懂问题再选表达",exact:true}).check();await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).fill("我批准分享的修订结论");
 await page.getByRole("combobox",{name:"研究使用项目",exact:true}).selectOption(projectId);await page.getByRole("button",{name:"查看实际共享预览",exact:true}).click();
 const preview=page.locator(".research-actual-preview");await preview.waitFor();expect(await preview.innerText()).toContain("只读成员");expect(await preview.innerText()).toContain("我批准分享的修订结论");expect(await preview.innerText()).not.toContain("第二条独立发现");
 await page.getByRole("button",{name:"取消本次准备",exact:true}).click();expect(await db.artifact.count({where:{projectId,sourceResearchRunId:runId}})).toBe(0);
 await openFindings(page,"share");await page.getByRole("button",{name:"查看实际共享预览",exact:true}).click();await page.getByRole("checkbox",{name:"我已检查完整正文与可见范围",exact:true}).check();
 let attempts=0;const shareURL=origin+"/api/research/results/"+runId+"/share";
 await page.route(shareURL,async route=>{attempts++;const response=await route.fetch();expect(response.status()).toBe(201);await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"模拟响应丢失，保留选择后重试"})});});
 await page.getByRole("button",{name:"确认保存并分享",exact:true}).click();await page.getByRole("alert").filter({hasText:"模拟响应丢失"}).waitFor();
 expect(await db.artifact.count({where:{projectId,sourceResearchRunId:runId}})).toBe(1);expect(await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).inputValue()).toBe("我批准分享的修订结论");
 await page.unroute(shareURL);await page.getByRole("button",{name:"确认保存并分享",exact:true}).evaluate(element=>{(element as HTMLButtonElement).click();(element as HTMLButtonElement).click();});
 await page.getByRole("status").filter({hasText:"这份研究已分享过"}).waitFor();expect(attempts).toBe(1);expect(await db.artifact.count({where:{projectId,sourceResearchRunId:runId}})).toBe(1);
 await page.getByRole("button",{name:"取消本次准备",exact:true}).click();expect(await db.artifact.count({where:{projectId,sourceResearchRunId:runId}})).toBe(1);
 const artifact=await db.artifact.findFirstOrThrow({where:{projectId,sourceResearchRunId:runId}});const shared=await viewer.request.get(origin+"/api/projects/"+projectId+"/artifacts/"+artifact.id);expect(shared.status()).toBe(200);expect((await shared.json()).content).toContain("我批准分享的修订结论");
 await openFindings(page,"share");await page.getByRole("button",{name:"查看实际共享预览",exact:true}).click();await page.getByText("已分享成果的实际正文",{exact:true}).waitFor();
 await page.screenshot({path:resolve(evidence,"explicit-sharing-preview.png"),fullPage:true});checks.push("actual-preview-preconfirm-cancel-no-share-confirmed-share-lost-response-real-retry-once-postshare-cancel-keeps-artifact");await page.close();
},180000);
it("saves private research independently without a project or artifact and permits an explicit personal judgment share",async()=>{
 const page=await owner.newPage();track(page,"private-save");await go(page,"/research/results/run/"+unsavedRun);await openFindings(page,"share");
 await page.getByRole("button",{name:"只保存原研究（仅本人）",exact:true}).evaluate(element=>{(element as HTMLButtonElement).click();(element as HTMLButtonElement).click();});
 await page.getByRole("status").filter({hasText:"原研究已保存到我的研究"}).waitFor();expect((await db.researchRun.findUniqueOrThrow({where:{id:unsavedRun}})).savedAt).not.toBeNull();expect(await db.artifact.count({where:{sourceResearchRunId:unsavedRun}})).toBe(0);
 await page.getByRole("checkbox",{name:"我的个人判断",exact:true}).check();await page.getByRole("textbox",{name:"调整结论：我的个人判断"}).fill("我主动分享的个人想法");
 await page.getByRole("combobox",{name:"研究使用项目",exact:true}).selectOption(otherProject);await page.getByRole("button",{name:"查看实际共享预览",exact:true}).click();const preview=page.locator(".research-actual-preview");await preview.waitFor();
 expect(await preview.innerText()).toContain("没有可核验的外部来源");expect(await preview.innerText()).not.toContain("不应自动分享的私人原文");await page.getByRole("checkbox",{name:"我已检查完整正文与可见范围",exact:true}).check();await page.getByRole("button",{name:"确认保存并分享",exact:true}).click();
 await page.getByRole("status").filter({hasText:"已保存并分享选中的结论"}).waitFor();expect(await db.artifact.count({where:{sourceResearchRunId:unsavedRun}})).toBe(1);checks.push("independent-private-save-no-project-no-artifact-explicit-personal-judgment-share-raw-background-excluded");await page.close();
},120000);
it("enforces real API private/viewer/cross-workspace/other-thread and disabled-member boundaries",async()=>{
 const value={projectId,resultId:runId,selection:{kind:"run",version:1,items:[{id:"finding-a",text:"真实边界测试"}]},content:"暂存而不发送"};
 expect((await owner.request.post(origin+"/api/research/creation",{data:value})).status()).toBe(200);
 expect((await viewer.request.get(origin+"/api/research/creation?resultId="+runId)).status()).toBe(404);
 expect((await owner.request.post(origin+"/api/research/creation",{data:{...value,projectId:foreignProject}})).status()).toBe(404);
 expect((await owner.request.post(origin+"/api/research/creation",{data:{...value,projectId:otherProject}})).status()).toBe(403);
 const ownViewer={...value,projectId:viewerProject,resultId:viewerRun};
 expect((await viewer.request.post(origin+"/api/research/creation",{data:ownViewer})).status()).toBe(200);
 expect((await viewer.request.post(origin+"/api/research/results/"+viewerRun+"/share",{data:{projectId:viewerProject,selection:ownViewer.selection}})).status()).toBe(403);
 await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId:viewerId}},data:{disabledAt:new Date()}});
 try{expect([401,403,404]).toContain((await viewer.request.post(origin+"/api/research/creation",{data:ownViewer})).status());}finally{await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId:viewerId}},data:{disabledAt:null}});}
 const anonymous=await browser.newContext();expect((await anonymous.request.get(origin+"/api/research/creation?resultId="+runId)).status()).toBe(401);await anonymous.close();
 checks.push("real-http-private-viewer-own-read-share403-cross-workspace404-other-thread403-disabled-denied-unauth401");
},120000);
it("handles expired/other-account drafts and narrow screen keyboard focus without automatic send or sharing",async()=>{
 const page=await owner.newPage();track(page,"draft-and-mobile");
 await ownProject(page);const input=page.getByRole("textbox",{name:"和鑫小助说",exact:true});await input.fill("保留现有输入");
 const prepared=await (await owner.request.post(origin+"/api/research/creation",{data:{projectId,resultId:runId,selection:{kind:"run",version:1,items:[{id:"finding-a",text:"草稿过期测试"}]},content:"不应自动带入的输入"}})).json();
 const storageKey="research-creation:"+workspaceId+":"+userId+":"+projectId+":pending";
 await page.evaluate(({key,value})=>sessionStorage.setItem(key,JSON.stringify(value)),{key:storageKey,value:{...prepared,actor:{workspaceId,userId:viewerId}}});await page.reload({waitUntil:"domcontentloaded",timeout:90000});await page.waitForFunction(()=>document.querySelector('[data-testid="studio-project-assistant"]')?.getAttribute("data-draft-ready")==="true");expect(await page.getByRole("region",{name:"审阅研究带入内容"}).count()).toBe(0);
 await page.evaluate(({key,value})=>sessionStorage.setItem(key,JSON.stringify(value)),{key:storageKey,value:{...prepared,expiresAt:Date.now()-1}});await page.reload({waitUntil:"domcontentloaded",timeout:90000});await page.waitForFunction(()=>document.querySelector('[data-testid="studio-project-assistant"]')?.getAttribute("data-draft-ready")==="true");expect(await page.getByRole("region",{name:"审阅研究带入内容"}).count()).toBe(0);
 await page.setViewportSize({width:390,height:844});await go(page,resultPath());await openFindings(page);await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).fill("手机端可编辑发现");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).press("Escape");await page.getByRole("button",{name:"用这些发现创作",exact:true}).first().waitFor();expect(await page.getByRole("button",{name:"用这些发现创作",exact:true}).first().evaluate(element=>element===document.activeElement)).toBe(true);
 await openFindings(page);expect(await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).inputValue()).toBe("手机端可编辑发现");
 await page.reload({waitUntil:"domcontentloaded",timeout:90000});await openFindings(page);expect(await page.getByRole("textbox",{name:"调整结论：先看懂问题再选表达"}).inputValue()).toBe("手机端可编辑发现");
 await page.screenshot({path:resolve(evidence,"mobile-research-findings.png"),fullPage:true});checks.push("foreign-and-expired-drafts-cleared-mobile-no-overflow-escape-focus-return-local-edits-refresh-no-auto-model");await page.close();
},180000);

it("reads three different material results with dynamic findings, nearby originals and single-finding handoff",async()=>{
 const page=await owner.newPage();track(page,"three-material-readers");
 const examples=[
  {name:"短视频文字稿",count:1,origin:"MACHINE_TRANSCRIPT",body:"视频文字稿：先问观众遇到什么问题，再用自己的案例解释做法。未提供画面与逐句时间点。"},
  {name:"两篇文章的观点比较",count:4,origin:"USER_PROVIDED",body:"第一篇文章重视短期结果；第二篇强调长期条件。共同结论不等于共同证据，需要分别核对。"},
  {name:"行业问题与补充资料",count:7,origin:"USER_PROVIDED",body:"行业资料只提供某一时期的案例。研究可以形成不同问题和待核实判断，不能推断实时趋势。"}
 ];
 for(const example of examples){
  const selectedSources=[{...source,objectId:materialId,title:example.name,contentOrigin:example.origin,excerpt:example.body}];
  const dynamicBlocks=[...Array.from({length:example.count},(_,index)=>({id:"sample-finding-"+index,type:"text",title:example.name+" · 判断 "+(index+1),text:"这是隔离测试的第 "+(index+1)+" 条发现。根据这份资料选择要验证的具体问题，再用自己的证据判断是否适用。",provenance:"AI_INTERPRETATION",sourceRefs:["M1"],limitation:"隔离测试示例，非真实模型研究。"})),{id:"sources",type:"sources",title:"原始资料",provenance:"REAL_DATA",sourceRefs:["M1"],limitation:null,refs:selectedSources}];
  const rs=await db.researchSession.create({data:{workspaceId,createdById:userId,title:"隔离示例："+example.name,entryTemplate:"DIRECT",requestKey:randomUUID()}});
  const result=await db.researchRun.create({data:{workspaceId,sessionId:rs.id,requestedById:userId,question:"隔离示例："+example.name,version:1,requestKey:randomUUID(),requestHash:"fixture",status:"COMPLETED",stage:"COMPLETED",blocks:dynamicBlocks,sourceRefs:selectedSources,finishedAt:new Date(),inputScope:{materialIds:[materialId],benchmarkAccountIds:[],trendKeys:[],notes:"",useCreatorProfile:false,useOwnArtifacts:false}}});
  await page.setViewportSize({width:1600,height:1000});await go(page,"/research/results/run/"+result.id);
  await page.getByRole("heading",{name:example.count+" 条研究发现",exact:true}).waitFor();
  expect(await page.locator(".research-finding-card").count()).toBe(example.count);
  const original=page.getByRole("complementary",{name:"原始内容对照"});expect(await original.innerText()).toContain(example.body);
  const findingBox=await page.locator(".research-findings-column").boundingBox(),sourceBox=await original.boundingBox();
  expect(sourceBox!.x).toBeGreaterThan(findingBox!.x);expect(Math.abs(sourceBox!.y-findingBox!.y)).toBeLessThan(40);
  await page.screenshot({path:resolve(evidence,"reader-"+example.count+"-desktop.png"),fullPage:true});
  await page.waitForFunction(()=>document.querySelector('[data-testid="research-use-findings"]')?.getAttribute("data-ready")==="true");
  await page.getByRole("button",{name:"选这条用于创作",exact:true}).last().click();
  await page.getByRole("textbox",{name:"调整结论："+example.name+" · 判断 "+example.count,exact:true}).waitFor();
  expect(await page.locator(".research-finding-choice input:checked").count()).toBe(1);
  await page.getByRole("button",{name:"取消本次准备",exact:true}).click();
  expect(await db.artifact.count({where:{sourceResearchRunId:result.id}})).toBe(0);
  expect((await db.researchRun.findUniqueOrThrow({where:{id:result.id}})).blocks).toEqual(dynamicBlocks);
  await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:"domcontentloaded",timeout:90000});
  await page.getByRole("heading",{name:example.count+" 条研究发现",exact:true}).waitFor();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.screenshot({path:resolve(evidence,"reader-"+example.count+"-mobile.png"),fullPage:true});
 }
 checks.push("three-distinct-materials-dynamic-1-4-7-findings-nearby-originals-single-choice-cancel-no-share-desktop-mobile");
 await page.close();
},240000);
