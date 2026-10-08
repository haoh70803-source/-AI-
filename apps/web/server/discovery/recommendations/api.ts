import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DiscoveryServiceError } from "../service";
import { RecommendationServiceError } from "./service";

export function recommendationApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: "INVALID_INPUT", message: "请检查操作内容。" }, { status: 400 });
  if (error instanceof RecommendationServiceError) {
    const status = error.code === "RECOMMENDATION_FORBIDDEN" ? 403 : error.code === "RECOMMENDATION_NOT_FOUND" ? 404 : error.code === "RECOMMENDATION_NO_DATA" ? 409 : 502;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof DiscoveryServiceError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "DISCOVERY_NOT_FOUND" ? 404 : 409 });
  return NextResponse.json({ error: "RECOMMENDATION_FAILED", message: "今日内容线索操作未完成，请稍后重试。" }, { status: 500 });
}
