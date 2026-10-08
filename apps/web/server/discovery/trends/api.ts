import { LLMError, RedFoxError } from "@content-center/providers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { TrendServiceError } from "./service";

export function trendApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "请检查趋势筛选或选题内容。" }, { status: 400 });
  if (error instanceof TrendServiceError) {
    const status = error.code === "TREND_NOT_FOUND" ? 404
      : error.code === "TREND_RATE_LIMITED" ? 429
        : error.code === "TREND_KEYWORD_REQUIRED" || error.code === "TREND_DUPLICATE_IDEA" ? 409
          : error.code === "TREND_PROVIDER_UNCONFIGURED" || error.code === "TREND_AI_NOT_CONFIGURED" ? 503
            : 502;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof RedFoxError) {
    const status = error.code === "REDFOX_RATE_LIMITED" ? 429 : error.code === "REDFOX_AUTH_FAILED" ? 503 : 502;
    return NextResponse.json({ error: error.code === "REDFOX_RATE_LIMITED" ? "TREND_RATE_LIMITED" : "TREND_FETCH_FAILED", message: error.code === "REDFOX_RATE_LIMITED" ? "趋势服务请求较多，请稍后再试。" : "趋势数据暂时获取失败，请稍后重试。" }, { status });
  }
  if (error instanceof LLMError) return NextResponse.json({ error: "TREND_AI_GENERATION_FAILED", message: "选题建议生成失败，请稍后重试。" }, { status: 502 });
  return NextResponse.json({ error: "TREND_FETCH_FAILED", message: "趋势操作未完成，请稍后重试。" }, { status: 500 });
}
