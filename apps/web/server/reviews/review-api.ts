import { NextResponse } from "next/server";
import { LLMError } from "@content-center/providers";
import { llmApiStatus } from "../ai/llm-api-status";
import { ReviewServiceError } from "./review-service";

export function reviewApiError(error: unknown) {
  if (error instanceof ReviewServiceError) {
    const status = error.code === "REVIEW_FORBIDDEN" ? 403 : error.code === "REVIEW_TARGET_NOT_FOUND" ? 404 : error.code === "REVIEW_COMMENT_REQUIRED" || error.code === "REVIEW_SUBMISSION_INCOMPLETE" ? 400 : 409;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof LLMError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: llmApiStatus(error) });
  }
  return NextResponse.json({ error: "REVIEW_OPERATION_FAILED", message: "审核操作失败，请重试。" }, { status: 500 });
}
