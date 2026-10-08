import { db, findIngestJobForUser } from "@content-center/db";
import { cancelIngestJob } from "@content-center/worker/job-recovery";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
export async function POST(_request: Request, route: {params:Promise<{id:string}>}) {
  const context=await getApiWorkspaceContext();
  if(!context)return apiError("UNAUTHORIZED",401);
  if(context.role==="VIEWER")return apiError("FORBIDDEN",403);
  const {id}=await route.params;
  const job=await findIngestJobForUser(db,{userId:context.session.user.id,workspaceId:context.workspace.id,jobId:id});
  if(!job)return apiError("NOT_FOUND",404);
  const result=await cancelIngestJob({jobId:job.id,workspaceId:job.workspaceId,sourceItemId:job.sourceItemId,requestedById:context.session.user.id});
  if(result.status!=="cancelled")return apiError("JOB_NOT_CANCELLABLE",409,"外部处理已开始或任务已结束，请等待结果。");
  return NextResponse.json({jobId:job.id,status:"CANCELLED"});
}
