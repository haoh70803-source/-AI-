import {isLocalReviewOffline} from "@content-center/providers";
import {getApiWorkspaceContext,apiError} from "@/server/api-access";
import {canAddResearchAccount} from "@/server/experience-account";
import {getBenchmarkWorks} from "@/server/discovery/service";
import {discoveryApiError} from "@/server/discovery/api";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const context=await getApiWorkspaceContext();if(!context)return apiError("UNAUTHORIZED",401);
 if(request.headers.get("origin")!==new URL(request.url).origin)return apiError("ORIGIN_DENIED",403);
 if(!canAddResearchAccount(context.role,context.session.user))return apiError("FORBIDDEN",403);
 if(isLocalReviewOffline())return apiError("BENCHMARK_INTEGRATION_PENDING",409,"平台近期作品同步尚待授权接入，未调用第三方；已有作品、阅读状态和报告保持。");
 try{const{id}=await params;return Response.json(await getBenchmarkWorks({workspaceId:context.workspace.id,userId:context.session.user.id,benchmarkId:id,sort:"LATEST",offset:0}));}catch(error){return discoveryApiError(error);}
}
