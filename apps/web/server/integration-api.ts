import "server-only";

import {
  IntegrationSecretError,
  IntegrationServiceError,
  assertConfigurableProvider,
} from "@content-center/integrations";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiError } from "./api-access";

export function configurableProviderOrResponse(value: string) {
  try {
    return { provider: assertConfigurableProvider(value.toUpperCase()) };
  } catch {
    return { response: apiError("UNSUPPORTED_INTEGRATION", 404) };
  }
}

export function integrationApiError(error: unknown) {
  if (error instanceof IntegrationSecretError) {
    const status = error.code === "INTEGRATION_ENCRYPTION_NOT_CONFIGURED" ? 503 : 500;
    return apiError(error.code, status, "密钥配置无法使用，请检查填写内容或联系系统管理员。");
  }
  if (error instanceof IntegrationServiceError) {
    const status = error.code === "INTEGRATION_NOT_FOUND" ? 404 : error.code === "INTEGRATION_SECRET_REQUIRED" ? 400 : 404;
    return apiError(error.code, status, error.code === "INTEGRATION_SECRET_REQUIRED" ? "请填写 API 密钥；更换服务或接口地址时需要重新输入。" : "配置不存在或暂时不可用，请刷新后重试。");
  }
  if (error instanceof Error && error.message === "INVALID_PROVIDER_URL") return apiError("INVALID_INTEGRATION_CONFIG", 400, "请使用不含凭据或查询参数的 API 地址。");
  if (error instanceof ZodError) return apiError("INVALID_INTEGRATION_CONFIG", 400, "配置内容格式不正确。");
  return apiError("INTEGRATION_OPERATION_FAILED", 500, "配置操作失败。");
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}
