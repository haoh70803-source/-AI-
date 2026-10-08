import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { settingsDiagnostics } from "@/server/settings-diagnostics";
export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401, "请重新登录。");
  return Response.json(await settingsDiagnostics(context.workspace.id), { headers: { "cache-control": "no-store" } });
}
