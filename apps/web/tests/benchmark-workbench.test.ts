import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {db} from "@content-center/db";
import {benchmarkBaseline,parseBenchmarkHomepage,safeResearchReturn} from "../server/research/benchmark-workbench-math";
import {researchObjectAction} from "../server/research/preferences";
import {researchWorkInbox} from "../server/research/read-model";
import {benchmarkWorkbench} from "../server/research/benchmark-workbench";
import {importBenchmarkHomepage} from "../server/research/benchmark-import";
describe("Homepage and honest same-account baseline",()=>{
 it("recognizes only full allowed homepages without making URL requests",()=>{
 expect(parseBenchmarkHomepage("https://www.douyin.com/user/real_user?from=web")).toMatchObject({platform:"DOUYIN",externalId:"real_user"});
 expect(parseBenchmarkHomepage("https://www.xiaohongshu.com/user/profile/123")).toMatchObject({platform:"XIAOHONGSHU",externalId:"123"});
 for(const value of ["http://www.douyin.com/user/a","https://www.douyin.com.evil.test/user/a","https://x:y@www.douyin.com/user/a","https://www.douyin.com/video/123","https://v.douyin.com/a","https://127.0.0.1/user/a"])expect(()=>parseBenchmarkHomepage(value)).toThrow();
 });
 it("refuses insufficient, zero and invalid denominators",()=>{
 expect(benchmarkBaseline([1,2,3,4,null]).median).toBeNull();expect(benchmarkBaseline([0,0,0,0,0]).median).toBeNull();
 expect(benchmarkBaseline([1,2,3,4,50,null])).toMatchObject({median:3,samples:5});
 });
 it("preserves filters and anchors without allowing an external return",()=>{
 expect(safeResearchReturn("/research/works?days=3&view=read#work-abc")).toBe("/research/works?days=3&view=read#work-abc");
 for(const value of ["//evil.test","https://evil.test","/api/auth/sign-out","/research/works\\evil"])expect(safeResearchReturn(value)).toBe("/research/benchmarks#works");
 });
});
describe("Teacher purposes, read and dismissal remain independent",()=>{
 const suffix=randomUUID(),userId="teacher-"+suffix,outsiderId="outsider-"+suffix;let workspaceId="",accountId="",workId="";
 const actor=()=>({workspaceId,userId});
 beforeAll(async()=>{
 await db.user.createMany({data:[userId,outsiderId].map(id=>({id,name:id,email:id+"@example.test"}))});
 workspaceId=(await db.workspace.create({data:{name:"Teacher fixture",slug:suffix,members:{create:{userId,role:"OWNER"}}}})).id;
 accountId=(await db.benchmarkAccount.create({data:{workspaceId,createdById:userId,name:"Fixture teacher",platform:"DOUYIN",externalAccountId:suffix,originalUrl:"https://www.douyin.com/user/"+suffix}})).id;
 for(let i=0;i<6;i++){const work=await db.benchmarkContentSnapshot.create({data:{workspaceId,benchmarkAccountId:accountId,platform:"DOUYIN",externalId:suffix+"-"+i,title:"Real fixture "+i,url:"https://www.douyin.com/video/"+i,publishedAt:new Date(),metadata:{durationMs:12000},observations:{create:{metrics:{likes:[1,2,3,4,5,90][i],comments:null}}}}});if(i===0)workId=work.id;}
 });
 afterAll(async()=>{if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});await db.user.deleteMany({where:{id:{in:[userId,outsiderId]}}});await db.$disconnect();});
 it("changes purpose atomically without touching work/read, including duplicate homepage imports",async()=>{
 await researchObjectAction(actor(),{kind:"WORK",key:workId,action:"VIEW"});
 await researchObjectAction(actor(),{kind:"BENCHMARK_TEACHER",key:accountId,action:"FOLLOW"});
 const duplicate=await importBenchmarkHomepage(actor(),{url:"https://www.douyin.com/user/"+suffix,purpose:"reference"});expect(duplicate).toMatchObject({existing:true,item:{id:accountId},sync:"UNCHANGED"});
 const prefs=await db.researchObjectPreference.findMany({where:{...actor(),objectKey:accountId,followedAt:{not:null}}});expect(prefs.map(p=>p.kind)).toEqual(["BENCHMARK_REFERENCE"]);
 expect((await researchWorkInbox(actor(),{view:"read"})).items.some(w=>w.id===workId)).toBe(true);
 expect(await db.benchmarkContentSnapshot.count({where:{workspaceId}})).toBe(6);
 });
 it("metric refresh preserves read and ignore is reversible without deleting works",async()=>{
 await db.benchmarkContentSnapshot.update({where:{id:workId},data:{observedAt:new Date(Date.now()+10000)}});
 expect((await researchWorkInbox(actor(),{view:"read"})).items.some(w=>w.id===workId)).toBe(true);
 await researchObjectAction(actor(),{kind:"WORK_DISMISSED",key:workId,action:"FOLLOW"});
 expect((await researchWorkInbox(actor(),{view:"read"})).items.some(w=>w.id===workId)).toBe(false);
 expect((await researchWorkInbox(actor(),{view:"dismissed"})).items.find(w=>w.id===workId)?.read).toBe(true);
 await researchObjectAction(actor(),{kind:"WORK_DISMISSED",key:workId,action:"UNFOLLOW"});
 expect((await researchWorkInbox(actor(),{view:"read"})).items.some(w=>w.id===workId)).toBe(true);
 });
 it("computes the baseline within the same account and period and leaves missing metrics null",async()=>{
 const board=await benchmarkWorkbench(actor(),{period:"7",viral:"viral",threshold:"2.5"});
 expect(board.cards[0]?.baseline).toMatchObject({samples:6,median:3.5});expect(board.works).toHaveLength(1);expect(board.works[0]?.counts.comments).toBeNull();
 expect((await benchmarkWorkbench(actor(),{period:"7",accountId:"foreign"})).works).toEqual([]);
 });
 it("denies nonmembers, forged work keys, reports and disabled new integrations before any creation",async()=>{
 await expect(researchObjectAction({workspaceId,userId:outsiderId},{kind:"WORK_DISMISSED",key:workId,action:"FOLLOW"})).rejects.toMatchObject({status:403});
 await expect(researchObjectAction(actor(),{kind:"WORK_DISMISSED",key:"foreign",action:"FOLLOW"})).rejects.toMatchObject({status:404});
 await expect(researchObjectAction(actor(),{kind:"REPORT_ARCHIVED",key:"foreign",action:"FOLLOW"})).rejects.toMatchObject({status:404});
 await expect(importBenchmarkHomepage(actor(),{url:"https://www.douyin.com/user/never-create-"+suffix,purpose:"teacher"})).rejects.toMatchObject({code:"BENCHMARK_INTEGRATION_PENDING"});
 expect(await db.benchmarkAccount.count({where:{workspaceId}})).toBe(1);
 });
});

