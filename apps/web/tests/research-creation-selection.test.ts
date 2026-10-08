import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { db } from "@content-center/db";
import { getSelectedResearch, getResearchResult, researchCreationTarget } from "../server/research/read-model";
import { shareResearchRunToProject, buildResearchSharePreview } from "../server/research/sharing";
import { resolveContextReferences } from "../server/assistant/references";
import { getArtifactForUser } from "../server/artifacts/service";
const suffix=randomUUID(),owner="creation-owner-"+suffix,viewer="creation-viewer-"+suffix,editor="creation-editor-"+suffix,foreign="creation-foreign-"+suffix;
let workspaceId="",foreignWorkspace="",projectId="",otherProject="",foreignProject="",runId="",viewerRun="",sessionId="";
const source=(ref:string,kind:string,title:string,excerpt:string)=>({ref,kind,objectId:ref,title,href:null,capturedAt:null,publishedAt:null,eventAt:null,contentOrigin:"USER_PROVIDED",locator:null,excerpt,version:null});
const sources=[source("M1","MATERIAL","原始资料","原始可核对摘录"),source("P1","CREATOR_PROFILE","私人背景","不应自动附带的私人背景原文")];
const blocks=[{id:"finding",type:"text",title:"有用发现",text:"原始发现",provenance:"AI_INTERPRETATION",sourceRefs:["M1"],limitation:"单条资料"},
{id:"other",type:"text",title:"另一发现",text:"本次不选择的发现",provenance:"AI_INTERPRETATION",sourceRefs:["M1"],limitation:"需再确认"},
{id:"personal",type:"text",title:"个人判断",text:"个人待验证判断",provenance:"AI_INTERPRETATION",sourceRefs:["P1"],limitation:"私人背景不是外部证据"},
{id:"sources",type:"sources",title:"来源",provenance:"REAL_DATA",sourceRefs:["M1","P1"],limitation:null,refs:sources}];
const actor=()=>({workspaceId,userId:owner});
const select=(id="finding",text="由用户调整的发现")=>({kind:"run" as const,version:1,items:[{id,text}]});
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL!);if(url.port!=="55438"||process.env.ENVIRONMENT_ID!=="LOCAL_REVIEW")throw Error("REVIEW_ONLY");
 await db.user.createMany({data:[owner,viewer,editor,foreign].map(id=>({id,name:id,email:id+"@example.test"}))});
 workspaceId=(await db.workspace.create({data:{name:"选择结论隔离测试",slug:"creation-"+suffix,members:{create:[{userId:owner,role:"OWNER"},{userId:viewer,role:"VIEWER"},{userId:editor,role:"EDITOR"}]}}})).id;
 foreignWorkspace=(await db.workspace.create({data:{name:"Other",slug:"creation-foreign-"+suffix,members:{create:{userId:foreign,role:"OWNER"}}}})).id;
 projectId=(await db.contentProject.create({data:{workspaceId,createdById:owner,title:"创作项目"}})).id;
 otherProject=(await db.contentProject.create({data:{workspaceId,createdById:editor,title:"他人对话项目",assistantThreads:{create:{workspaceId,createdById:editor}}}})).id;
 foreignProject=(await db.contentProject.create({data:{workspaceId:foreignWorkspace,createdById:foreign,title:"另一空间项目"}})).id;
 sessionId=(await db.researchSession.create({data:{workspaceId,createdById:owner,title:"私人研究",entryTemplate:"DIRECT",requestKey:randomUUID()}})).id;
 runId=(await db.researchRun.create({data:{workspaceId,sessionId,requestedById:owner,question:"只选本次需要的结论",requestKey:randomUUID(),requestHash:"fixture",version:1,status:"COMPLETED",stage:"COMPLETED",inputScope:{materialIds:[],benchmarkAccountIds:[],trendKeys:[],notes:"",useCreatorProfile:false,useOwnArtifacts:false},blocks,sourceRefs:sources}})).id;
 const vs=await db.researchSession.create({data:{workspaceId,createdById:viewer,title:"只读成员已有私人研究",entryTemplate:"DIRECT",requestKey:randomUUID()}});
 viewerRun=(await db.researchRun.create({data:{workspaceId,sessionId:vs.id,requestedById:viewer,question:"只读成员已有结论",requestKey:randomUUID(),requestHash:"fixture",version:1,status:"COMPLETED",stage:"COMPLETED",inputScope:{materialIds:[],benchmarkAccountIds:[],trendKeys:[],notes:"",useCreatorProfile:false,useOwnArtifacts:false},blocks,sourceRefs:sources}})).id;
},30000);
afterAll(async()=>{await db.workspace.deleteMany({where:{id:{in:[workspaceId,foreignWorkspace].filter(Boolean)}}});await db.user.deleteMany({where:{id:{in:[owner,viewer,editor,foreign]}}});await db.$disconnect();},30000);
it("prepares selected edits without saving/sharing, and excludes unselected/private raw input",async()=>{
 const before=await db.researchRun.findUniqueOrThrow({where:{id:runId}});
 const selected=await getSelectedResearch(actor(),"run",runId,select());
 expect(selected.blocks.find(b=>b.type==="text")).toMatchObject({text:"由用户调整的发现"});
 const context=await resolveContextReferences({...actor(),projectId},[{sourceType:"RESEARCH",sourceId:runId,researchSelection:select()}]);
 expect(context.items[0]!.content).toContain("由用户调整的发现");expect(context.items[0]!.content).not.toMatch(/本次不选择|不应自动附带的私人背景原文/);
 expect(await db.artifact.count({where:{workspaceId}})).toBe(0);
 expect((await db.researchRun.findUniqueOrThrow({where:{id:runId}})).savedAt).toBeNull();
 expect(digest((await db.researchRun.findUniqueOrThrow({where:{id:runId}})).blocks)).toBe(digest(before.blocks));
});
it("rejects stale/forged/duplicate selections and other actors or workspaces",async()=>{
 await expect(getSelectedResearch(actor(),"run",runId,{...select(),version:2})).rejects.toMatchObject({code:"RESULT_CHANGED"});
 await expect(getSelectedResearch(actor(),"run",runId,select("not-a-block"))).rejects.toMatchObject({code:"INVALID_SELECTION"});
 await expect(getSelectedResearch(actor(),"run",runId,{...select(),items:[...select().items,...select().items]})).rejects.toThrow();
 await expect(getSelectedResearch({workspaceId,userId:editor},"run",runId,select())).rejects.toMatchObject({status:404});
 await expect(getSelectedResearch({workspaceId:foreignWorkspace,userId:foreign},"run",runId,select())).rejects.toMatchObject({status:404});
 await expect(resolveContextReferences({...actor(),projectId},[{sourceType:"ARTIFACT",sourceId:runId,researchSelection:select()}])).rejects.toMatchObject({code:"PERMISSION_DENIED"});
});
it("keeps thread ownership and project scope; a viewer may prepare own private context but cannot share",async()=>{
 expect((await researchCreationTarget(actor(),projectId)).conversationVisibility).toContain("仅你可见");
 await expect(researchCreationTarget(actor(),otherProject)).rejects.toMatchObject({status:403});
 await expect(researchCreationTarget(actor(),foreignProject)).rejects.toMatchObject({status:404});
 expect(await getSelectedResearch({workspaceId,userId:viewer},"run",viewerRun,select())).toMatchObject({version:1});
 await expect(shareResearchRunToProject({workspaceId,userId:viewer},viewerRun,projectId,select())).rejects.toMatchObject({status:403});
 expect(await db.assistantThread.count({where:{projectId}})).toBe(0);
});
it("shares only explicitly selected edited conclusions once and leaves original content intact",async()=>{
 const before=digest((await db.researchRun.findUniqueOrThrow({where:{id:runId}})).blocks);
 const [a,b]=await Promise.all([shareResearchRunToProject(actor(),runId,projectId,select()),shareResearchRunToProject(actor(),runId,projectId,select())]);
 expect(a.artifactId).toBe(b.artifactId);expect(await db.artifact.count({where:{projectId,sourceResearchRunId:runId}})).toBe(1);
 const readable=await getArtifactForUser({workspaceId,userId:viewer,projectId,artifactId:a.artifactId});
 expect(readable.content).toContain("由用户调整的发现");expect(readable.content).toContain("用户调整");expect(readable.content).not.toMatch(/本次不选择|不应自动附带/);
 expect(digest((await db.researchRun.findUniqueOrThrow({where:{id:runId}})).blocks)).toBe(before);
 await expect(getResearchResult({workspaceId,userId:viewer},runId)).rejects.toMatchObject({status:404});
 const retry=await shareResearchRunToProject(actor(),runId,projectId,select("finding","再次调整"));
 expect(retry.alreadyShared).toBe(true);expect(retry.content).not.toContain("再次调整");
},30000);
it("allows an explicit personal judgment share while excluding raw private background; old default preview remains restricted",async()=>{
 const selected=await getSelectedResearch(actor(),"run",runId,select("personal","我愿意分享的个人判断"));
 const preview=buildResearchSharePreview(selected.title,selected.blocks,{explicitSelection:true});
 expect(preview.body).toContain("我愿意分享的个人判断");expect(preview.body).toContain("没有可核验的外部来源");expect(preview.body).not.toContain("不应自动附带的私人背景原文");
 expect(buildResearchSharePreview(selected.title,selected.blocks).body).toBe("");
 const project=(await db.contentProject.create({data:{workspaceId,createdById:owner,title:"个人判断分享项目"}})).id;
 const saved=await shareResearchRunToProject(actor(),runId,project,select("personal","我愿意分享的个人判断"));
 expect((await getArtifactForUser({workspaceId,userId:viewer,projectId:project,artifactId:saved.artifactId})).content).toContain("我愿意分享的个人判断");
});
it("denies disabled member/workspace and archived targets without creating artifacts",async()=>{
 await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId:owner}},data:{disabledAt:new Date()}});
 await expect(getSelectedResearch(actor(),"run",runId,select())).rejects.toMatchObject({status:403});
 await db.workspaceMember.update({where:{workspaceId_userId:{workspaceId,userId:owner}},data:{disabledAt:null}});
 await db.workspace.update({where:{id:workspaceId},data:{disabledAt:new Date()}});
 await expect(researchCreationTarget(actor(),projectId)).rejects.toMatchObject({status:403});
 await db.workspace.update({where:{id:workspaceId},data:{disabledAt:null}});
 const archived=await db.contentProject.create({data:{workspaceId,createdById:owner,title:"已归档",status:"ARCHIVED"}});
 await expect(researchCreationTarget(actor(),archived.id)).rejects.toMatchObject({status:404});
 await expect(shareResearchRunToProject(actor(),runId,archived.id,select())).rejects.toMatchObject({status:404});
});
