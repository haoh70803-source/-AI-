import process from "node:process";
import console from "node:console";
import { setTimeout, clearTimeout } from "node:timers";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const webDir=resolve(root,"apps/web");
const require=createRequire(import.meta.url);
const port=Number(process.env.PORT || 10000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error("INVALID_PORT");
for(const binary of ["ffmpeg","ffprobe"]){const check=spawnSync(binary,["-version"],{stdio:"ignore"});if(check.status!==0)throw Error(`MEDIA_BINARY_MISSING: ${binary}`);}
console.info("FREE_EXPERIENCE_MEDIA_TOOLS_READY");
const common={...process.env,FREE_WORKER_MODE:"true",TRANSCRIPTION_PRIMARY:"DOUBAO_RECORDING_FILE_2_0",MEDIA_RELAY_INTERNAL_BASE_URL:`http://127.0.0.1:${port}`};
const children=[];let stopping=false;
function stop(code){if(stopping)return;stopping=true;for(const child of children)child.kill("SIGTERM");const deadline=setTimeout(()=>{for(const child of children)child.kill("SIGKILL");process.exit(code);},8000);Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():new Promise(done=>child.once("exit",done)))).then(()=>{clearTimeout(deadline);process.exit(code);});}
function launch(label,args,cwd,heap){const child=spawn(process.execPath,args,{cwd,env:{...common,NODE_OPTIONS:`${process.env.NODE_OPTIONS||""} --max-old-space-size=${heap}`},stdio:"inherit"});children.push(child);child.once("error",()=>{console.error(`${label}_START_FAILED`);stop(1)});child.once("exit",code=>{if(!stopping){console.error(`${label}_EXITED`,code);stop(code||1)}});return child;}
process.once("SIGTERM",()=>stop(0));process.once("SIGINT",()=>stop(0));
launch("WEB",[require.resolve("next/dist/bin/next",{paths:[webDir]}),"start","--hostname","0.0.0.0","--port",String(port)],webDir,320);
let ready=false;const deadline=Date.now()+120000;
while(!stopping&&Date.now()<deadline){try{const response=await globalThis.fetch(`http://127.0.0.1:${port}/login`,{redirect:"manual",signal:globalThis.AbortSignal.timeout(3000)});await response.body?.cancel();if(response.status<500){ready=true;break}}catch { /* Readiness probes retry until the startup deadline. */ }await delay(1000);}
if(!ready){console.error("WEB_READINESS_TIMEOUT");stop(1)}else if(!stopping){console.info("FREE_EXPERIENCE_WEB_AND_WORKER_READY");}
