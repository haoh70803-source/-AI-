import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@content-center/db",()=>({ db: {} }));
import { releaseReadiness } from "../server/runtime/readiness";
afterEach(()=>vi.unstubAllEnvs());
function profile() {
  for(const [key,value] of Object.entries({INTEGRATION_ENCRYPTION_KEY:Buffer.alloc(32,42).toString("base64"),LOCAL_RELEASE_PROFILE:"review",ENVIRONMENT_ID:"LOCAL_REVIEW",DATABASE_URL:"postgresql://fixture@127.0.0.1:55438/content_center_12_review",STORAGE_DRIVER:"S3_COMPATIBLE",S3_ENDPOINT:"http://127.0.0.1:19020",FREE_WORKER_MODE:"false",EXTERNAL_CALLS_DISABLED:"true"}))vi.stubEnv(key,value);
}
it("missing release config fails without probing any dependency",async()=>{
  vi.stubEnv("LOCAL_RELEASE_PROFILE","");const database=vi.fn(),storage=vi.fn();
  expect(await releaseReadiness({database,storage})).toMatchObject({ready:false,checks:{configuration:false}});
  expect(database).not.toHaveBeenCalled();expect(storage).not.toHaveBeenCalled();
});
it.each(["database","storage"])("a failed %s dependency returns not ready, never a false 200",async broken=>{
  profile();const state=await releaseReadiness({database:async()=>broken!=="database",storage:async()=>broken!=="storage"});
  expect(state.ready).toBe(false);expect(state.checks[broken as "database"|"storage"]).toBe(false);
});
it("dependency exceptions become safe 503 state without secret error payloads",async()=>{
  profile();const state=await releaseReadiness({database:async()=>{throw Error("private-payload")},storage:async()=>true});
  expect(state.ready).toBe(false);expect(JSON.stringify(state)).not.toContain("private-payload");
});
it("healthy approved dependencies pass; disabled worker is explicit",async()=>{
  profile();const storage=vi.fn(async()=>true);expect(await releaseReadiness({database:async()=>true,storage})).toEqual({ready:true,checks:{configuration:true,database:true,storage:true},backgroundTasks:"disabled"});
  expect(storage).toHaveBeenCalledWith("http://127.0.0.1:19020");
});
it.each([{DATABASE_URL:"postgresql://fixture@127.0.0.1:55432/content_center"},{FREE_WORKER_MODE:"true"},{S3_ENDPOINT:"http://example.invalid"}])("invalid profile fails before dependency I/O",async change=>{
  profile();for(const [key,value] of Object.entries(change))vi.stubEnv(key,value);const database=vi.fn(),storage=vi.fn();
  expect((await releaseReadiness({database,storage})).ready).toBe(false);expect(database).not.toHaveBeenCalled();expect(storage).not.toHaveBeenCalled();
});

function dailyProfile() {
 profile(); for(const [key,value] of Object.entries({LOCAL_RELEASE_PROFILE:"daily",ENVIRONMENT_ID:"LOCAL_REAL",DATABASE_URL:"postgresql://fixture@127.0.0.1:55432/content_center",S3_ENDPOINT:"http://127.0.0.1:9000"}))vi.stubEnv(key,value);
}
it("live readiness accepts real calls only on the existing local deployment",async()=>{
 profile();vi.stubEnv("LOCAL_RELEASE_PROFILE","live");vi.stubEnv("ENVIRONMENT_ID","LOCAL_LIVE");vi.stubEnv("EXTERNAL_CALLS_DISABLED","false");vi.stubEnv("LOCAL_REVIEW_OFFLINE","false");vi.stubEnv("WORKER_MODE","embedded");vi.stubEnv("REDIS_URL","redis://127.0.0.1:16379/0");vi.stubEnv("QUEUE_PREFIX","content-center-12-material");
 expect(await releaseReadiness({database:async()=>true,storage:async()=>true,background:async()=>true})).toMatchObject({ready:true,externalCalls:"enabled",backgroundTasks:"enabled"});
 expect(await releaseReadiness({database:async()=>true,storage:async()=>true,background:async()=>false})).toMatchObject({ready:false,checks:{background:false},backgroundTasks:"unavailable"});
 vi.stubEnv("LOCAL_REVIEW_OFFLINE","true");const database=vi.fn(),storage=vi.fn();
 expect((await releaseReadiness({database,storage})).ready).toBe(false);expect(database).not.toHaveBeenCalled();expect(storage).not.toHaveBeenCalled();
});
it("healthy approved daily probes original dependencies without implying a production build",async()=>{
 dailyProfile(); const database=vi.fn(async()=>true),storage=vi.fn(async()=>true);
 expect(await releaseReadiness({database,storage})).toEqual({ready:true,checks:{configuration:true,database:true,storage:true},backgroundTasks:"disabled"});
 expect(database).toHaveBeenCalledOnce();expect(storage).toHaveBeenCalledWith("http://127.0.0.1:9000");
});
it.each([{LOCAL_RELEASE_PROFILE:""},{DATABASE_URL:"postgresql://fixture@127.0.0.1:55438/content_center_12_review"},{S3_ENDPOINT:"http://127.0.0.1:19020"},{EXTERNAL_CALLS_DISABLED:"false"}])("daily rejects missing marker or wrong dependency and safety scope before I/O",async change=>{
 dailyProfile();for(const [key,value]of Object.entries(change))vi.stubEnv(key,value);const database=vi.fn(),storage=vi.fn();
 expect((await releaseReadiness({database,storage})).checks.configuration).toBe(false);expect(database).not.toHaveBeenCalled();expect(storage).not.toHaveBeenCalled();
});
it.each(["database","storage"])("daily failed %s stays not ready",async broken=>{
 dailyProfile();const state=await releaseReadiness({database:async()=>broken!=="database",storage:async()=>broken!=="storage"});
 expect(state.ready).toBe(false);expect(state.checks.configuration).toBe(true);expect(state.checks[broken as "database"|"storage"]).toBe(false);
});

it.each(["", Buffer.alloc(32,42).toString("hex"), Buffer.alloc(16).toString("base64")])("invalid integration encryption key prevents false-ready response", async key => {
  profile(); vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", key);
  const database=vi.fn(async()=>true), storage=vi.fn(async()=>true);
  expect(await releaseReadiness({database,storage})).toMatchObject({ready:false,checks:{configuration:false}});
  expect(database).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
});
