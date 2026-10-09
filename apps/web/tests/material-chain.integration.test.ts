import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const context = vi.hoisted(() => vi.fn());
vi.mock("@/server/api-access", () => ({ getApiWorkspaceContext: context, apiError: (error: string, status: number) => Response.json({error}, {status}) }));
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { getStorageProvider } from "@content-center/providers";
import { createSourceAndJob } from "../server/source-service";
import { getSourceWorkspaceModel } from "../server/material-detail/read-model";
import { POST as upload } from "../app/api/source-items/upload/route";
import { GET as processing } from "../app/api/source-items/[id]/processing/route";
import { createContentIngestWorker, createTranscribeSourceWorker } from "../../worker/src/queue";
import { requestSourceTranscription } from "../../worker/src/transcription";
import { attachDoubaoStreamFixture } from "../../../scripts/testing/doubao-stream-fixture";

const userId = "chain-" + randomUUID();
let workspaceId = "", directory = "", origin = "", fixture: Server | undefined;
let video = Buffer.alloc(0), cloudCalls = 0;
let streamingFixture: ReturnType<typeof attachDoubaoStreamFixture> | undefined, streamedAudio: Buffer | undefined;
const workers: Array<{ waitUntilReady(): Promise<void>; close(): Promise<void> }> = [];
const recognized = "今天我们来聊一聊，如何把零散素材整理成清晰、可靠的内容项目。";
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "material-chain-test-"));
  const path = join(directory, "speech.mp4");
  await promisify(execFile)(process.env.FFMPEG_PATH!, ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=160x120:r=15", "-i", resolve("services/local-asr/benchmark/audio/normal_zh.wav"), "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-y", path]);
  video = await readFile(path);
  fixture = createServer(async (request, response) => {
    if (request.url?.startsWith("/speech.mp4")) { response.writeHead(200, {"content-type":"video/mp4", "content-length":video.length}); response.end(video); return; }
    if (request.url === "/api/v3/auc/bigmodel/recognize/flash") {
      cloudCalls++; const chunks: Buffer[]=[]; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      expect(request.headers["x-api-key"]).toBe("isolated-chain-key");
      expect(Buffer.from(body.audio.data,"base64").length).toBeGreaterThan(0);
      response.writeHead(200, {"content-type":"application/json", "X-Api-Status-Code":"20000000"});
      response.end(JSON.stringify({audio_info:{duration:6528},result:{text:recognized,utterances:[{start_time:0,end_time:6528,text:recognized}]}})); return;
    }
    response.writeHead(404).end();
  });
  streamingFixture = attachDoubaoStreamFixture(fixture, { text: recognized, onComplete: input => { streamedAudio = input.audio; } });
  await new Promise<void>(done => fixture!.listen(0,"127.0.0.1",done));
  const address = fixture.address(); if (!address || typeof address === "string") throw Error("FIXTURE_BIND_FAILED");
  origin = `http://127.0.0.1:${address.port}`;
  process.env.PROVIDER_TEST_ORIGIN=origin; process.env.INGEST_TEST_FIXTURE_ORIGIN=origin;
  await db.user.create({data:{id:userId,email:userId+"@example.test",name:"链路测试"}});
  workspaceId=(await db.workspace.create({data:{name:"链路测试隔离空间",slug:userId,members:{create:{userId,role:"OWNER"}}}})).id;
  context.mockResolvedValue({workspace:{id:workspaceId},session:{user:{id:userId}},role:"OWNER"});
  await new IntegrationService().saveIntegrationConfig({workspaceId,userId,provider:"DOUBAO_ASR",config:{apiKey:"isolated-chain-key",baseUrl:origin}});
  workers.push(createContentIngestWorker(),createTranscribeSourceWorker());
  await Promise.all(workers.map(worker=>worker.waitUntilReady()));
},30000);
afterAll(async()=>{
  await Promise.all(workers.map(worker=>worker.close()));
  if(workspaceId){const assets=await db.sourceAsset.findMany({where:{workspaceId,storageKey:{not:null}}});for(const asset of assets)await getStorageProvider().delete(asset.storageKey!,{workspaceId,sourceItemId:asset.sourceItemId,assetId:asset.id});await db.workspace.delete({where:{id:workspaceId}});}
  await db.user.deleteMany({where:{id:userId}});await db.$disconnect();
  streamingFixture?.close();if(fixture)await new Promise<void>(done=>fixture!.close(()=>done()));
  delete process.env.PROVIDER_TEST_ORIGIN;delete process.env.INGEST_TEST_FIXTURE_ORIGIN;
  if(directory)await rm(directory,{recursive:true,force:true});
});
async function verify(sourceId:string){
  await expect.poll(async()=>Boolean(await db.transcript.findUnique({where:{sourceItemId:sourceId}})),{timeout:20000}).toBe(true);
  const model=await getSourceWorkspaceModel({workspaceId,userId,sourceItemId:sourceId,role:"OWNER"});
  expect(model?.detail.preview.playable).toBe(true);expect(model?.workspace.configured).toBe(true);
  expect(model?.workspace.busy).toBe(false);expect(model?.detail.transcript).toMatchObject({state:"COMPLETE",text:recognized});
  const snapshot=await processing(new Request("http://fixture/processing"),{params:Promise.resolve({id:sourceId})});
  expect(await snapshot.json()).toMatchObject({busy:false,sourceStatus:"READY",transcriptionStatus:"SUCCEEDED",hasTranscript:true});
  const assets=await db.sourceAsset.findMany({where:{workspaceId,sourceItemId:sourceId,status:"STORED"}});
  expect(assets.map(asset=>asset.assetType).sort()).toEqual(["AUDIO","VIDEO"]);
  const preview=await fetch(model!.detail.preview.mediaUrl!);expect(Buffer.from(await preview.arrayBuffer())).toEqual(video);
}
it("downloads a video link, automatically transcribes through both real queues, and updates the reading view",async()=>{
  const created=await createSourceAndJob({workspaceId,userId,source:{kind:"MEDIA_URL",url:origin+"/speech.mp4"},autoTranscribe:true});
  await verify(created.sourceItem.id);
  expect(await db.ingestJob.findUnique({where:{id:created.ingestJob.id}})).toMatchObject({status:"SUCCEEDED",provider:"DIRECT_MEDIA"});
  expect(cloudCalls).toBe(1);
},25000);
it("saves a local uploaded video before recognition, then transcribes and keeps the exact original bytes",async()=>{
  const form=new FormData();form.append("files",new File([new Uint8Array(video)],"上传测试.mp4",{type:"video/mp4"}));
  const response=await upload(new Request("http://fixture/upload",{method:"POST",body:form}));
  expect(response.status).toBe(202);const item=(await response.json()).results[0];expect(item.status).toBe("READY");
  expect(await db.ingestJob.count({where:{workspaceId,sourceItemId:item.sourceItemId}})).toBe(0);
  await requestSourceTranscription({workspaceId,sourceItemId:item.sourceItemId,requestedById:userId});
  await verify(item.sourceItemId);expect(cloudCalls).toBe(2);
},25000);

