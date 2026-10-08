import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { accountApiError, rejectCrossOrigin } from "@/server/account-api";
import { changeMember } from "@/server/account-space";

async function mutate(request: Request, route: { params: Promise<{ id: string }> }, remove: boolean) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401, "请重新登录或选择可用的公司空间。");
  try { return Response.json(await changeMember(context.workspace.id, context.session.user.id, (await route.params).id, remove ? null : await request.json(), remove)); }
  catch (error) { return accountApiError(error); }
}
export const PATCH = (request: Request, route: { params: Promise<{ id: string }> }) => mutate(request, route, false);
export const DELETE = (request: Request, route: { params: Promise<{ id: string }> }) => mutate(request, route, true);
