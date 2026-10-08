import { LLMError } from "@content-center/providers";
import { NextResponse } from "next/server";
import { projectApiError } from "../project-api";
import { llmApiStatus } from "../ai/llm-api-status";
import { DeepContentPackageError } from "./service";
import { GPTDraftImportError } from "./gpt-draft-import";
import { GPTTaskPackageError } from "./gpt-task-package";

export function deepContentApiError(error: unknown) {
  const project = projectApiError(error);
  if (project) return project;
  if (error instanceof DeepContentPackageError) {
    const status = error.code === "DEEP_PACKAGE_NOT_FOUND" ? 404 : error.code === "DEEP_PACKAGE_INVALID_INPUT" ? 400 : 409;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  if (error instanceof GPTTaskPackageError || error instanceof GPTDraftImportError) return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
  if (error instanceof LLMError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: llmApiStatus(error) });
  }
  return NextResponse.json({ error: "DEEP_CONTENT_OPERATION_FAILED", message: "深度创作操作失败，请重试。" }, { status: 500 });
}
