import "server-only";
import { db } from "@content-center/db";
import { researchMember, type ResearchActor } from "./access";
import { buildBenchmarkPerformance } from "../discovery/benchmark-performance";
import { benchmarkBaseline } from "./benchmark-workbench-math";
export async function benchmarkWorkbench(actor: ResearchActor, query: { q?:string; platform?:string; period?:string; accountId?:string; threshold?:string; viral?:string; sort?:string; purpose?:string }) {
  await researchMember(actor);
  const days = query.period === "7" ? 7 : query.period === "all" ? null : 30;
  const threshold = Number(query.threshold) >= 1 && Number(query.threshold) <= 100 ? Number(query.threshold) : 2.5;
  const platforms = ["DOUYIN","XIAOHONGSHU","BILIBILI","YOUTUBE","TIKTOK","WECHAT","GENERIC","OTHER"];
  const accounts = await db.benchmarkAccount.findMany({where:{workspaceId:actor.workspaceId, enabled:true, ...(query.accountId ? {id:query.accountId} : {}),
    ...(platforms.includes(query.platform || "") ? {platform:query.platform as "DOUYIN"} : {}),
    ...(query.q?.trim() ? {name:{contains:query.q.trim().slice(0,100),mode:"insensitive"}} : {})},
    orderBy:[{updatedAt:"desc"},{id:"desc"}],take:100,
    select:{id:true,name:true,platform:true,originalUrl:true,lastSyncedAt:true,externalAccountId:true,
      _count:{select:{contentSnapshots:true}}, collectionRuns:{orderBy:{createdAt:"desc"},take:1,select:{status:true,errorMessage:true,createdAt:true}},
      contentSnapshots:{where:days ? {publishedAt:{gte:new Date(Date.now()-days*86400000),lte:new Date()}} : {},orderBy:[{publishedAt:"desc"},{id:"desc"}],take:200,
        select:{id:true,title:true,url:true,coverUrl:true,metadata:true,publishedAt:true,observedAt:true,platform:true,externalId:true,
          observations:{orderBy:{observedAt:"desc"},take:2,select:{metrics:true,observedAt:true}}}}}});
  const prefs = await db.researchObjectPreference.findMany({where:{...actor,kind:{in:["BENCHMARK_TEACHER","BENCHMARK_REFERENCE"]},followedAt:{not:null}},select:{kind:true,objectKey:true,followedAt:true}});
  const cards = accounts.map(account => {
    const purpose = prefs.filter(p=>p.objectKey===account.id).sort((a,b)=>b.followedAt!.getTime()-a.followedAt!.getTime())[0]?.kind === "BENCHMARK_TEACHER" ? "teacher" : prefs.some(p=>p.objectKey===account.id) ? "reference" : "unset";
    const works = buildBenchmarkPerformance(account.contentSnapshots).items;
    const baseline = benchmarkBaseline(works.map(work=>work.counts.likes));
    const ranked = works.map(work=>({...work,accountId:account.id,accountName:account.name,platform:account.platform,multiple:baseline.median !== null && work.counts.likes !== null ? work.counts.likes / baseline.median : null,baseline:baseline.median,samples:baseline.samples}));
    return {...account,contentSnapshots:undefined,purpose,followers:null,baseline,works:ranked,highCount:ranked.filter(work=>work.multiple !== null && work.multiple >= threshold).length,
      trend:ranked.filter(work=>work.publishedAt && work.counts.likes !== null).sort((a,b)=>new Date(a.publishedAt!).getTime()-new Date(b.publishedAt!).getTime()).map(work=>({id:work.id,likes:work.counts.likes!,title:work.title}))};
  }).filter(card=>!query.purpose || query.purpose==="all" || card.purpose===query.purpose);
  const works = cards.flatMap(card=>card.works).filter(work=>(!query.accountId || work.accountId===query.accountId) && (query.viral!=="viral" || (work.multiple !== null && work.multiple >= threshold)));
  works.sort((a,b)=>query.sort==="time" ? (b.publishedAt ? new Date(b.publishedAt).getTime() : 0)-(a.publishedAt ? new Date(a.publishedAt).getTime() : 0) : query.sort==="heat" ? (b.counts.likes ?? -1)-(a.counts.likes ?? -1) : (b.multiple ?? -1)-(a.multiple ?? -1));
  return {cards,works,days,threshold,bounded:accounts.length===100 || cards.some(card=>card.works.length===200)};
}
