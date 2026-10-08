import { NextResponse } from "next/server";
import { apiError, getSystemAdminApiContext } from "@/server/api-access";
import { getSystemDoubaoAdminView, saveSystemDoubaoConfig } from "@/server/admin/system-providers";
import { integrationApiError } from "@/server/integration-api";

type RouteContext = { params: Promise<{ provider: string }> };

const CONFIGURABLE_SYSTEM_PROVIDER = "DOUBAO_ASR";

export async function GET(_request: Request, route: RouteContext) {
  const context = await getSystemAdminApiContext();
  if ("response" in context) return context.response;
  const { provider } = await route.params;
  if (provider.toUpperCase() !== CONFIGURABLE_SYSTEM_PROVIDER) {
    return apiError("UNSUPPORTED_SYSTEM_PROVIDER", 405, "当前仅豆包录音文件识别 2.0 支持在线系统配置。");
  }
  try {
    return NextResponse.json(await getSystemDoubaoAdminView());
  } catch (error) {
    return integrationApiError(error);
  }
}

export async function PUT(request: Request, route: RouteContext) {
  const context = await getSystemAdminApiContext();
  if ("response" in context) return context.response;
  const { provider } = await route.params;
  if (provider.toUpperCase() !== CONFIGURABLE_SYSTEM_PROVIDER) {
    return apiError("ENV_MANAGED_PROVIDER", 405, "该生产 Provider 由服务端环境变量管理，不能在线修改。");
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("config" in body)) {
    return apiError("INVALID_INTEGRATION_CONFIG", 400, "请求体必须包含 config 对象。");
  }
  try {
    const result = await saveSystemDoubaoConfig(context.user.id, body.config);
    return NextResponse.json(result);
  } catch (error) {
    return integrationApiError(error);
  }
}
