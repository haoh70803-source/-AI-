import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fixture,projectAnalytics,trendProjection} from './analytics-adapter.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:process.env.DUAL_EXPERIENCE_CHROMIUM});
const page=await browser.newPage();const errors=[],api=[],checks=[];let screenshots=0;
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.url())});
try{
const current30=projectAnalytics(fixture,{range:'最近 30 天'}),current7=projectAnalytics(fixture,{range:'最近 7 天'}),current90=projectAnalytics(fixture,{range:'最近 90 天'});
assert.deepEqual(current30.todayMetrics,current7.todayMetrics);assert.deepEqual(current30.todayMetrics,current90.todayMetrics);checks.push('Snapshot metrics remain today values across date windows');
assert.equal(current30.accountRanking.reduce((n,r)=>n+r.value,0),current30.platformShare.reduce((n,r)=>n+r.value,0));assert.equal(current30.windowTotals.plays,current30.platformShare.reduce((n,r)=>n+r.value,0));checks.push('Account ranking/platform share/window total reconcile exactly');
assert.equal(current30.interactions.reduce((n,r)=>n+r.value,0),current30.windowTotals.interactions);checks.push('Interaction categories reconcile to same-period interaction total');
assert.equal(current90.windowTotals.exposures,null);assert(current90.series('exposures').includes(null));checks.push('Unknown exposure remains null in totals and trend, never zero');
const negative={today:fixture.today,accounts:[fixture.accounts[0]],records:[{...fixture.records.at(-5),netFollowers:-7,exposures:null}],contents:[],tasks:[],alerts:[]};assert.equal(projectAnalytics(negative).todayMetrics.netFollowers,-7);assert.equal(projectAnalytics(negative).todayMetrics.exposures,null);checks.push('Signed net followers and missing values preserve backend semantics');
const missing={...negative,records:[]};assert.equal(projectAnalytics(missing).todayMetrics.plays,null);checks.push('No observations remain unknown instead of becoming zero');
const monthly=trendProjection(current30,'views','year');assert(monthly.labels.length<=2);assert.equal(monthly.series[0].values.reduce((n,v)=>n+v,0),current30.windowTotals.plays);checks.push('Month grouping sums real window records without invented months');
for(const theme of ['dark','light'])for(const route of ['home','studio','content','research','teardown','settings','capabilities','analytics/overview','analytics/audience']){
 await page.setViewportSize({width:1440,height:1000});await page.goto(`http://127.0.0.1:4178/?theme=${theme}#${route}`);await page.evaluate(()=>document.fonts.ready);
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))));
 assert(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.naturalWidth>0)));
 for(const device of ['desktop','mobile']){
 if(device==='mobile')await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${route}/${device} overflow`);
 await page.screenshot({path:`${root}screenshots/${theme}-${route.replace('/','-')}-${device}.png`,fullPage:true,animations:'disabled',style:device==='mobile'?'body{position:relative;padding-bottom:64px}.shell{margin-bottom:0}.rail{position:absolute;bottom:0;top:auto}':''});screenshots++;checks.push(`${theme}/${route}/${device}: no overflow, screenshot captured`);
 }
 if(route==='studio'){await page.locator('[data-panel="document"].btn').click();assert(await page.locator('#editable').isVisible());await page.screenshot({path:`${root}screenshots/${theme}-studio-mobile-document.png`,fullPage:true,animations:'disabled',style:'body{position:relative;padding-bottom:64px}.shell{margin-bottom:0}.rail{position:absolute;bottom:0;top:auto}'});screenshots++;}
}
await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:4178/#research');await page.locator('[data-backend="handoff"]').click();await page.waitForURL('**/#studio');await page.locator('#backend-reference-tags').getByText('品牌表达').waitFor();checks.push('Research handoff opens project with scoped reference');
await page.locator('[data-backend="skills"]').first().click();await page.locator('[name=skill]').nth(0).check();await page.locator('[name=skill]').nth(1).check();await page.locator('[data-backend="apply-skills"]').click();assert.equal(await page.locator('#skill-count').innerText(),'2');checks.push('Multiple skills update shared chips/count');
await page.locator('[data-backend="references"]').click();await page.locator('[name=reference]').first().check();await page.locator('#reference-scope').selectOption('TURN');await page.locator('[data-backend="apply-references"]').click();assert((await page.locator('#backend-reference-tags').innerText()).includes('本次对话'));checks.push('Reference scope is selectable and displayed');
await page.locator('#prompt').fill('保留我的项目输入');await page.locator('[data-theme-choice="light"]').click();assert.equal(await page.locator('#prompt').inputValue(),'保留我的项目输入');checks.push('Theme retains project input');
await page.locator('[data-backend="history"]').click();assert(await page.locator('#dialog').getByText('v1 · 品牌叙事初稿').isVisible());await page.keyboard.press('Escape');checks.push('Artifact version history accessible');
await page.goto('http://127.0.0.1:4178/#content');await page.locator('[data-backend="processing"]').click();assert(await page.locator('#dialog').getByText('转录中 · 示例').isVisible());await page.keyboard.press('Escape');checks.push('Material processing status accessible');
await page.goto('http://127.0.0.1:4178/#analytics/overview');assert(await page.getByText('今日播放量',{exact:true}).isVisible());await page.locator('[data-backend="import-metrics"]').click();await page.locator('[data-backend="preview-import"]').click();assert(await page.getByText('导入预览 · 校验结果',{exact:true}).isVisible());await page.locator('[data-backend="confirm-import"]').click();checks.push('Business metrics and simulated CSV preview/confirmation');
await page.goto('http://127.0.0.1:4178/#analytics/audience');await page.locator('[data-analytics-plan]').selectOption('current');assert.equal(await page.locator('.backend-unavailable').count(),3);await page.locator('[data-audience-metric]').nth(1).click();assert.equal(await page.locator('.backend-unavailable').count(),3);checks.push('Unavailable heat/cohort/device panels persist after metric changes');
await page.goto('http://127.0.0.1:4178/?theme=light#analytics/audience');
assert.equal(await page.locator('.backend-unavailable').count(),0);
const layout=await page.locator('.audience-top>.stat-card,.audience-bottom>.stat-card').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return [b.x,b.y,b.width,b.height]}));
await page.locator('[data-analytics-plan]').selectOption('current');assert.equal(await page.locator('.backend-unavailable').count(),3);
const alternateLayout=await page.locator('.audience-top>.stat-card,.audience-bottom>.stat-card').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return [b.x,b.y,b.width,b.height]}));assert.deepEqual(alternateLayout,layout);checks.push('Current/extended capability views preserve exact desktop panel geometry');
await page.goto('http://127.0.0.1:4178/#analytics/overview');const snapshot=await page.locator('.metrics-row').innerText();await page.locator('[data-analytics-range]').first().selectOption('最近 7 天');assert.equal(await page.locator('.metrics-row').innerText(),snapshot);checks.push('UI range filtering leaves daily snapshot cards unchanged');
await page.locator('[data-analytics-range]').first().selectOption('最近 90 天');await page.locator('[data-metric="samples"]').click();assert((await page.locator('#main-trend [aria-label]').first().getAttribute('aria-label')).includes('曝光量'));checks.push('Exposure trend is selected from nullable daily records');
for(const theme of ['dark','light']){
 await page.goto(`http://127.0.0.1:4178/?theme=${theme}&capability=current#analytics/audience`);await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:`${root}screenshots/${theme}-analytics-audience-desktop-current.png`,fullPage:true,animations:'disabled'});screenshots++;
 await page.setViewportSize({width:390,height:844});assert(await page.locator('[data-analytics-plan]').isVisible());await page.screenshot({path:`${root}screenshots/${theme}-analytics-audience-mobile-current.png`,fullPage:true,animations:'disabled',style:'body{position:relative;padding-bottom:64px}.shell{margin-bottom:0}.rail{position:absolute;bottom:0;top:auto}'});screenshots++;
}checks.push('Capability mode is accessible on mobile; both actual-capability variants captured');
await page.setViewportSize({width:1440,height:1000});
for(const theme of ['dark','light']){
 await page.goto(`http://127.0.0.1:4178/?theme=${theme}#teardown`);
 await page.locator('[data-td-tab="comparison"]').click();await page.screenshot({path:`${root}screenshots/${theme}-teardown-desktop-comparison.png`,fullPage:true,animations:'disabled'});screenshots++;
 await page.locator('[data-td="fail"]').click();await page.screenshot({path:`${root}screenshots/${theme}-teardown-desktop-failed.png`,fullPage:true,animations:'disabled'});screenshots++;
 await page.locator('[data-td="complete"]').click();await page.locator('[data-td="share"]').click();await page.screenshot({path:`${root}screenshots/${theme}-teardown-desktop-share.png`,fullPage:true,animations:'disabled'});screenshots++;await page.keyboard.press('Escape');
}
await page.goto('http://127.0.0.1:4178/#teardown');
await page.locator('[data-td-segment="2"]').first().click();assert((await page.locator('#td-time').innerText()).includes('00:24'));checks.push('Report timeline selects matching timestamp/transcript');
await page.locator('[data-td-tab="comparison"]').click();assert(await page.getByText('2.00×',{exact:true}).isVisible());checks.push('Author comparison shows sample count and calculation boundary');
await page.locator('[data-td="fail"]').click();await page.locator('[data-td="retry"]').click();assert(await page.locator('[data-td="cancel"]').isEnabled());await page.locator('[data-td="cancel"]').click();assert(await page.getByRole('heading',{name:'已停止',exact:true}).isVisible());checks.push('Failure/retry/cancel state flow');
await page.locator('[data-td="complete"]').click();await page.locator('#td-role').selectOption('VIEWER');assert(await page.locator('[data-td="share"]').isDisabled());assert(await page.locator('[data-td="start"]').isDisabled());checks.push('Read-only preview disables writes');await page.locator('#td-role').selectOption('EDITOR');
const downloadPromise=page.waitForEvent('download');await page.locator('[data-td="export"]').click();assert((await downloadPromise).suggestedFilename().endsWith('.md'));checks.push('Example report exports Markdown');
await page.locator('[data-td="share"]').click();await page.locator('#td-target').selectOption({label:'留白之间 · 空间叙事'});await page.locator('[data-td="confirm-share"]').click();await page.waitForURL('**/#studio');assert((await page.locator('.studio-title').innerText()).includes('留白之间'));assert((await page.locator('#backend-reference-tags').innerText()).includes('视频拆解报告'));checks.push('Reviewed teardown report joins selected project with reference');
await page.goto('http://127.0.0.1:4178/#capabilities');await page.locator('#coverage-search').fill('/api/research/teardown');assert.equal(await page.locator('[data-coverage-id]').count(),7);await page.locator('[data-coverage-id]').first().click();assert((await page.locator('#dialog').innerText()).includes('/api/research/teardown'));await page.keyboard.press('Escape');checks.push('API map searches every teardown method and displays contract');
await page.locator('#coverage-search').fill('/api/video-data');await page.locator('[data-coverage-id]').last().click();assert((await page.locator('#dialog').innerText()).includes('csv.preview'));await page.keyboard.press('Escape');checks.push('Multi-action API detail includes body operation branches');
assert.equal(await page.locator('[data-coverage-gap]').count(),6);checks.push('Six identified gaps have explicit design proposals');
await page.goto('http://127.0.0.1:4178/review.html');assert.equal(await page.locator('.shot').count(),48);checks.push('Gallery links all 48 updated screenshots');
assert.deepEqual(errors,[]);assert.deepEqual(api,[]);checks.push('No uncaught browser errors or production API requests');
await writeFile(`${root}VERIFICATION-ADAPTATION.json`,JSON.stringify({checkedAt:new Date().toISOString(),checks,screenshots,errors,apiRequests:api},null,2));console.log(JSON.stringify({passed:checks.length,screenshots,errors}));
}finally{await browser.close()}
