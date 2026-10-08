import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({enqueue:vi.fn(),context:vi.fn()}));
vi.mock("@content-center/worker/queue-producer",()=>({enqueueContentIngest:mocks.enqueue}));
vi.mock("../server/api-access",()=>({getApiWorkspaceContext:mocks.context,apiError:(error:string,status:number,message?:string)=>new Response(JSON.stringify({error,message}),{status,headers:{"content-type":"application/json"}})}));
import { createSourceAndJob } from "../server/source-service";
import { POST as create } from "../app/api/source-items/route";
import { POST as retry } from "../app/api/ingest-jobs/[id]/retry/route";
import { POST as cancel } from "../app/api/ingest-jobs/[id]/cancel/route";

describe("durable source request and scoped retry/cancel HTTP contracts",()=>{
 let workspaceId="",userId="";
 beforeAll(async()=>{
  if(new URL(process.env.DATABASE_URL!).port!=="55436")throw Error("ISOLATED_REVIEW_REQUIRED");
  const user=await db.user.findFirst({where:{disabledAt:null},select:{id:true}});if(!user)throw Error("existing user required");userId=user.id;
  const id="architecture-b-request-"+randomUUID();
  workspaceId=(await db.workspace.create({data:{id,name:"B source request fixtures",slug:id,members:{create:{userId,role:"EDITOR"}}}})).id;
 });
 afterAll(async()=>{if(workspaceId)await db.workspace.delete({where:{id:workspaceId}});await db.$disconnect()});
 beforeEach(()=>{mocks.enqueue.mockReset().mockRejectedValue(new Error("simulated queue response loss"));mocks.context.mockReset().mockResolvedValue({session:{user:{id:userId}},workspace:{id:workspaceId},role:"EDITOR"})});
 const request=(key?:string,text="Repeatable B source request")=>new Request("http://localhost/api/source-items",{method:"POST",headers:{"content-type":"application/json",...(key?{"idempotency-key":key}:{})},body:JSON.stringify({kind:"TEXT",text})});
 async function seed(){return createSourceAndJob({workspaceId,userId,source:{kind:"TEXT",text:"B retry/cancel fixture"}},{enqueue:mocks.enqueue})}

 it("commits once across concurrent repeated submissions and rejects key reuse with changed content",async()=>{
  const key=randomUUID();const input={workspaceId,userId,clientRequestId:key,source:{kind:"TEXT" as const,text:"Repeatable B source request"}};
  const [a,b]=await Promise.all([createSourceAndJob(input,{enqueue:mocks.enqueue}),createSourceAndJob(input,{enqueue:mocks.enqueue})]);
  expect(a.ingestJob.id).toBe(b.ingestJob.id);
  expect(await db.auditLog.count({where:{workspaceId,resourceId:a.sourceItem.id,action:"source.created"}})).toBe(1);
  expect((await db.ingestJob.findUnique({where:{id:a.ingestJob.id}}))?.errorCode).toBe("DISPATCH_PENDING");
  await expect(createSourceAndJob({...input,source:{kind:"TEXT",text:"changed request"}},{enqueue:mocks.enqueue})).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
 });

 it("returns 202 for saved pending work and the same IDs on an HTTP replay",async()=>{
  const key=randomUUID();const a=await create(request(key)),b=await create(request(key));
  expect(a.status).toBe(202);expect(b.status).toBe(202);expect(await a.json()).toEqual(await b.json());
  expect((await create(request(key,"changed"))).status).toBe(409);
  expect((await create(request("invalid"))).status).toBe(400);
 });

 it("returns the original job for a URL request replay while preserving canonical URL duplicate rejection",async()=>{
  const key=randomUUID();const url="https://example.test/b-"+randomUUID();
  const req=(id:string)=>new Request("http://localhost/api/source-items",{method:"POST",headers:{"content-type":"application/json","idempotency-key":id},body:JSON.stringify({kind:"URL",url})});
  const a=await create(req(key)),b=await create(req(key));
  expect(a.status).toBe(202);expect(b.status).toBe(202);expect(await a.json()).toEqual(await b.json());
  expect((await create(req(randomUUID()))).status).toBe(409);
 });

 it("rejects anonymous and viewer submissions before creating a job",async()=>{
  const before=await db.ingestJob.count({where:{workspaceId}});
  mocks.context.mockResolvedValueOnce(null);expect((await create(request())).status).toBe(401);
  mocks.context.mockResolvedValueOnce({session:{user:{id:userId}},workspace:{id:workspaceId},role:"VIEWER"});expect((await create(request())).status).toBe(403);
  expect(await db.ingestJob.count({where:{workspaceId}})).toBe(before);
 });

 it("allows one scoped explicit retry generation and preserves intent if enqueue fails",async()=>{
  const f=await seed();await db.ingestJob.update({where:{id:f.ingestJob.id},data:{status:"FAILED"}});
  const route={params:Promise.resolve({id:f.ingestJob.id})};
  const responses=await Promise.all([retry(request(),route),retry(request(),route)]);
  expect(responses.map(r=>r.status).sort()).toEqual([202,409]);
  const job=await db.ingestJob.findUniqueOrThrow({where:{id:f.ingestJob.id}});
  expect(job.status).toBe("QUEUED");expect(job.errorCode).toBe("DISPATCH_PENDING");
  expect(job.metadata).toMatchObject({dispatchRevision:1});
  expect(mocks.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({jobId:job.id,workspaceId,dispatchRevision:1}),3);
  expect(await db.auditLog.count({where:{workspaceId,resourceId:job.id,action:"ingest.retried"}})).toBe(1);
 });

 it("rejects cross-workspace retry/cancel without changing the job",async()=>{
  const f=await seed();await db.ingestJob.update({where:{id:f.ingestJob.id},data:{status:"FAILED"}});
  mocks.context.mockResolvedValue({session:{user:{id:userId}},workspace:{id:"other-workspace"},role:"EDITOR"});
  const route={params:Promise.resolve({id:f.ingestJob.id})};
  expect((await retry(request(),route)).status).toBe(404);expect((await cancel(request(),route)).status).toBe(404);
  expect((await db.ingestJob.findUnique({where:{id:f.ingestJob.id}}))?.status).toBe("FAILED");
 });

 it("enforces authentication/role on cancellation and preserves source data",async()=>{
  const f=await seed(),route={params:Promise.resolve({id:f.ingestJob.id})};
  mocks.context.mockResolvedValueOnce(null);expect((await cancel(request(),route)).status).toBe(401);
  mocks.context.mockResolvedValueOnce({session:{user:{id:userId}},workspace:{id:workspaceId},role:"VIEWER"});expect((await cancel(request(),route)).status).toBe(403);
  expect((await cancel(request(),route)).status).toBe(200);
  expect((await db.ingestJob.findUnique({where:{id:f.ingestJob.id}}))?.status).toBe("CANCELLED");
  expect((await db.sourceItem.findUnique({where:{id:f.sourceItem.id}}))?.rawText).toBe("B retry/cancel fixture");
  expect((await cancel(request(),route)).status).toBe(409);
 });
});