it("streams private extracted audio through the real worker and saves text and timestamps without public storage",async()=>{
  await new IntegrationService().saveIntegrationConfig({workspaceId,userId,provider:"DOUBAO_ASR",config:{baseUrl:origin,protocol:"STREAMING_2_0",resourceId:"volc.seedasr.sauc.duration"}});
  const created=await createSourceAndJob({workspaceId,userId,source:{kind:"MEDIA_URL",url:origin+"/speech.mp4?stream=1"},autoTranscribe:true});
  await verify(created.sourceItem.id);
  const transcript=await db.transcript.findUniqueOrThrow({where:{sourceItemId:created.sourceItem.id}});
  expect(transcript.segments).toEqual([{startMs:0,endMs:1000,text:recognized}]);
  const usage=await db.apiUsage.findFirst({where:{workspaceId,operation:"TRANSCRIBE_STREAMING_2_0",success:true}});expect(usage).not.toBeNull();
  const audio=await db.sourceAsset.findFirstOrThrow({where:{workspaceId,sourceItemId:created.sourceItem.id,assetType:"AUDIO",status:"STORED"}});
  const url=(await getStorageProvider().getSignedUrl(audio.storageKey!,60,{assetScope:{workspaceId,sourceItemId:created.sourceItem.id,assetId:audio.id}})).data.url;
  expect(streamedAudio).toEqual(Buffer.from(await (await fetch(url)).arrayBuffer()));
  expect(cloudCalls).toBe(2);
},25000);

