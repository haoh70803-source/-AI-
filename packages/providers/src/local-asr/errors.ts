export type LocalAsrErrorCode =
  | "LOCAL_REVIEW_OFFLINE"
  | "LOCAL_ASR_NOT_RUNNING"
  | "LOCAL_ASR_MODEL_NOT_INSTALLED"
  | "LOCAL_ASR_MODEL_LOAD_FAILED"
  | "LOCAL_ASR_TRANSCRIPTION_FAILED"
  | "LOCAL_ASR_TIMEOUT"
  | "LOCAL_ASR_INVALID_RESPONSE"
  | "LOCAL_ASR_UNSUPPORTED_HARDWARE";

export class LocalAsrError extends Error {
  constructor(
    readonly code: LocalAsrErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LocalAsrError";
  }
}

