import { RedFoxError } from "@content-center/providers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DiscoveryServiceError } from "./service";

export function discoveryApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "请检查输入内容。" }, { status: 400 });
  if (error instanceof DiscoveryServiceError) {
    const status = error.code === "DISCOVERY_NOT_FOUND" ? 404 : error.code === "DISCOVERY_DUPLICATE" || error.code === "IDEA_REFERENCES_REQUIRE_COLLECTION" ? 409 : error.code === "REDFOX_DISABLED" ? 409 : 503;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof RedFoxError) {
    const status = error.code === "REDFOX_QUOTA_EXCEEDED" ? 402 : error.code === "REDFOX_RATE_LIMITED" ? 429 : error.code === "REDFOX_AUTH_FAILED" ? 503 : error.httpStatus && error.httpStatus >= 500 ? 502 : 400;
    const message = error.code === "REDFOX_QUOTA_EXCEEDED" ? "RedFox 积分余额不足，请充值或在设置中更换有余额的 API Key。" : error.code === "REDFOX_RATE_LIMITED"
      ? "内容数据服务当前请求较多，请稍后重试。"
      : error.code === "REDFOX_AUTH_FAILED"
        ? "内容数据服务配置已失效，请联系管理员。"
        : "内容数据服务暂时不可用，请稍后重试。";
    return NextResponse.json({ error: error.code, message }, { status });
  }
  return NextResponse.json({ error: "DISCOVERY_OPERATION_FAILED", message: "操作未完成，请稍后重试。" }, { status: 500 });
}
