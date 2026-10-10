const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),{fileURLToPath}=require('node:url');
const OUT=__dirname,ROOT=path.resolve(OUT,'../../../..');
const json=f=>JSON.parse(fs.readFileSync(path.join(OUT,f),'utf8'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const verification=json('verification.json'),inventory=json('page-control-api-inventory.json'),images=json('screenshot-register.json');
const report=fs.readFileSync(path.join(OUT,'report.html'),'utf8'),management=fs.readFileSync(path.join(OUT,'management-review.md'),'utf8');
const brokenLinks=[...report.matchAll(/href="(file:\/\/\/[^"\s]+)"/g)].map(m=>fileURLToPath(m[1].replaceAll('&amp;','&'))).filter(f=>!fs.existsSync(f));
const imgPaths=[...report.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m=>m[1]);
const script=report.match(/<script>([\s\S]*)<\/script>/)?.[1];new vm.Script(script);
const sourceChanges=inventory.sourceSnapshots.filter(s=>sha(path.join(ROOT,s.file))!==s.sha256).map(s=>s.file);
const checks=[
 {name:'final eight management sections',passed:(management.match(/^## 第.+/gm)||[]).length===8},
 {name:'final HTML JavaScript parses',passed:true},
 {name:'all source evidence links point to existing files',passed:brokenLinks.length===0,brokenLinks},
 {name:'final eleven images exist and registry hashes match',passed:imgPaths.length===11&&imgPaths.every(f=>fs.existsSync(path.join(OUT,f)))&&images.every(s=>sha(path.join(OUT,s.output))===s.sha256)},
 {name:'no obsolete stopped-service or invented Feishu search API statements',passed:!management.includes('端口均关闭')&&!management.includes('当前服务未运行')&&!management.includes('/api/feishu/search')},
 {name:'current source snapshot remains stable after report normalization',passed:sourceChanges.length===0,sourceChanges}
];
verification.finalContentChecks=checks;verification.finalCheckedAt=new Date().toISOString();verification.artifactChecksPassed=verification.artifactChecksPassed&&checks.every(c=>c.passed);
verification.finalArtifacts=['report.html','report.md','management-review.md','function-decisions.csv','page-control-api-inventory.json','runtime-pages.json','screenshot-register.json'].map(file=>({file,sha256:sha(path.join(OUT,file))}));
fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(verification,null,2));
const checksDir=path.join(OUT,'verification-artifacts');fs.mkdirSync(checksDir,{recursive:true});
for(const file of ['report-export-check.csv','screenshots/current-runtime.png']){const from=path.join(OUT,file),to=path.join(checksDir,path.basename(file));if(fs.existsSync(from)&&!fs.existsSync(to))fs.renameSync(from,to);}
console.log(JSON.stringify({checks,artifactChecksPassed:verification.artifactChecksPassed},null,2));
if(!verification.artifactChecksPassed)process.exitCode=1;