describe("Platform adapter contract without a live provider",()=>{
 it("uses returned identity and latest page, preserves the account on sync failure",async()=>{
 const providers=await import("@content-center/providers"),discovery=await import("../server/discovery/service");
 const offline=vi.spyOn(providers,"isLocalReviewOffline").mockReturnValue(false);
 const suffix=randomUUID(),userId="adapter-"+suffix;let workspaceId="";
 const detail=vi.spyOn(discovery,"getDiscoveryAccountDetail"),works=vi.spyOn(discovery,"getBenchmarkWorks");
 try {
 await db.user.create({data:{id:userId,name:"Adapter fixture",email:userId+"@example.test"}});
 workspaceId=(await db.workspace.create({data:{name:"Adapter fixture",slug:suffix,members:{create:{userId,role:"OWNER"}}}})).id;
 detail.mockResolvedValue({cached:false,items:[{externalId:suffix,platform:"DOUYIN",name:"Returned platform identity",avatarUrl:null,bio:null,followers:123,likes:null,originalUrl:"https://www.douyin.com/user/"+suffix,sourceProvider:"REDFOX"}]});
 works.mockRejectedValue(new Error("simulated upstream failure"));
 await expect(importBenchmarkHomepage({workspaceId,userId},{url:"https://www.douyin.com/user/MS4w-"+suffix,purpose:"teacher"})).rejects.toMatchObject({code:"ACCOUNT_IDENTITY_UNSUPPORTED",status:409});
 expect(detail).not.toHaveBeenCalled();expect(works).not.toHaveBeenCalled();expect(await db.benchmarkAccount.count({where:{workspaceId}})).toBe(0);
 const result=await importBenchmarkHomepage({workspaceId,userId},{url:"https://www.douyin.com/user/"+suffix,purpose:"teacher"});
 expect(result).toMatchObject({existing:false,sync:"FAILED",item:{name:"Returned platform identity"}});
 expect(works).toHaveBeenCalledWith(expect.objectContaining({benchmarkId:result.item.id,sort:"LATEST",offset:0}));
 expect(await db.benchmarkAccount.count({where:{workspaceId}})).toBe(1);
 const again=await importBenchmarkHomepage({workspaceId,userId},{url:"https://www.douyin.com/user/"+suffix,purpose:"reference"});
 expect(again.existing).toBe(true);expect(detail).toHaveBeenCalledTimes(1);expect(works).toHaveBeenCalledTimes(1);
 }finally{detail.mockRestore();works.mockRestore();offline.mockRestore();if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});await db.user.deleteMany({where:{id:userId}});await db.$disconnect();}
 });
});
