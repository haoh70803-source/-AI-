export type LLMErrorCode =
  | "LOCAL_REVIEW_OFFLINE"
  | "KIMI_NOT_CONFIGURED"
  | "KIMI_MODEL_ID_MISSING"
  | "KIMI_AUTH_FAILED"
  | "KIMI_MODEL_UNAVAILABLE"
  | "LLM_NOT_CONFIGURED"
  | "LLM_DISABLED"
  | "LLM_AUTH_FAILED"
  | "LLM_RATE_LIMITED"
  | "LLM_TIMEOUT"
  | "LLM_SERVER_ERROR"
  | "LLM_INVALID_RESPONSE"
  | "LLM_CONTEXT_TOO_LARGE"
  | "LLM_UNSUPPORTED_INPUT"
  | "LLM_GENERATION_FAILED";

export class LLMError extends Error {
  constructor(
    readonly code: LLMErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly details: {
      httpStatus?: number;
      providerRequestId?: string;
      actualModel?: string;
      finishReason?: string;
      validationIssues?: Array<{ path: string; code: string; expected?: string; receivedType: string }>;
      returnedRootKeys?: string[];
      returnedFirstLevelObjectKeys?: Record<string, string[]>;
      rawCandidateCount?: number;
      validCandidateCount?: number;
      droppedCandidateCount?: number;
      truncatedToFive?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "LLMError";
  }
}
