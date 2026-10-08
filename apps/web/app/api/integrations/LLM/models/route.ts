import { IntegrationService } from "@content-center/integrations";
import { isLocalReviewOffline, providerFetch } from "@content-center/providers";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { integrationApiError } from "@/server/integration-api";
export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (!["OWNER", "ADMIN"].includes(context.role)) return apiError("FORBIDDEN", 403);
  if (isLocalReviewOffline()) return apiError("EXTERNAL_CALLS_DISABLED", 403, "当前本机已暂停外部服务调用；模型配置仍可查看和保存，读取服务商模型需先明确恢复外部调用。");
  let config: Awaited<ReturnType<IntegrationService["getDecryptedIntegrationConfig"]>>;
  try { config = await new IntegrationService().getDecryptedIntegrationConfig(context.workspace.id, "LLM"); }
  catch (error) { return integrationApiError(error); }
  if (!config) return apiError("NOT_CONFIGURED", 409, "请先保存并启用模型服务。");
  try {
    const response = await providerFetch(String(config.baseUrl).replace(/\/$/, "") + "/models", { headers: { authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(20000) });
    if ([401, 403].includes(response.status)) return apiError("MODEL_LIST_AUTH_FAILED", 502, "服务商拒绝了模型目录授权，请核对已保存配置及目录权限；这不是本机登录权限错误。");
    if (!response.ok) return apiError("MODEL_LIST_UNAVAILABLE", 502, "服务商未返回模型列表，请检查配置，也可手动填写实际 Model ID。");
    const body = await response.json() as { data?: Array<{ id?: unknown; name?: unknown; display_name?: unknown }> };
    if (!Array.isArray(body.data)) throw new Error("INVALID_MODELS");
    const seen = new Set<string>();
    const items = body.data.slice(0, 500).flatMap(item => { if (typeof item.id !== "string" || !item.id || item.id.length > 200 || seen.has(item.id)) return []; seen.add(item.id); return [{ id: item.id, label: String(item.display_name || item.name || item.id).slice(0, 200) }]; });
    return Response.json({ items }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return apiError("MODEL_LIST_TIMEOUT", 504, "读取服务商模型目录超时，请稍后重试；不代表配置已被删除。");
    return apiError("MODEL_LIST_UNAVAILABLE", 502, "模型列表读取失败，可稍后重试或手动填写服务商提供的 Model ID。"); }
}
