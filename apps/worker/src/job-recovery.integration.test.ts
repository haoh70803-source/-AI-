import { requestMaterialAnalysisJob } from "./material-analysis-request";
import { createTranscribeSourceQueue, TRANSCRIBE_SOURCE } from "./transcription-queue";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "@content-center/db";
import { ManualTextSourceProvider, IngestProviderError } from "@content-center/providers";
import { Job } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContentIngestQueue, deliveryKey, CONTENT_INGEST, ANALYZE_MATERIAL, DISTILL_MATERIAL, type ContentIngestPayload } from "./queue-producer";
import { createContentIngestWorker } from "./queue";
import { cancelIngestJob, reconcileJobs, withIngestExecution, markDispatchPending, recordTerminalQueueFailure } from "./job-recovery";
import { configuredWorkerMode, acquireWorkerMode } from "./worker-mode";
import { queuePrefix } from "./redis-connection";
import { processContentIngestJob } from "./ingest";

describe("durable task recovery (isolated review DB and dedicated Redis only)",()=>{
  let workspaceId="", userId="";
  const children: ChildProcess[]=[];
  const fakeJob=(data:ContentIngestPayload)=>({data,attemptsMade:0} as Job<ContentIngestPayload>);
  async function make(provider="MANUAL") {
    const source=await db.sourceItem.create({data:{workspaceId,createdById:userId,sourceType:"TEXT",sourcePlatform:"GENERIC",rawText:"B isolated deterministic source",status:"PENDING"}});
    const job=await db.ingestJob.create({data:{workspaceId,sourceItemId:source.id,requestedById:userId,jobType:"EXTRACT_TEXT",provider,providerMode:"REAL",status:"QUEUED",maxAttempts:3}});
    return {job,source,payload:{jobId:job.id,workspaceId,sourceItemId:source.id,requestedById:userId}};
  }
  async function waitFor(check:()=>Promise<boolean>) { for(let i=0;i<100;i++){if(await check())return;await delay(100)}throw Error("fixture timeout"); }
  async function killFixture(argument:string, marker:string) {
    const child=spawn(process.execPath,["--import",pathToFileURL(path.resolve("node_modules/tsx/dist/loader.mjs")).href,path.resolve("apps/worker/src/test-fixtures/recovery-process.ts"),argument],{env:process.env,stdio:["ignore","pipe","pipe"]});
    children.push(child);let output="";
    child.stdout!.on("data",b=>{output+=b});child.stderr!.on("data",b=>{output+=b});
    await waitFor(async()=>{if(child.exitCode!==null)throw Error("fixture exited before marker: "+output);return output.includes(marker)});
    const closed=new Promise<void>(resolve=>child.once("close",()=>resolve()));
    child.kill("SIGKILL");await closed;
  }
  beforeAll(async()=>{
    if(new URL(process.env.DATABASE_URL!).port!=="55436" || new URL(process.env.REDIS_URL!).port!=="56381" || !queuePrefix().startsWith("architecture-b-"))throw Error("ISOLATED_FIXTURE_REQUIRED");
    const queue=createContentIngestQueue();await queue.obliterate({force:true});await queue.close();
    const user=await db.user.findFirst({where:{disabledAt:null},select:{id:true}});
    if(!user)throw Error("Existing review user required; no credentials created");
    userId=user.id;
    const id="architecture-b-"+randomUUID();
    workspaceId=(await db.workspace.create({data:{id,name:"B disposable recovery fixtures",slug:id,members:{create:{userId,role:"EDITOR"}}}})).id;
  });
  afterAll(async()=>{
    for(const child of children)if(child.exitCode===null)child.kill("SIGKILL");
    if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});
    const queue=createContentIngestQueue();await queue.obliterate({force:true});await queue.close();await db.$disconnect();
  });

  it("recovers DB commit without enqueue, and an accepted enqueue with a lost response only once",async()=>{
    const f=await make();
    const first=await reconcileJobs({workspaceId,minimumAgeMs:0});
    expect(first).toContainEqual({jobId:f.job.id,status:"dispatched"});
    await markDispatchPending(f.job.id,workspaceId); // accepted by Redis, response lost
    await Promise.all([reconcileJobs({workspaceId,minimumAgeMs:0}),reconcileJobs({workspaceId,minimumAgeMs:0})]);
    const q=createContentIngestQueue();
    try {expect(await q.getWaitingCount()).toBe(1);expect(((await q.getJob(deliveryKey(CONTENT_INGEST,f.payload)))?.data as ContentIngestPayload)?.jobId).toBe(f.job.id);}
    finally{await q.close();}
  });

  it("keeps the durable intent when the queue is unreachable",async()=>{
    const f=await make();const redis=process.env.REDIS_URL;process.env.REDIS_URL="redis://127.0.0.1:56382";
    try {
      expect(await reconcileJobs({workspaceId,minimumAgeMs:0,limit:100})).toContainEqual({jobId:f.job.id,status:"pending"});
      expect(await db.ingestJob.findUnique({where:{id:f.job.id},select:{status:true,errorCode:true}})).toEqual({status:"QUEUED",errorCode:"DISPATCH_PENDING"});
    }finally{process.env.REDIS_URL=redis;}
  },15000);

  it("runs two consumers and retains exactly one success audit per business task",async()=>{
    const a=createContentIngestWorker(),b=createContentIngestWorker();
    try {
      await Promise.all([a.waitUntilReady(),b.waitUntilReady()]);
      await reconcileJobs({workspaceId,minimumAgeMs:0});
      await waitFor(async()=>await db.ingestJob.count({where:{workspaceId,status:{in:["QUEUED","RUNNING"]}}})===0);
      const jobs=await db.ingestJob.findMany({where:{workspaceId}});
      expect(jobs.every(j=>j.status==="SUCCEEDED")).toBe(true);
      for(const j of jobs)expect(await db.auditLog.count({where:{workspaceId,resourceId:j.id,action:"ingest.succeeded"}})).toBe(1);
    }finally{await Promise.all([a.close(),b.close()]);}
  },15000);

  it("deduplicates concurrent deliveries and a replay after result/usage commit",async()=>{
    const f=await make("LLM");let calls=0,release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>entered=resolve);
    const execute=async()=>{
      calls++;await db.ingestJob.update({where:{id:f.job.id},data:{status:"RUNNING"}});entered();await gate;
      await db.$transaction([db.apiUsage.create({data:{workspaceId,userId,provider:"B_MOCK",operation:"B_TEST",requestId:f.job.id,success:true,units:0}}),db.ingestJob.update({where:{id:f.job.id},data:{status:"SUCCEEDED",finishedAt:new Date()}})]);
      return {status:"ok"};
    };
    const first=withIngestExecution(fakeJob(f.payload),execute);await started;
    expect(await withIngestExecution(fakeJob(f.payload),execute)).toEqual({status:"already-running"});
    release();await first;
    expect(await withIngestExecution(fakeJob(f.payload),execute)).toEqual({status:"already-succeeded"});
    expect(calls).toBe(1);expect(await db.apiUsage.count({where:{workspaceId,requestId:f.job.id}})).toBe(1);
  });


  it("keeps material analysis active after enqueue loss and reuses the same analysis",async()=>{
    const f=await make();await db.sourceItem.update({where:{id:f.source.id},data:{status:"READY"}});
    await cancelIngestJob(f.payload);
    const queued=await requestMaterialAnalysisJob({workspaceId,sourceItemId:f.source.id,requestedById:userId},{enqueue:async()=>{throw Error("queue unavailable")}});
    expect((await db.ingestJob.findUnique({where:{id:queued.job!.id}}))?.status).toBe("QUEUED");
    const same=await requestMaterialAnalysisJob({workspaceId,sourceItemId:f.source.id,requestedById:userId});
    expect(same.analysis.id).toBe(queued.analysis.id);expect(same.created).toBe(false);
    await cancelIngestJob({jobId:queued.job!.id,workspaceId,sourceItemId:f.source.id,requestedById:userId});
    expect((await db.materialAnalysis.findUnique({where:{id:queued.analysis.id}}))?.status).toBe("FAILED");
  });

  it("restores transcription media identity and dispatches each persisted job type to its own processor",async()=>{
    const f=await make();
    await db.ingestJob.update({where:{id:f.job.id},data:{jobType:"TRANSCRIBE",metadata:{mediaAssetId:"isolated-media-id"}}});
    expect(await reconcileJobs({workspaceId,minimumAgeMs:0})).toContainEqual({jobId:f.job.id,status:"dispatched"});
    const queue=createTranscribeSourceQueue();
    try{expect((await queue.getJob(deliveryKey(TRANSCRIBE_SOURCE,f.payload)))?.data.mediaAssetId).toBe("isolated-media-id");await queue.obliterate({force:true});}
    finally{await queue.close();}
    await cancelIngestJob(f.payload);
    for(const [type,name] of [["ANALYZE_MATERIAL",ANALYZE_MATERIAL],["DISTILL_MATERIAL",DISTILL_MATERIAL]] as const){
      const g=await make();await db.ingestJob.update({where:{id:g.job.id},data:{jobType:type}});
      await reconcileJobs({workspaceId,minimumAgeMs:0});
      const content=createContentIngestQueue();
      try{expect((await content.getJob(deliveryKey(name,g.payload)))?.name).toBe(name);}
      finally{await content.close();}
      await cancelIngestJob(g.payload);
    }
  });

  it("does not write victim or newer retry state from an invalid terminal queue message",async()=>{
    const f=await make();
    const terminal={...fakeJob({...f.payload,requestedById:"wrong-user"}),name:CONTENT_INGEST,attemptsMade:1,opts:{attempts:1}} as Job<ContentIngestPayload>;
    await recordTerminalQueueFailure(terminal,new Error("unrecoverable scope mismatch"));
    expect((await db.ingestJob.findUnique({where:{id:f.job.id}}))?.status).toBe("QUEUED");
    await db.ingestJob.update({where:{id:f.job.id},data:{metadata:{dispatchRevision:1}}});
    await recordTerminalQueueFailure({...terminal,data:f.payload} as Job<ContentIngestPayload>,new Error("unrecoverable old delivery"));
    expect((await db.ingestJob.findUnique({where:{id:f.job.id}}))?.status).toBe("QUEUED");
    await cancelIngestJob(f.payload);
  });

  it("defers archived-task recovery while execution is active, then cancels without deleting source data",async()=>{
    const f=await make("LLM");let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
    const running=withIngestExecution(fakeJob(f.payload),async()=>{await db.ingestJob.update({where:{id:f.job.id},data:{status:"RUNNING"}});entered();await gate;return true});
    await started;await db.sourceItem.update({where:{id:f.source.id},data:{status:"ARCHIVED"}});
    expect(await reconcileJobs({workspaceId,minimumAgeMs:0})).toContainEqual({jobId:f.job.id,status:"archive-awaiting-active-execution"});
    expect((await db.ingestJob.findUnique({where:{id:f.job.id}}))?.status).toBe("RUNNING");
    release();await running;
    expect(await reconcileJobs({workspaceId,minimumAgeMs:0})).toContainEqual({jobId:f.job.id,status:"cancelled"});
    expect((await db.sourceItem.findUnique({where:{id:f.source.id}}))?.rawText).toBe("B isolated deterministic source");
  });

  it("permits parallel execution of different business IDs",async()=>{
    const a=await make(),b=await make();let active=0,peak=0;
    const execute=async()=>{active++;peak=Math.max(peak,active);await delay(100);active--;return true;};
    await Promise.all([withIngestExecution(fakeJob(a.payload),execute),withIngestExecution(fakeJob(b.payload),execute)]);
    expect(peak).toBe(2);
    await cancelIngestJob(a.payload);await cancelIngestJob(b.payload);
  });

  it("rejects cross-workspace payloads before any external or business effect",async()=>{
    const f=await make();let called=false;
    await expect(withIngestExecution(fakeJob({...f.payload,workspaceId:"other-workspace"}),async()=>{called=true})).rejects.toThrow("scope mismatch");
    expect(called).toBe(false);
    expect(await cancelIngestJob({...f.payload,workspaceId:"other-workspace"})).toEqual({status:"not-found"});
    await cancelIngestJob(f.payload);
  });

  it("rejects a disabled workspace or revoked membership before provider execution",async()=>{
    const f=await make();let calls=0;
    await db.workspace.update({where:{id:workspaceId},data:{disabledAt:new Date()}});
    try{expect(await withIngestExecution(fakeJob(f.payload),async()=>{calls++})).toEqual({status:"authorization-revoked"});}
    finally{await db.workspace.update({where:{id:workspaceId},data:{disabledAt:null}});}
    expect(calls).toBe(0);
    const g=await make();await db.workspaceMember.deleteMany({where:{workspaceId,userId}});
    try{expect(await withIngestExecution(fakeJob(g.payload),async()=>{calls++})).toEqual({status:"authorization-revoked"});}
    finally{await db.workspaceMember.create({data:{workspaceId,userId,role:"EDITOR"}});}
    expect(calls).toBe(0);
  });

  it("cancels queued work and rejects stale generation deliveries after explicit retry",async()=>{
    const f=await make();await cancelIngestJob(f.payload);
    expect(await withIngestExecution(fakeJob(f.payload),async()=>{throw Error("should not execute")})).toEqual({status:"cancelled"});
    // Simulate the already-authorized retry route's new persisted generation.
    await db.ingestJob.update({where:{id:f.job.id},data:{status:"QUEUED",attempt:0,metadata:{dispatchRevision:1}}});
    expect(await withIngestExecution(fakeJob(f.payload),async()=>true)).toEqual({status:"obsolete-delivery"});
    const newer={...f.payload,dispatchRevision:1};
    expect(deliveryKey(CONTENT_INGEST,newer)).not.toBe(deliveryKey(CONTENT_INGEST,f.payload));
    await withIngestExecution(fakeJob(newer),()=>processContentIngestJob(fakeJob(newer)));
    expect((await db.ingestJob.findUnique({where:{id:f.job.id}}))?.status).toBe("SUCCEEDED");
  });

  it("preserves cancellation when a running local provider later returns",async()=>{
    const f=await make();let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>entered=resolve);
    const provider=new ManualTextSourceProvider();
    const original=provider.ingest.bind(provider);
    provider.ingest=async input=>{entered();await gate;return original({...input,value:"late changed result"});};
    const processing=withIngestExecution(fakeJob(f.payload),()=>processContentIngestJob(fakeJob(f.payload),{provider}));
    await started;expect(await cancelIngestJob(f.payload)).toEqual({status:"cancelled"});release();await processing;
    expect((await db.ingestJob.findUnique({where:{id:f.job.id}}))?.status).toBe("CANCELLED");
    expect((await db.sourceItem.findUnique({where:{id:f.source.id}}))?.rawText).toBe("B isolated deterministic source");
    expect(await db.auditLog.count({where:{workspaceId,resourceId:f.job.id,action:"ingest.succeeded"}})).toBe(0);
  });

  it("does not overwrite cancellation when the provider subsequently errors",async()=>{
    const f=await make();let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>entered=resolve);
    const provider=new ManualTextSourceProvider();
    provider.ingest=async()=>{entered();await gate;throw new IngestProviderError("TRANSIENT","fixture",true)};
    const processing=withIngestExecution(fakeJob(f.payload),()=>processContentIngestJob(fakeJob(f.payload),{provider}));
    await started;await cancelIngestJob(f.payload);release();await processing;
    expect((await db.ingestJob.findUnique({where:{id:f.job.id}}))?.status).toBe("CANCELLED");
  });

  it("pages bounded reconciliation so old waiting jobs cannot starve later durable intents",async()=>{
    const fixtures=[await make(),await make(),await make()];
    const observed=new Set<string>();let afterJobId:string|undefined;
    for(let i=0;i<10;i++){const page=await reconcileJobs({workspaceId,minimumAgeMs:0,limit:1,afterJobId});if(!page.length)break;observed.add(page[0]!.jobId);afterJobId=page[0]!.jobId;}
    for(const f of fixtures){expect(observed.has(f.job.id)).toBe(true);await cancelIngestJob(f.payload);}
  });

  it("recovers a killed local processor after restart without losing the job",async()=>{
    const f=await make();await killFixture(JSON.stringify(f.payload),"FIXTURE_PROVIDER_PHASE");
    const first=await reconcileJobs({workspaceId,minimumAgeMs:0});
    expect(first).toContainEqual({jobId:f.job.id,status:"dispatched"});
    const worker=createContentIngestWorker();
    try{await worker.waitUntilReady();await waitFor(async()=>(await db.ingestJob.findUnique({where:{id:f.job.id}}))?.status==="SUCCEEDED");}
    finally{await worker.close();}
    expect((await db.ingestJob.findUnique({where:{id:f.job.id}}))?.attempt).toBe(2);
  },15000);

  it("never automatically repeats an external call with unknown result after process kill",async()=>{
    const f=await make("LLM");await killFixture(JSON.stringify(f.payload),"FIXTURE_PROVIDER_PHASE");
    let calls=0;
    expect(await withIngestExecution(fakeJob(f.payload),async()=>{calls++;return true})).toEqual({status:"recovery-review-required"});
    expect(calls).toBe(0);
    expect((await db.ingestJob.findUnique({where:{id:f.job.id}}))?.errorCode).toBe("RECOVERY_REVIEW_REQUIRED");
  },15000);

  it("refuses cancellation of an external task while its execution lock is held",async()=>{
    const f=await make("LLM");let release!:()=>void,entered!:()=>void;
    const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
    const running=withIngestExecution(fakeJob(f.payload),async()=>{entered();await gate;return true});
    await started;expect(await cancelIngestJob(f.payload)).toEqual({status:"external-in-flight"});
    release();await running;await cancelIngestJob(f.payload);
  });

  it("allows same-mode multiple workers while rejecting independent/embedded overlap",async()=>{
    process.env.WORKER_MODE="independent";
    const a=await acquireWorkerMode("independent",()=>{}),b=await acquireWorkerMode("independent",()=>{});
    try {
      expect(a.member).not.toBe(b.member);
      process.env.WORKER_MODE="embedded";
      await expect(acquireWorkerMode("embedded",()=>{})).rejects.toThrow("WORKER_MODE_ALREADY_ACTIVE");
    }finally{process.env.WORKER_MODE="independent";await Promise.all([a.close(),b.close()]);}
  });

  it("permits the other mode after a dead worker's lease expires",async()=>{
    await killFixture("mode","FIXTURE_MODE_READY");await delay(1200);
    process.env.WORKER_MODE="embedded";
    try{const lease=await acquireWorkerMode("embedded",()=>{},1000);await lease.close();}
    finally{process.env.WORKER_MODE="independent";}
  },15000);
});

describe("explicit worker configuration",()=>{
  it("defaults disabled and preserves explicit legacy embedded compatibility",()=>{
    expect(configuredWorkerMode({})).toBe("disabled");
    expect(configuredWorkerMode({FREE_WORKER_MODE:"true"})).toBe("embedded");
    expect(configuredWorkerMode({WORKER_MODE:"independent"})).toBe("independent");
    expect(()=>configuredWorkerMode({WORKER_MODE:"anything"})).toThrow("INVALID_WORKER_MODE");
    expect(()=>configuredWorkerMode({WORKER_MODE:"independent",FREE_WORKER_MODE:"true"})).toThrow("CONFLICT");
  });
});
