import { ZodError } from "zod";
import { apiError } from "./api-access";
import { AccountSpaceError } from "./account-space";

export function accountApiError(error: unknown) {
  if (error instanceof AccountSpaceError) return apiError("ACCOUNT_OPERATION_FAILED", error.status, error.message);
  if (error instanceof ZodError) return apiError("INVALID_INPUT", 400, "请检查姓名、邮箱、角色和密码格式。初始密码须为 8–128 位。");
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return apiError("CONFLICT", 409, "账号已存在，请刷新后重试。");
  return apiError("ACCOUNT_OPERATION_FAILED", 500, "操作未完成，请稍后重试。");
}

export function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return apiError("FORBIDDEN", 403, "请求来源无效，请刷新页面后重试。");
  if (!["GET", "HEAD", "OPTIONS", "DELETE"].includes(request.method) && !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return apiError("UNSUPPORTED_MEDIA_TYPE", 415, "请使用应用页面提交操作。");
  if (origin && origin !== new URL(request.url).origin) return apiError("FORBIDDEN", 403, "请求来源无效，请刷新页面后重试。");
  return null;
}
