import { LLMError } from "@content-center/providers";

const configurationErrors = new Set<LLMError["code"]>([
  "KIMI_NOT_CONFIGURED",
  "KIMI_MODEL_ID_MISSING",
  "LLM_NOT_CONFIGURED",
  "LLM_DISABLED",
]);

export function isLlmConfigurationError(error: LLMError) {
  return configurationErrors.has(error.code);
}

export function llmApiStatus(error: LLMError) {
  if (isLlmConfigurationError(error)) return 409;
  if (error.code === "LLM_RATE_LIMITED") return 429;
  if (error.code === "LLM_TIMEOUT") return 504;
  if (error.code === "LLM_CONTEXT_TOO_LARGE") return 413;
  if (error.code === "LLM_UNSUPPORTED_INPUT") return 400;
  return 502;
}
