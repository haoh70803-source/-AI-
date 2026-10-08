import { LLMError } from "@content-center/providers";
import { NextResponse } from "next/server";
import { projectApiError } from "../project-api";
import { AIServiceError } from "./ai-run-service";
import { llmApiStatus } from "./llm-api-status";
import { UnifiedCreativeAnalysisError } from "../unified-analysis/service";
import { StudioQuickActionError } from "../studio/quick-actions";
import { AIControlError } from "./control/contracts";

export function aiApiError(error: unknown) {
  const project = projectApiError(error);
  if (project) return project;
  if (error instanceof AIServiceError) {
    const status = error.code === "AI_RUN_NOT_FOUND" ? 404 : error.code === "AI_INVALID_INPUT" ? 400 : 409;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof UnifiedCreativeAnalysisError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "UNIFIED_ANALYSIS_IN_PROGRESS" ? 409 : 422 });
  }
  if (error instanceof StudioQuickActionError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "QUICK_ACTION_NOT_FOUND" ? 404 : error.code === "QUICK_ACTION_NOT_READY" ? 422 : 409 });
  if (error instanceof AIControlError) {
    const status = error.code === "OUT_OF_SCOPE" || error.code === "NO_CONTEXT" || error.code === "FACT_BLOCKED" || error.code === "INVALID_OUTPUT" ? 422 : error.code === "PERMISSION_DENIED" ? 403 : error.code === "RATE_LIMITED" ? 429 : error.code === "TIMEOUT" ? 504 : error.code === "PROVIDER_UNAVAILABLE" || error.code === "MODEL_UNAVAILABLE" ? 503 : 500;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof LLMError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: llmApiStatus(error) });
  }
  return NextResponse.json({ error: "LLM_GENERATION_FAILED", message: "AI 生成失败，请重试。" }, { status: 500 });
}
