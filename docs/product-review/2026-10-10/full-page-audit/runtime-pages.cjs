const fs=require('node:fs'),path=require('node:path'),{chromium}=require('@playwright/test');
const OUT=__dirname;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();const records=[];
 const inventory=JSON.parse(fs.readFileSync(path.join(OUT,'page-control-api-inventory.json'),'utf8'));
 const routes=inventory.pages.filter(p=>!p.slot&&!p.route.includes('[')&&p.route!=='/experience').map(p=>p.route);
 for(const route of routes){
  try{const response=await page.goto('http://127.0.0.1:3022'+route,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(120);const finalUrl=page.url();const text=(await page.locator('body').innerText()).slice(0,700);let screenshot=null;const finalPath=new URL(finalUrl).pathname;
  if(route===finalPath&&(route==='/login'||route.startsWith('/account/'))){screenshot='screenshots/current-'+route.slice(1).replaceAll('/','-')+'.png';await page.screenshot({path:path.join(OUT,screenshot)});}
  records.push({route,status:response?.status(),finalUrl,finalPath,text,screenshot,routeRendered:route===finalPath,validated:'guest navigation only; no login submission or business control exercised'});}
  catch(e){records.push({route,error:e.message});}
 }
 await browser.close();fs.writeFileSync(path.join(OUT,'runtime-pages.json'),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Guest browser, no credentials, no business mutations',records},null,2));
 console.log(JSON.stringify(records,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
