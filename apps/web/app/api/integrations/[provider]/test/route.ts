import { isLocalReviewOffline } from "@content-center/providers";
import { systemManagedProvidersEnabled } from "@content-center/integrations";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { rejectCrossOrigin } from "@/server/account-api";
import { configurableProviderOrResponse, integrationApiError } from "@/server/integration-api";
import { testIntegration } from "@/server/integration-test";
const running = new Set<string>();
export async function POST(request: Request, route: { params: Promise<{ provider: string }> }) {
  const rejected = rejectCrossOrigin(request); if (rejected) return rejected;
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401, "请重新登录或选择可用的公司空间。");
  if (systemManagedProvidersEnabled() || !["OWNER", "ADMIN"].includes(context.role)) return apiError("FORBIDDEN", 403, "你没有权限测试公司 API。");
  const parsed = configurableProviderOrResponse((await route.params).provider);
  if ("response" in parsed) return parsed.response;
  if (parsed.provider === "LLM" && isLocalReviewOffline()) return apiError("EXTERNAL_CALLS_DISABLED", 403, "当前本机已暂停外部服务调用；模型配置仍可查看和保存，连接测试需先明确恢复外部调用，可能产生服务费用。");
  const body = z.object({ sampleUrl: z.string().url().max(2000).refine(value => { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }).optional() }).strict().safeParse(await request.json().catch(() => ({})));
  if (!body.success) return apiError("INVALID_INPUT", 400, "请填写有效的公开测试链接。");
  const key = `${context.workspace.id}:${parsed.provider}`;
  if (running.has(key)) return apiError("BUSY", 429, "测试正在进行，请等待结果。");
  running.add(key);
  try { return Response.json(await testIntegration(context.workspace.id, parsed.provider, body.data.sampleUrl), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return integrationApiError(error); }
  finally { running.delete(key); }
}
