import "server-only";
import { db } from "@content-center/db";
import { isLocalReviewOffline } from "@content-center/providers";
import { z } from "zod";
import { addBenchmark, getBenchmarkWorks, getDiscoveryAccountDetail } from "../discovery/service";
import { researchMember, ResearchError, type ResearchActor } from "./access";
import { parseBenchmarkHomepage } from "./benchmark-workbench-math";
import { researchObjectAction } from "./preferences";
const inputSchema = z.object({url:z.string().min(1).max(2000),purpose:z.enum(["teacher","reference"])}).strict();
export async function importBenchmarkHomepage(actor:ResearchActor, value:unknown) {
  await researchMember(actor,true);
  const input=inputSchema.parse(value);
  let identity:ReturnType<typeof parseBenchmarkHomepage>;
  try { identity=parseBenchmarkHomepage(input.url); } catch(error) { throw new ResearchError("INVALID_HOMEPAGE",error instanceof Error ? error.message : "主页无效",400); }
  const existing=await db.benchmarkAccount.findUnique({where:{workspaceId_platform_externalAccountId:{workspaceId:actor.workspaceId,platform:identity.platform,externalAccountId:identity.externalId}},select:{id:true,name:true,enabled:true}});
  if(existing) {
    if(!existing.enabled) throw new ResearchError("ACCOUNT_DISABLED","该账号已停用，请先在账号管理中核对，未新建重复记录。",409);
    await researchObjectAction(actor,{kind:input.purpose==="teacher"?"BENCHMARK_TEACHER":"BENCHMARK_REFERENCE",key:existing.id,action:"FOLLOW"});
    return {item:existing,existing:true,sync:"UNCHANGED"};
  }
  // queryUser documents unique_id / short_id / uid, not a homepage sec_user_id.
  if(identity.platform==="DOUYIN" && identity.externalId.startsWith("MS4w")) throw new ResearchError("ACCOUNT_IDENTITY_UNSUPPORTED","已识别抖音主页，但当前身份接口不支持仅凭主页 sec_user_id 新增账号；需要先接通可核实的抖音号或 uid 识别路径。本次未创建账号、未调用第三方。",409);
  if(isLocalReviewOffline()) throw new ResearchError("BENCHMARK_INTEGRATION_PENDING","平台身份与近期作品同步尚待授权接入；本次没有创建手填账号，也没有调用第三方。",409);
  const detail=await getDiscoveryAccountDetail({...actor,platform:identity.platform,accountId:identity.externalId});
  const account=detail.items[0];
  if(!account || account.platform!==identity.platform || account.externalId!==identity.externalId || !account.name.trim()) throw new ResearchError("ACCOUNT_IDENTITY_MISMATCH","平台返回的身份不一致，未添加账号。",409);
  let item;
  try { item=await addBenchmark({...actor,account}); } catch(error) {
    // Concurrent imports resolve the unique identity instead of adding another account.
    item=await db.benchmarkAccount.findUnique({where:{workspaceId_platform_externalAccountId:{workspaceId:actor.workspaceId,platform:identity.platform,externalAccountId:identity.externalId}}});
    if(!item) throw error;
  }
  await researchObjectAction(actor,{kind:input.purpose==="teacher"?"BENCHMARK_TEACHER":"BENCHMARK_REFERENCE",key:item.id,action:"FOLLOW"});
  try { const page=await getBenchmarkWorks({...actor,benchmarkId:item.id,sort:"LATEST",offset:0}); return {item:{id:item.id,name:item.name},existing:false,sync:"LATEST_PAGE",count:page.items.length,coverage:page.coverage}; }
  catch { return {item:{id:item.id,name:item.name},existing:false,sync:"FAILED",message:"账号身份已保存；近期作品同步失败，旧数据保留，可稍后单独重试。"}; }
}
