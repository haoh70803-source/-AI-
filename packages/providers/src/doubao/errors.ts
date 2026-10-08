export type DoubaoErrorCode =
  | "DOUBAO_NOT_CONFIGURED"
  | "DOUBAO_DISABLED"
  | "DOUBAO_AUTH_FAILED"
  | "DOUBAO_PERMISSION_DENIED"
  | "DOUBAO_RATE_LIMITED"
  | "DOUBAO_TIMEOUT"
  | "DOUBAO_SERVER_ERROR"
  | "DOUBAO_INVALID_RESPONSE"
  | "DOUBAO_INVALID_AUDIO"
  | "DOUBAO_EMPTY_TRANSCRIPT"
  | "ASR_AUDIO_TOO_LARGE"
  | "ASR_AUDIO_TOO_LONG"
  | "ASR_AUDIO_NOT_PUBLICLY_REACHABLE";

export class DoubaoError extends Error {
  constructor(
    readonly code: DoubaoErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly details: { httpStatus?: number; statusCode?: string; logId?: string } = {},
  ) {
    super(message);
    this.name = "DoubaoError";
  }
}

export function doubaoErrorMetadata(error: unknown) {
  return error instanceof DoubaoError
    ? { statusCode: error.details.statusCode, logId: error.details.logId }
    : {};
}
