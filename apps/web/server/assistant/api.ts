import { NextResponse } from "next/server";
import { AIControlError } from "../ai/control/contracts";
import { AssistantServiceError } from "./service";

export function assistantApiError(error: unknown) {
  if (error instanceof AssistantServiceError) {
    const status = error.code === "PROJECT_NOT_FOUND" || error.code === "MESSAGE_NOT_FOUND" ? 404 : error.code === "PERMISSION_DENIED" ? 403 : 400;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof AIControlError) {
    const status = error.code === "OUT_OF_SCOPE" || error.code === "NO_CONTEXT" || error.code === "FACT_BLOCKED" ? 422 : error.code === "PERMISSION_DENIED" ? 403 : error.code === "RATE_LIMITED" ? 429 : error.code === "TIMEOUT" ? 504 : 503;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  return NextResponse.json({ error: "UNKNOWN", message: "AI 处理失败，请稍后重试。" }, { status: 500 });
}
