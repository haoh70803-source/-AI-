import process from "node:process";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, symlinkSync, openSync, closeSync, unlinkSync } from "node:fs";
import { parseEnv } from "node:util";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";
import { createRequire } from "node:module";
import { setTimeout } from "node:timers";
import { buildEnvironment, runtimeEnvironment, releaseId, sha256, RELEASE_REVIEW_PORT } from "./local-release-profile.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releases = join(root,"output/architecture-upgrade-20261005/releases");
const ignored = name => name === "node_modules" || name === "output" || name === ".git" || name === "dist" || name === "coverage" || name === ".turbo" || name === ".local-data" || name.startsWith(".next") || name.startsWith(".env") || name.endsWith(".tsbuildinfo");
function copyTree(source, target, manifest) {
  mkdirSync(target,{recursive:true});
  for(const entry of readdirSync(source,{withFileTypes:true})) {
    if(ignored(entry.name)) continue;
    const from=join(source,entry.name), to=join(target,entry.name);
    if(entry.isDirectory()) copyTree(from,to,manifest);
    else if(entry.isFile()) { copyFileSync(from,to); manifest.push({path:relative(root,from).replaceAll("\\","/"),sha256:sha256(readFileSync(from))}); }
  }
}
function artifactFiles(directory, prefix = "") {
  const result=[];
  for(const entry of readdirSync(directory,{withFileTypes:true})) {
    if(entry.name === "cache") continue;
    const path=join(directory,entry.name), name=prefix+entry.name;
    if(entry.isDirectory())result.push(...artifactFiles(path,name+"/"));
    else if(entry.isFile())result.push({path:name,sha256:sha256(readFileSync(path))});
  }
  return result;
}
function artifact(value) {
  const id=releaseId(value), directory=join(releases,id), receiptFile=join(directory,"receipt.json");
  if(!existsSync(receiptFile)) throw Error("RELEASE_ARTIFACT_NOT_FOUND");
  const receipt=JSON.parse(readFileSync(receiptFile,"utf8"));
  if(receipt.status!=="BUILT" || receipt.id!==id) throw Error("RELEASE_BUILD_NOT_SUCCESSFUL");
  const app=join(directory,"workspace/apps/web"), build=join(app,".next-production");
  if(!existsSync(join(build,"BUILD_ID")) || readFileSync(join(build,"BUILD_ID"),"utf8").trim()!==receipt.buildId) throw Error("RELEASE_BUILD_ID_MISMATCH");
  if(!Array.isArray(receipt.artifactFiles) || !receipt.artifactFiles.length)throw Error("RELEASE_ARTIFACT_MANIFEST_MISSING");
  for(const file of receipt.artifactFiles) if(!existsSync(join(build,file.path)) || sha256(readFileSync(join(build,file.path)))!==file.sha256)throw Error("RELEASE_ARTIFACT_CHANGED");
  for(const file of receipt.sources) if(!existsSync(join(root,file.path)) || sha256(readFileSync(join(root,file.path)))!==file.sha256) throw Error("RELEASE_SOURCE_CHANGED_REBUILD_REQUIRED");
  for(const file of receipt.runtimeFiles ?? []) if(!existsSync(join(directory,"workspace",file.path)) || sha256(readFileSync(join(directory,"workspace",file.path)))!==file.sha256)throw Error("RELEASE_NATIVE_DEPENDENCY_CHANGED");
  return { id,directory,app,build,receipt };
}
function execute(args,cwd,env,log) {
  return new Promise((done,reject)=>{
    const child=spawn(process.execPath,args,{cwd,env,stdio:["ignore","pipe","pipe"]});
    for(const stream of [child.stdout,child.stderr]) stream.on("data",bytes=>{process.stdout.write(bytes);if(log)log.write(bytes)});
    child.once("error",reject);child.once("exit",(code,signal)=>done({code:code??1,signal}));
  });
}
async function build() {
  const id="release-"+new Date().toISOString().replaceAll(/[-:.]/g,"").replace(/\d{3}Z$/,"Z")+"-"+randomUUID().slice(0,8);
  const directory=join(releases,id), workspace=join(directory,"workspace"), sources=[];
  mkdirSync(workspace,{recursive:true});
  for(const folder of ["apps","packages","scripts"])copyTree(join(root,folder),join(workspace,folder),sources);
  for(const name of ["package.json","pnpm-lock.yaml","pnpm-workspace.yaml","turbo.json","eslint.config.mjs","vitest.config.ts","tsconfig.json"]) if(existsSync(join(root,name))) {copyFileSync(join(root,name),join(workspace,name));sources.push({path:name,sha256:sha256(readFileSync(join(root,name)))});}
  // Reuse installed dependencies read-only; no install, lifecycle script or new credential.
  symlinkSync(join(root,"node_modules"),join(workspace,"node_modules"),"junction");
  for(const parent of ["apps","packages"]) for(const name of readdirSync(join(root,parent))) {
    const installed=join(root,parent,name,"node_modules"), copied=join(workspace,parent,name);
    if(existsSync(installed) && existsSync(copied))symlinkSync(installed,join(copied,"node_modules"),"junction");
  }
  const isolatedConfig=join(workspace,"apps/web/next.config.ts");
  writeFileSync(isolatedConfig,readFileSync(isolatedConfig,"utf8").replace(/^\s*distDir:.*$/m,'  distDir: ".next-production",'));
  // Native Prisma engines must accompany the isolated Windows release. Pnpm's
  // virtual store path is not relative to the bundled app. Keep a verified copy
  // in the generated client's documented runtime search directory.
  const dbRequire=createRequire(join(root,"packages/db/package.json"));
  const generated=resolve(dirname(dbRequire.resolve("@prisma/client/package.json")),"../../.prisma/client");
  const nativeNames=readdirSync(generated).filter(name=>name==="schema.prisma" || /query_engine.*\.node$/.test(name));
  if(!nativeNames.some(name=>name.endsWith(".node")))throw Error("RELEASE_PRISMA_ENGINE_MISSING");
  const nativeTarget=join(workspace,"apps/web/.prisma/client"), runtimeFiles=[];
  mkdirSync(nativeTarget,{recursive:true});
  for(const name of nativeNames){copyFileSync(join(generated,name),join(nativeTarget,name));runtimeFiles.push({path:relative(workspace,join(nativeTarget,name)).replaceAll("\\","/"),sha256:sha256(readFileSync(join(nativeTarget,name)))});}
  const networkLog=join(directory,"network-denied.jsonl"), guard=join(root,"scripts/release-build-network.mjs");
  const env=buildEnvironment(process.env,guard,networkLog);
  const liveFiles=["apps/web/next-env.d.ts","apps/web/tsconfig.json"];
  const before=Object.fromEntries(liveFiles.map(f=>[f,sha256(readFileSync(join(root,f)))]));
  const receipt={id,runtimeFiles,status:"BUILDING",createdAt:new Date().toISOString(),sources,liveFilesBefore:before,buildUsesRuntimeCredentials:false,buildDatabaseTarget:"unreachable loopback port 1",formalMigrationExecuted:false};
  writeFileSync(join(directory,"receipt.json"),JSON.stringify(receipt,null,2));
  const { createWriteStream }=await import("node:fs"), log=createWriteStream(join(directory,"build.log"));
  const result=await execute([join(root,"apps/web/node_modules/next/dist/bin/next"),"build","--webpack"],join(workspace,"apps/web"),env,log);
  await new Promise(done=>log.end(done));
  const networkDenied=existsSync(networkLog)?readFileSync(networkLog,"utf8").trim().split("\n").filter(Boolean).length:0;
  const liveFilesUnchanged=liveFiles.every(f=>sha256(readFileSync(join(root,f)))===before[f]);
  const sourceUnchanged=sources.every(f=>sha256(readFileSync(join(root,f.path)))===f.sha256);
  const buildIdFile=join(workspace,"apps/web/.next-production/BUILD_ID");
  Object.assign(receipt,{status:result.code===0 && networkDenied===0 && liveFilesUnchanged && sourceUnchanged && existsSync(buildIdFile) ? "BUILT":"FAILED",completedAt:new Date().toISOString(),exitCode:result.code,networkDenied,liveFilesUnchanged,sourceUnchanged,buildId:existsSync(buildIdFile)?readFileSync(buildIdFile,"utf8").trim():null});
  if(receipt.status==="BUILT")receipt.artifactFiles=artifactFiles(join(workspace,"apps/web/.next-production"));
  writeFileSync(join(directory,"receipt.json"),JSON.stringify(receipt,null,2));
  console.log("RELEASE_RESULT",JSON.stringify({id,status:receipt.status,exitCode:result.code,networkDenied,liveFilesUnchanged,sourceUnchanged}));
  if(receipt.status!=="BUILT")process.exitCode=1;
}
function existingConfig(mode) {
  const path=join(root,mode==="daily"?"output/account-upgrade-private/formal-cutover-20261004/daily.env":"output/account-upgrade-private/review.env");
  if(!existsSync(path))throw Error("RELEASE_CONFIGURATION_MISSING");
  return parseEnv(readFileSync(path,"utf8"));
}
async function portAvailable(port) {
  await new Promise((done,reject)=>{const server=net.createServer();server.once("error",()=>reject(Error("RELEASE_PORT_OCCUPIED")));server.listen(Number(port),"127.0.0.1",()=>server.close(done));});
}
async function run(action, mode, id) {
  if(!["daily","review"].includes(mode))throw Error("RELEASE_PROFILE_REQUIRED");
  const candidate=artifact(id), env=runtimeEnvironment(mode,existingConfig(mode),process.env,{publicNewsReview:mode==="review" && process.argv.includes("--approved-public-news")}), port=mode==="review"?RELEASE_REVIEW_PORT:"3000";
  await portAvailable(port);
  console.log("RELEASE_PREFLIGHT",JSON.stringify({mode,id,port,host:"127.0.0.1",worker:"disabled",external:"disabled",schemaChanges:"manual-only",configuration:"existing-private"}));
  if(action==="check")return;
  if(mode==="daily" && !process.argv.includes("--approved-daily-switch"))throw Error("RELEASE_DAILY_SWITCH_REQUIRES_SEPARATE_APPROVAL");
  const lockPath=join(candidate.directory,"runtime.lock");
  if(existsSync(lockPath))throw Error("RELEASE_RUNTIME_LOCK_EXISTS");
  const lock=openSync(lockPath,"wx");writeFileSync(lock,String(process.pid));closeSync(lock);
  let readinessFailed=false, exited=false, stopping=false;
  const child=spawn(process.execPath,[join(root,"apps/web/node_modules/next/dist/bin/next"),"start","--hostname","127.0.0.1","--port",port],{cwd:candidate.app,env,stdio:"inherit"});
  const stop=()=>{stopping=true;child.kill("SIGTERM");};process.once("SIGTERM",stop);process.once("SIGINT",stop);
  child.once("error",()=>{console.error("RELEASE_START_FAILED");unlinkSync(lockPath);process.exitCode=1});
  child.once("exit",code=>{exited=true;if(existsSync(lockPath))unlinkSync(lockPath);process.exitCode=readinessFailed?1:stopping?0:(code??1)});
  const deadline=Date.now()+45000;
  let ready=false;
  while(!exited && Date.now()<deadline) {
    try { const response=await globalThis.fetch("http://127.0.0.1:"+port+"/api/health/ready",{redirect:"error",signal:globalThis.AbortSignal.timeout(2000)});const state=await response.json();if(response.status===200 && state.ready===true){ready=true;break;}if(state.checks?.configuration===false)break; }catch { /* Dependency not ready; retry within the bounded deadline. */ }
    await new Promise(done=>setTimeout(done,500));
  }
  if(!ready){readinessFailed=true;console.error("RELEASE_READINESS_FAILED_NO_FALLBACK");process.exitCode=1;stop();const hardStop=setTimeout(()=>child.kill("SIGKILL"),5000);hardStop.unref();}
  else console.log("RELEASE_READY",JSON.stringify({mode,id,port,backgroundTasks:"disabled"}));
}
try {
  const [action,mode,id]=process.argv.slice(2);
  if(action==="build")await build();
  else if(["check","start"].includes(action))await run(action,mode,id);
  else throw Error("RELEASE_USAGE: build | check <daily|review> <artifact-id> | start <daily|review> <artifact-id>");
} catch(error) {
  // Never print URLs, parsed config, child environment or provider error payloads.
  console.error(typeof error.message==="string" && /^(RELEASE_|DAILY_|REVIEW_)/.test(error.message)?error.message:"RELEASE_OPERATION_FAILED");
  process.exitCode=1;
}
