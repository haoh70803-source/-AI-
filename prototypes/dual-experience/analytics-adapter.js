// Prototype-only projection of the existing video-data response. No API requests.
export const today='2026-10-10';
const offset=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const sum=(rows,key)=>rows.length&&rows.every(r=>r[key]!==null)?rows.reduce((n,r)=>n+r[key],0):null;
export const fixture={today,zone:'北京时间',readAt:'2026-10-10T10:24:00+08:00',accounts:[{id:'brand',handle:'向新而行',platform:'DOUYIN'},{id:'slow',handle:'慢生活',platform:'XIAOHONGSHU'},{id:'space',handle:'留白之间',platform:'DOUYIN'},{id:'research',handle:'趋势观察',platform:'XIAOHONGSHU'},{id:'daily',handle:'日常灵感',platform:'DOUYIN'}],records:[],alerts:[{id:'demo-review',type:'数据核对',title:'历史曝光有缺失记录',detail:'本固定样例有1条曝光缺失记录，请核对原始日度记录。'}],contents:[{id:'a1',title:'向新而行 · 品牌叙事',stage:'REVIEW'},{id:'a3',title:'慢生活 · 系列企划',stage:'READY'},{id:'a2',title:'留白之间 · 空间叙事',stage:'EDITING'}],tasks:[{id:'task-edit',title:'品牌视频剪辑',state:'IN_PROGRESS'},{id:'task-check',title:'核对历史曝光记录',state:'TODO'},{id:'task-comment',title:'回复评论',state:'DONE'}]};
for(let n=-179;n<=0;n++)fixture.accounts.forEach((a,i)=>{
 const plays=Math.round(1800+i*470+Math.sin((n+i*2)/5)*600+(n+179)*7),likes=Math.round(plays*.055),comments=Math.round(plays*.012),shares=Math.round(plays*.009),saves=Math.round(plays*.02);
 fixture.records.push({accountId:a.id,day:offset(today,n),plays,exposures:n===-32&&i===1?null:Math.round(plays*1.8),likes,comments,shares,saves,netFollowers:Math.round(plays*.004),isFinal:n<0,observedAt:offset(today,n)+'T10:24:00+08:00'});
});
export const metricKey=id=>({views:'plays',samples:'exposures',interactions:'interactions',interactionRate:'interactions',duration:'netFollowers'})[id]||'plays';
export const metricName=id=>({plays:'播放量',exposures:'曝光量',interactions:'互动量',netFollowers:'净增粉丝'})[metricKey(id)];
export function projectAnalytics(raw,{range='最近 30 天',scope='全部账号'}={}){
 const days=Number(range.match(/\d+/)?.[0]||30),end=raw.today,start=offset(end,1-days),previousStart=offset(start,-days);
 const accounts=raw.accounts.filter(a=>!a.archivedAt&&(scope!=='品牌账号'||a.id==='brand'));
 const ids=new Set(accounts.map(a=>a.id));
 const all=raw.records.filter(r=>ids.has(r.accountId)).map(r=>({...r,interactions:r.likes+r.comments+r.shares+r.saves}));
 const current=all.filter(r=>r.day>=start&&r.day<=end),previous=all.filter(r=>r.day>=previousStart&&r.day<start),currentToday=all.filter(r=>r.day===end);
 const aggregate=rows=>Object.fromEntries(['plays','exposures','interactions','netFollowers'].map(k=>[k,sum(rows,k)]));
 const grouped=(key,label)=>{const values=new Map();current.forEach(r=>{const a=accounts.find(a=>a.id===r.accountId),id=key(a);values.set(id,(values.get(id)||0)+r.plays)});return [...values].map(([id,value])=>({label:label(id),value})).sort((a,b)=>b.value-a.value)};
 const labels=Array.from({length:days},(_,i)=>offset(start,i));
 const series=key=>labels.map(day=>sum(current.filter(r=>r.day===day),key));
 const compareSeries=key=>labels.map(day=>sum(previous.filter(r=>r.day===offset(day,-days)),key));
 const completeness=(rows,expected,key)=>rows.length===expected&&rows.every(r=>r[key]!==null);
 const changeToday=key=>{const before=all.filter(r=>r.day===offset(end,-1));if(!completeness(currentToday,accounts.length,key)||!completeness(before,accounts.length,key))return null;const current=sum(currentToday,key),prior=sum(before,key);return prior===0?null:(current-prior)/prior*100};
 return {days,start,end,accounts,records:current,labels,series,compareSeries,todayMetrics:aggregate(currentToday),windowTotals:aggregate(current),coverage:{recorded:currentToday.length,total:accounts.length},observedAt:currentToday.reduce((max,r)=>r.observedAt>max?r.observedAt:max,''),interactions:['likes','comments','shares','saves'].map((key,i)=>({label:['点赞','评论','分享','收藏'][i],value:sum(current,key)||0})),accountRanking:grouped(a=>a.id,id=>{const a=accounts.find(a=>a.id===id);return `${a.handle} · ${a.platform==='DOUYIN'?'抖音':'小红书'}`}),platformShare:grouped(a=>a.platform,id=>id==='DOUYIN'?'抖音':'小红书'),changeToday,hasMissing:current.some(r=>r.exposures===null),contents:raw.contents,tasks:raw.tasks,alerts:raw.alerts};
}
export function trendProjection(vm,metric,period='month',legend=[true,true]){
 const key=metricKey(metric);let labels=vm.labels,first=vm.series(key),second=vm.compareSeries(key);
 if(period==='day'){labels=labels.slice(-12);first=first.slice(-12);second=second.slice(-12)}
 if(period==='year'){
 const months=[...new Set(labels.map(s=>s.slice(0,7)))];
 const group=values=>months.map(month=>{const part=values.filter((_,i)=>labels[i].startsWith(month));return part.some(v=>v===null)?null:part.reduce((n,v)=>n+v,0)});
 first=group(first);second=group(second);labels=months;
 }
 return {labels:labels.map(s=>s.length===7?s.slice(5)+'月':s.slice(5).replace('-','/')),series:[{name:metricName(metric),values:first,color:0},{name:'上一等长周期',values:second,color:1}].filter((_,i)=>legend[i])};
}
export const designAddon={availability:'DESIGN_FIXTURE',source:'补充方案视觉样例，未采集真实事件',devices:[{label:'桌面',value:54.6},{label:'移动',value:38.7},{label:'平板',value:6.7}]};
