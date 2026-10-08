import { canAddResearchAccount } from "@/server/experience-account";
import { getApiWorkspaceContext, apiError } from "@/server/api-access";
import { researchApiError } from "@/server/research/api";
import { importBenchmarkHomepage } from "@/server/research/benchmark-import";
export async function POST(request:Request) {
  const context=await getApiWorkspaceContext();
  if(!context) return apiError("UNAUTHORIZED",401);
  if(request.headers.get("origin")!==new URL(request.url).origin) return apiError("ORIGIN_DENIED",403,"请从当前工作台操作。");
  if(!canAddResearchAccount(context.role,context.session.user)) return apiError("FORBIDDEN",403);
  try { return Response.json(await importBenchmarkHomepage({workspaceId:context.workspace.id,userId:context.session.user.id},await request.json())); }
  catch(error) { return researchApiError(error); }
}
