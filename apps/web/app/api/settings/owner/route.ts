import { z } from "zod";
import { accountApiError, rejectCrossOrigin } from "@/server/account-api";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { transferWorkspaceOwner } from "@/server/account-space";
export async function POST(request: Request) {
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  const context=await getApiWorkspaceContext();if(!context)return apiError("UNAUTHORIZED",401);
  try{const data=z.object({memberId:z.string().min(1).max(200)}).strict().parse(await request.json());return Response.json(await transferWorkspaceOwner(context.workspace.id,context.session.user.id,data.memberId));}
  catch(error){return accountApiError(error);}
}
