import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, openSync, closeSync, unlinkSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { runtimeEnvironment } from './local-release-profile.mjs';
import { validateFusionConfig } from './fusion-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = join(root, '.local-data'), logs = join(data, 'logs');
const configFile = join(root, 'output/account-upgrade-private/review.env');
// PostgreSQL's Windows native tools cannot initialize a UTF-8 cluster through a
// Chinese executable/data path. The junction is only an ASCII alias; all bytes
// remain in the user-requested independent directory.
const alias = join(tmpdir(), 'xsj-fusion-'+createHash('sha256').update(root).digest('hex').slice(0,12));
if (!existsSync(alias)) symlinkSync(root, alias, 'junction');
if (realpathSync(alias).toLowerCase() !== realpathSync(root).toLowerCase()) throw Error('FUSION_RUNTIME_ALIAS_MISMATCH');
const pg = join(alias, 'output/setup/runtime/pgsql/bin');
const pgData = join(alias, '.local-data/postgres'), minio = join(root, 'output/setup/runtime/minio.exe');
const wait = ms => new Promise(done => setTimeout(done, ms));
function run(exe, args, env = process.env, cwd = root) {
  const result = spawnSync(exe, args, { cwd, env, encoding: 'utf8', windowsHide: true, stdio: exe.endsWith('pg_ctl.exe') ? 'ignore' : 'pipe', timeout: 120000 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) { if (result.stderr) process.stderr.write(result.stderr); throw Error('FUSION_COMMAND_FAILED'); }
}
function config() { return validateFusionConfig(parseEnv(readFileSync(configFile, 'utf8'))); }
function appEnv() { return runtimeEnvironment('review', config(), process.env); }
function background(exe, args, env, name, cwd = root) {
  const out = openSync(join(logs, name+'.out.log'), 'a'), err = openSync(join(logs, name+'.err.log'), 'a');
  const child = spawn(exe, args, { cwd, env, detached: true, windowsHide: true, stdio: ['ignore',out,err] });
  child.unref(); closeSync(out); closeSync(err);
  writeFileSync(join(data, name+'.pid'), String(child.pid));
  return child.pid;
}
async function health(url) { try { return (await fetch(url,{signal:AbortSignal.timeout(2000)})).ok; } catch { return false; } }
async function infra() {
  if (!existsSync(join(pgData,'PG_VERSION'))) throw Error('FUSION_SETUP_REQUIRED');
  const status = spawnSync(join(pg,'pg_ctl.exe'),['status','-D',pgData],{windowsHide:true,stdio:'ignore'});
  if (status.status !== 0) run(join(pg,'pg_ctl.exe'),['start','-D',pgData,'-l',join(logs,'postgres.log'),'-w']);
  if (!await health('http://127.0.0.1:19020/minio/health/ready')) {
    const values=config();
    background(minio,['server',join(data,'minio'),'--address','127.0.0.1:19020','--console-address','127.0.0.1:19030'],{...process.env,MINIO_ROOT_USER:values.S3_ACCESS_KEY_ID,MINIO_ROOT_PASSWORD:values.S3_SECRET_ACCESS_KEY,MINIO_BROWSER:'off',MINIO_UPDATE:'off'},'minio');
    for(let i=0;i<40;i++){if(await health('http://127.0.0.1:19020/minio/health/ready'))return;await wait(500);}
    throw Error('FUSION_STORAGE_START_FAILED');
  }
}
async function setup() {
  mkdirSync(logs,{recursive:true}); mkdirSync(dirname(configFile),{recursive:true});
  if (!existsSync(configFile)) {
    const secret=()=>randomBytes(32).toString('hex'), password=secret();
    const values={DATABASE_URL:`postgresql://workbench_fusion:${password}@127.0.0.1:55438/content_center_12_review`,APP_URL:'http://localhost:3022',AUTH_SECRET:secret(),INTEGRATION_ENCRYPTION_KEY:randomBytes(32).toString('base64'),AUTH_COOKIE_PREFIX:'content-center-12-review',ENVIRONMENT_ID:'LOCAL_REVIEW',LOCAL_REVIEW_OFFLINE:'true',FREE_WORKER_MODE:'false',STORAGE_DRIVER:'S3_COMPATIBLE',S3_ENDPOINT:'http://127.0.0.1:19020',S3_REGION:'us-east-1',S3_BUCKET:'workbench-12',S3_ACCESS_KEY_ID:'workbench-12',S3_SECRET_ACCESS_KEY:secret(),REDIS_URL:'redis://127.0.0.1:1/0',EXTERNAL_CALLS_DISABLED:'true',SYSTEM_MANAGED_PROVIDERS:'false',MOCK_MODE:'false',INTERNAL_SIGNUP_ENABLED:'false',DEMO_AUTO_LOGIN:'false'};
    writeFileSync(configFile,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
    writeFileSync(join(data,'initial-login.env'),`EMAIL=admin@workbench.local\nPASSWORD=${randomBytes(18).toString('base64url')}\n`,{mode:0o600});
  }
  const values=config(), dbUrl=new URL(values.DATABASE_URL), pgEnv={...process.env,PGPASSWORD:dbUrl.password};
  if (!existsSync(join(pgData,'PG_VERSION'))) {
    const pwfile=join(data,'initdb-password.tmp');writeFileSync(pwfile,dbUrl.password,{mode:0o600});
    try { run(join(pg,'initdb.exe'),['-D',pgData,'-U','workbench_fusion','--encoding=UTF8','--locale=C','--auth=scram-sha-256','--pwfile='+pwfile]); } finally {unlinkSync(pwfile);}
    appendFileSync(join(pgData,'postgresql.conf'),"\nlisten_addresses = '127.0.0.1'\nport = 55438\n");
  }
  await infra();
  const psqlArgs=['-h','127.0.0.1','-p','55438','-U','workbench_fusion','-d','postgres','-tAc'];
  const query=spawnSync(join(pg,'psql.exe'),[...psqlArgs,"SELECT 1 FROM pg_database WHERE datname='content_center_12_review'"],{env:pgEnv,encoding:'utf8',windowsHide:true});
  if(query.status!==0)throw Error('FUSION_DATABASE_CONNECTION_FAILED');
  if(query.stdout.trim()!=='1')run(join(pg,'psql.exe'),[...psqlArgs,'CREATE DATABASE content_center_12_review'],pgEnv);
  run(process.execPath,[join(root,'packages/db/node_modules/prisma/build/index.js'),'migrate','deploy','--schema',join(root,'packages/db/prisma/schema.prisma')],appEnv());
  const require=createRequire(join(root,'packages/providers/package.json'));
  const {S3Client,HeadBucketCommand,CreateBucketCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand}=require('@aws-sdk/client-s3');
  const client=new S3Client({endpoint:values.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:values.S3_ACCESS_KEY_ID,secretAccessKey:values.S3_SECRET_ACCESS_KEY}});
  try { await client.send(new HeadBucketCommand({Bucket:values.S3_BUCKET})); } catch(error) {if(error.$metadata?.httpStatusCode!==404)throw Error('FUSION_BUCKET_CHECK_FAILED');await client.send(new CreateBucketCommand({Bucket:values.S3_BUCKET}));}
  const key='deployment-check/'+randomBytes(8).toString('hex')+'.txt', body='fusion-storage-smoke';
  try { await client.send(new PutObjectCommand({Bucket:values.S3_BUCKET,Key:key,Body:body}));const object=await client.send(new GetObjectCommand({Bucket:values.S3_BUCKET,Key:key}));if(await object.Body.transformToString()!==body)throw Error('FUSION_STORAGE_READ_FAILED'); } finally {await client.send(new DeleteObjectCommand({Bucket:values.S3_BUCKET,Key:key}));client.destroy();}
  const login=parseEnv(readFileSync(join(data,'initial-login.env'),'utf8'));
  run(process.execPath,['--import','tsx',join(root,'apps/web/scripts/fusion-bootstrap.ts')],{...appEnv(),FUSION_INITIAL_PASSWORD:login.PASSWORD});
  console.log('FUSION_SETUP_READY: database, object storage, schema and local account ready');
}
async function start() {
  mkdirSync(logs,{recursive:true});await infra();
  if(await health('http://127.0.0.1:3032/api/health/ready')){console.log('FUSION_ALREADY_RUNNING http://localhost:3032');return;}
  const releases=join(root,'output/architecture-upgrade-20261005/releases');
  const valid=readdirSync(releases).filter(name=>{try{return JSON.parse(readFileSync(join(releases,name,'receipt.json'),'utf8')).status==='BUILT';}catch{return false;}}).sort();
  if(!valid.length)throw Error('FUSION_BUILD_REQUIRED');
  const id=valid.at(-1);
  run(process.execPath,[join(root,'scripts/local-release.mjs'),'check','review',id]);
  background(process.execPath,[join(root,'scripts/local-release.mjs'),'start','review',id],process.env,'web');
  for(let i=0;i<90;i++){if(await health('http://127.0.0.1:3032/api/health/ready')){console.log('FUSION_READY http://localhost:3032');return;}await wait(500);}
  throw Error('FUSION_WEB_START_FAILED');
}
async function stop(webOnly=false) {
  // Only stop processes recorded by this independent deployment, never shared services.
  for(const name of (webOnly?['web']:['web','minio'])) {
    const pidFile=join(data,name+'.pid');if(!existsSync(pidFile))continue;
    const pid=Number(readFileSync(pidFile,'utf8'));
    if(!Number.isInteger(pid)||pid<=0)throw Error('FUSION_INVALID_PROCESS_RECORD');
    const scope=spawnSync('powershell.exe',['-NoProfile','-Command',"$taskProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$env:FUSION_STOP_PID); if(-not $taskProcess){exit 3}; if($taskProcess.CommandLine -and $taskProcess.CommandLine.Contains($env:FUSION_STOP_ROOT)){exit 0}; exit 4"],{env:{...process.env,FUSION_STOP_PID:String(pid),FUSION_STOP_ROOT:root},windowsHide:true,stdio:'ignore'});
    if(scope.status===0){const killed=spawnSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});if(killed.status!==0)throw Error('FUSION_PROCESS_STOP_FAILED');}
    else if(scope.status!==3)throw Error('FUSION_PROCESS_SCOPE_MISMATCH');
    if(name==='web') {
      const releases=join(root,'output/architecture-upgrade-20261005/releases');
      if(await health('http://127.0.0.1:3032/api/health/ready'))throw Error('FUSION_WEB_STILL_RUNNING');
      for(const id of readdirSync(releases)){const lock=join(releases,id,'runtime.lock');if(existsSync(lock)&&readFileSync(lock,'utf8').trim()===String(pid))unlinkSync(lock);}
    }
    unlinkSync(pidFile);
  }
  if(webOnly){console.log('FUSION_WEB_STOPPED');return;}
  if(existsSync(join(pgData,'postmaster.pid')))run(join(pg,'pg_ctl.exe'),['stop','-D',pgData,'-m','fast','-w']);
  console.log('FUSION_STOPPED: local data retained');
}
try {
  const action=process.argv[2];
  if(action==='setup')await setup();
  else if(action==='start')await start();
  else if(action==='stop')await stop();
  else if(action==='stop-web')await stop(true);
  else if(action==='check'){const response=await fetch('http://127.0.0.1:3032/api/health/ready');const status=await response.json();console.log(JSON.stringify(status,null,2));if(!response.ok)process.exitCode=1;}
  else throw Error('FUSION_USAGE: setup | start | stop | check');
}catch(error){console.error(error.message?.startsWith('FUSION_')?error.message:'FUSION_OPERATION_FAILED: see local logs');process.exitCode=1;}