it("normalizes an original WAV upload for streaming while preserving the saved original",async()=>{
  const wav=await readFile(resolve("services/local-asr/benchmark/audio/normal_zh.wav"));
  const form=new FormData();form.append("files",new File([new Uint8Array(wav)],"原始录音.wav",{type:"audio/wav"}));
  const response=await upload(new Request("http://fixture/upload",{method:"POST",body:form}));expect(response.status).toBe(202);
  const item=(await response.json()).results[0];expect(item.status).toBe("READY");
  await requestSourceTranscription({workspaceId,sourceItemId:item.sourceItemId,requestedById:userId});
  await expect.poll(async()=>Boolean(await db.transcript.findUnique({where:{sourceItemId:item.sourceItemId}})),{timeout:20000}).toBe(true);
  const model=await getSourceWorkspaceModel({workspaceId,userId,sourceItemId:item.sourceItemId,role:"OWNER"});
  expect(model?.detail.transcript).toMatchObject({state:"COMPLETE",text:recognized});expect(model?.workspace.busy).toBe(false);
  expect(Buffer.from(await(await fetch(model!.detail.preview.mediaUrl!)).arrayBuffer())).toEqual(wav);
  expect(streamedAudio?.length).toBeGreaterThan(0);expect(streamedAudio).not.toEqual(wav);
},25000);

it("finishes with an actionable error when recording-file recognition cannot reach private storage, retaining the saved video",async()=>{
  await new IntegrationService().saveIntegrationConfig({workspaceId,userId,provider:"DOUBAO_ASR",config:{baseUrl:origin,protocol:"RECORDING_FILE_2_0",resourceId:"volc.seedasr.auc"}});
  const created=await createSourceAndJob({workspaceId,userId,source:{kind:"MEDIA_URL",url:origin+"/speech.mp4?blocked=1"},autoTranscribe:true});
  await expect.poll(async()=> (await db.ingestJob.findFirst({where:{workspaceId,sourceItemId:created.sourceItem.id,jobType:"TRANSCRIBE"}}))?.status,{timeout:20000}).toBe("FAILED");
  const snapshot=await processing(new Request("http://fixture/processing"),{params:Promise.resolve({id:created.sourceItem.id})});
  expect(await snapshot.json()).toMatchObject({busy:false,sourceStatus:"READY",transcriptionStatus:"FAILED",hasTranscript:false,transcription:{errorMessage:expect.stringContaining("公网")}});
  expect(await db.ingestJob.findFirst({where:{workspaceId,sourceItemId:created.sourceItem.id,jobType:"TRANSCRIBE"}})).toMatchObject({errorCode:"ASR_AUDIO_NOT_PUBLICLY_REACHABLE"});
  const model=await getSourceWorkspaceModel({workspaceId,userId,sourceItemId:created.sourceItem.id,role:"OWNER"});
  expect(model?.detail.preview.playable).toBe(true);expect(model?.workspace.configured).toBe(true);
  const preview=await fetch(model!.detail.preview.mediaUrl!);expect(Buffer.from(await preview.arrayBuffer())).toEqual(video);
  expect(cloudCalls).toBe(2);
},25000);
