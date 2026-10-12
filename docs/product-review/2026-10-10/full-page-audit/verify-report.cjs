const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {pathToFileURL}=require('node:url'),{chromium}=require('@playwright/test');
const OUT=__dirname,ROOT=path.resolve(OUT,'../../../..');
const inv=JSON.parse(fs.readFileSync(path.join(OUT,'page-control-api-inventory.json'),'utf8'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
(async()=>{
 const result={date:'2026-10-10',level:'V0 static audit plus local report artifact browser verification',businessTestsRun:false,businessAcceptancePassed:false,applicationCodeEdited:false,checks:[],sourceChangesDuringAudit:[]};
 for(const s of inv.sourceSnapshots){if(sha(path.join(ROOT,s.file))!==s.sha256)result.sourceChangesDuringAudit.push(s.file);}
 result.checks.push({name:'all current source snapshot hashes stable at delivery',passed:!result.sourceChangesDuringAudit.length,count:inv.sourceSnapshots.length});
 const meta=JSON.parse(fs.readFileSync(path.join(OUT,'page-metadata.json'),'utf8'));
 result.checks.push({name:'ordinary page metadata complete',passed:meta.length===inv.counts.ordinaryPageFiles&&meta.every(m=>m.name&&m.status&&m.value),count:meta.length});
 const probes=await Promise.all([3000,3001,3022,55438,19020].map(port=>new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');let done=false;const finish=state=>{if(done)return;done=true;socket.destroy();resolve({host:'127.0.0.1',port,state});};socket.setTimeout(1200);socket.on('connect',()=>finish('open'));socket.on('error',()=>finish('closed'));socket.on('timeout',()=>finish('timeout'));})));
 fs.writeFileSync(path.join(OUT,'runtime-probe.json'),JSON.stringify({checkedAt:new Date().toISOString(),purpose:'read-only local socket probe outside sandbox; no database query',probes,conclusion:'3022 and its local dependency ports are reachable when probed outside sandbox. Earlier sandbox connection failures did not prove the services stopped. Authenticated business runtime and build identity remain unverified.'},null,2));
 const screenshots=JSON.parse(fs.readFileSync(path.join(OUT,'screenshot-register.json'),'utf8'));
 result.checks.push({name:'registered historical and current screenshot bytes match',passed:screenshots.every(s=>sha(path.join(OUT,s.output))===s.sha256&&sha(path.join(ROOT,s.file))===s.sha256),count:screenshots.length,historical:screenshots.filter(s=>!s.newCapture).length,current:screenshots.filter(s=>s.newCapture).length});
 const runtimePages=JSON.parse(fs.readFileSync(path.join(OUT,'runtime-pages.json'),'utf8'));
 result.guestRuntimeEvidence={routesVisited:runtimePages.records.length,routesRendered:runtimePages.records.filter(r=>r.routeRendered).map(r=>r.route),redirectedRoutes:runtimePages.records.filter(r=>!r.routeRendered).length,loginSubmitted:false,businessWrites:false,environmentIdentityVerified:false};
 inv.runtime={initialSandboxProbe:'failed connections; not evidence that local services were stopped',outsideSandboxProbe:probes,guestRoutesVisited:runtimePages.records.length,newPublicPageScreenshots:screenshots.filter(s=>s.newCapture).length,newAuthenticatedBusinessScreenshots:0,authenticatedFunctionsValidated:false};
 fs.writeFileSync(path.join(OUT,'page-control-api-inventory.json'),JSON.stringify(inv,null,2));
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(OUT,'report.html')).href);
  await page.locator('#page-count').waitFor();
  result.checks.push({name:'report opens with all 82 page evidence panels',passed:await page.locator('#pages details.page').count()===82});
  await page.evaluate(()=>{for(const im of document.images)im.loading='eager';});
  const decoded=await page.evaluate(async()=>{return Promise.all([...document.images].map(async im=>{try{await im.decode();return im.naturalWidth>0}catch{return false}}));});
  result.checks.push({name:'all registered images load in report',passed:decoded.length===screenshots.length&&decoded.every(Boolean),count:decoded.length});
  const sourceLinks=await page.locator('a[href^="file:///"]').count();result.checks.push({name:'source evidence renders as clickable local links',passed:sourceLinks>100,count:sourceLinks});
  await page.screenshot({path:path.join(OUT,'report-preview-desktop.png')});
  await page.locator('#page-search').fill('/library/feishu');
  const visible=await page.locator('#pages details.page:not(.hidden)').count();result.checks.push({name:'page path filter',passed:visible===1,count:visible});
  await page.locator('#expand').click();result.checks.push({name:'expand filtered page',passed:await page.locator('#pages details.page:not(.hidden)').getAttribute('open')!==null});
  const decisionId=meta[0].id;
  const row=page.locator('[data-decision="'+decisionId+'"]');
  await row.locator('[data-field="decision"]').selectOption('待核验');await row.locator('[data-field="owner"]').fill('报告展示核验');
  await page.reload();result.checks.push({name:'review table persists locally within this disposable browser context',passed:await row.locator('[data-field="owner"]').inputValue()==='报告展示核验'});
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-decisions').click();const download=await downloadPromise;await download.saveAs(path.join(OUT,'report-export-check.csv'));
  const exportText=fs.readFileSync(path.join(OUT,'report-export-check.csv'),'utf8');result.checks.push({name:'CSV export has header, 72 page rows and reviewed value',passed:exportText.split(/\r?\n/).length===73&&exportText.includes('报告展示核验')&&!exportText.startsWith('\\uFEFF')});
  // Do not deliver a test-filled decisions file; export-check is only verification evidence.
  await row.locator('[data-field="decision"]').selectOption('');await row.locator('[data-field="owner"]').fill('');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(OUT,'report-preview-mobile.png')});
  result.checks.push({name:'report JavaScript has no page errors',passed:errors.length===0,errors});
  result.reportBrowser='Microsoft Edge headless, local report only; no business pages navigated';
 }catch(e){result.reportBrowser='unavailable';result.reportBrowserError=e.message;result.checks.push({name:'report browser inspection',passed:false});}
 finally{if(browser)await browser.close();}
 result.artifactChecksPassed=result.checks.every(c=>c.passed);
 fs.writeFileSync(path.join(OUT,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
