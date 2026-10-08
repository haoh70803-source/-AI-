import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";
import { buildEnvironment, runtimeEnvironment, releaseId } from "./local-release-profile.mjs";
const review = { DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:55438/content_center_12_review", APP_URL:"http://localhost:3022", STORAGE_DRIVER:"S3_COMPATIBLE", S3_ENDPOINT:"http://127.0.0.1:19020", REDIS_URL:"redis://127.0.0.1:1/0", ENVIRONMENT_ID:"LOCAL_REVIEW", AUTH_COOKIE_PREFIX:"content-center-12-review", LOCAL_REVIEW_OFFLINE:"true", FREE_WORKER_MODE:"false", AUTH_SECRET:"isolated-test-only-not-a-real-credential", INTEGRATION_ENCRYPTION_KEY:"isolated-fixture", S3_ACCESS_KEY_ID:"isolated-fixture", S3_SECRET_ACCESS_KEY:"isolated-fixture", S3_BUCKET:"fixture" };
test("offline build cannot inherit application secrets, node injection or active worker mode",()=> {
  const env=buildEnvironment({PATH:"fixture",DATABASE_URL:"postgresql://formal",AUTH_SECRET:"must-not-copy",NODE_OPTIONS:"--require unwanted.cjs",FREE_WORKER_MODE:"true",WORKER_MODE:"embedded",EXA_API_KEY:"must-not-copy"},"C:/fixture guard.cjs","fixture-log");
  assert.equal(env.ENVIRONMENT_ID,"LOCAL_BUILD");assert.equal(new URL(env.DATABASE_URL).port,"1");
  assert.equal(env.INTEGRATION_ENCRYPTION_KEY,undefined);assert.equal(env.AUTH_SECRET.includes("must-not-copy"),false);assert.equal(env.EXA_API_KEY,undefined);
  assert.equal(env.WORKER_MODE,"disabled");assert.equal(env.FREE_WORKER_MODE,"false");assert.equal(env.EXTERNAL_CALLS_DISABLED,"true");assert.equal(env.NODE_OPTIONS.includes("unwanted"),false);
});
test("review production uses same isolated DB but a distinct port and cookie",()=>{
  const env=runtimeEnvironment("review",review,{EXA_API_KEY:"must-not-inherit"});
  assert.equal(env.APP_URL,"http://localhost:3032");assert.equal(env.AUTH_COOKIE_PREFIX,"content-center-12-release");assert.equal(env.DATABASE_URL,review.DATABASE_URL);
  assert.equal(env.NODE_ENV,"production");assert.equal(env.FREE_WORKER_MODE,"false");assert.equal(env.EXA_API_KEY,undefined);
});
test("missing config and build sentinels fail before starting any process",()=>{
  assert.throws(()=>runtimeEnvironment("review",{...review,AUTH_SECRET:""},{}),/EXISTING_CONFIGURATION/);
  assert.throws(()=>runtimeEnvironment("review",{...review,AUTH_SECRET:"BUILD_ONLY"},{}),/EXISTING_CONFIGURATION/);
  assert.throws(()=>runtimeEnvironment("unknown",review,{}),/PROFILE_REQUIRED/);
});
test("review cannot use formal, old integration, remote or unknown database",()=>{
  for(const url of ["postgresql://fixture@127.0.0.1:55432/content_center","postgresql://fixture@127.0.0.1:55435/content_center_agent_test_integration","postgresql://fixture@remote:55438/content_center_12_review","postgresql://fixture@127.0.0.1:55438/unknown"])
    assert.throws(()=>runtimeEnvironment("review",{...review,DATABASE_URL:url},{}),/DATABASE_MISMATCH/);
});
test("worker, storage and cookie configuration cannot silently fall back",()=>{
  for(const change of [{FREE_WORKER_MODE:"true"},{S3_ENDPOINT:"http://127.0.0.1:9000"},{AUTH_COOKIE_PREFIX:"daily"}])assert.throws(()=>runtimeEnvironment("review",{...review,...change},{}));
});
test("artifact IDs cannot escape the release root",()=>{
  for(const id of ["../original",".next","release-20261005Z-../secret",undefined])assert.throws(()=>releaseId(id));
  assert.equal(releaseId("release-20261005T000000Z-abcdef12"),"release-20261005T000000Z-abcdef12");
});
test("real CLI rejects missing artifacts; legacy real startup protection remains",()=>{
  const missing=spawnSync(process.execPath,["scripts/local-release.mjs","check","review","release-20261005T000000Z-abcdef12"],{encoding:"utf8"});
  assert.notEqual(missing.status,0);assert.match(missing.stderr,/ARTIFACT_NOT_FOUND/);
  const legacy=spawnSync(process.execPath,["scripts/runtime-env.mjs","LOCAL_REAL","not-loaded","ignored"],{encoding:"utf8"});
  assert.equal(legacy.status,2);assert.match(legacy.stderr,/LEGACY_DAILY_ENTRY_BLOCKED/);
});
test("build preload blocks HTTP, fetch and TCP without making requests",()=>{
  for(const code of ["require('node:http').get('http://example.invalid')","fetch('https://example.invalid').catch(e=>{throw e})","require('node:net').connect(55432,'127.0.0.1')"]){
    const result=spawnSync(process.execPath,["--import","./scripts/release-build-network.mjs","-e",code],{encoding:"utf8"});
    assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_BUILD_NETWORK_DENIED/);
  }
});

test("actual absolute preload URL works on Windows and remains network-blocked",()=>{
  const env=buildEnvironment(process.env,process.cwd()+"/scripts/release-build-network.mjs","");
  const result=spawnSync(process.execPath,["-e","require(\"node:http\").get(\"http://example.invalid\")"],{env,encoding:"utf8"});
  assert.notEqual(result.status,0);assert.match(result.stderr,/RELEASE_BUILD_NETWORK_DENIED/);assert.doesNotMatch(result.stderr,/ERR_UNSUPPORTED_ESM_URL_SCHEME/);
});

const daily={...review,DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:55432/content_center",APP_URL:"http://localhost:3000",S3_ENDPOINT:"http://127.0.0.1:9000",ENVIRONMENT_ID:"LOCAL_REAL",AUTH_COOKIE_PREFIX:"content-center-local-daily",LOCAL_REVIEW_OFFLINE:"false",EXTERNAL_CALLS_DISABLED:"true",DEMO_AUTO_LOGIN:"false",INTERNAL_SIGNUP_ENABLED:"false",SYSTEM_MANAGED_PROVIDERS:"false",MOCK_MODE:"false"};
test("daily production retains explicit production mode and validated daily target despite foreign inherited profile",()=>{
 const env=runtimeEnvironment("daily",daily,{LOCAL_RELEASE_PROFILE:"review",NODE_ENV:"development",DATABASE_URL:review.DATABASE_URL});
 assert.equal(env.LOCAL_RELEASE_PROFILE,"daily");assert.equal(env.NODE_ENV,"production");assert.equal(env.DATABASE_URL,daily.DATABASE_URL);
 assert.equal(env.FREE_WORKER_MODE,"false");assert.equal(env.EXTERNAL_CALLS_DISABLED,"true");
});
test("daily production still rejects wrong database, storage, active jobs and missing credentials",()=>{
 for(const patch of [{DATABASE_URL:review.DATABASE_URL},{S3_ENDPOINT:review.S3_ENDPOINT},{EXTERNAL_CALLS_DISABLED:"false"},{FREE_WORKER_MODE:"true"},{AUTH_SECRET:""}])assert.throws(()=>runtimeEnvironment("daily",{...daily,...patch},{}));
});
