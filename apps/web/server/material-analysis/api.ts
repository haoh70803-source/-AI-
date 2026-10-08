import { LLMError } from "@content-center/providers";
import { NextResponse } from "next/server";
import { llmApiStatus } from "../ai/llm-api-status";
import { MaterialAnalysisError } from "./service";

export function materialAnalysisApiError(error: unknown) {
  if (error instanceof MaterialAnalysisError) {
    const status = error.code === "SOURCE_NOT_FOUND" || error.code === "ANALYSIS_NOT_FOUND" ? 404
      : error.code === "ANALYSIS_ALREADY_PROCESSING" ? 409
        : error.code === "INVALID_INPUT" || error.code === "TRANSCRIPT_REQUIRED" ? 400
          : 503;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof LLMError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: llmApiStatus(error) });
  }
  return null;
}
