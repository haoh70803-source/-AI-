import { IngestProviderError } from "../ingest-error";

export type RedFoxErrorCode =
  | "REDFOX_NOT_CONFIGURED"
  | "REDFOX_DISABLED"
  | "REDFOX_AUTH_FAILED"
  | "REDFOX_QUOTA_EXCEEDED"
  | "REDFOX_RATE_LIMITED"
  | "REDFOX_BAD_REQUEST"
  | "REDFOX_SERVER_ERROR"
  | "REDFOX_TIMEOUT"
  | "REDFOX_INVALID_RESPONSE"
  | "REDFOX_EMPTY_DATA"
  | "REDFOX_UNSUPPORTED_PLATFORM"
  | "REDFOX_UNSUPPORTED_CONTENT_TYPE"
  | "REDFOX_MEDIA_MISSING"
  | "REDFOX_MEDIA_DOWNLOAD_FAILED"
  | "REDFOX_API_ERROR"
  | "AMBIGUOUS_DOUYIN_URL"
  | "INVALID_DOUYIN_URL"
  | "AMBIGUOUS_REDFOX_URL"
  | "INVALID_REDFOX_URL";

export class RedFoxError extends IngestProviderError {
  constructor(
    code: RedFoxErrorCode,
    message: string,
    retryable: boolean,
    httpStatus?: number,
    readonly providerCode?: string,
    readonly providerRequestId?: string,
  ) {
    super(code, message, retryable, httpStatus);
    this.name = "RedFoxError";
  }
}

export function redFoxErrorMetadata(error: unknown) {
  return error instanceof RedFoxError
    ? { providerCode: error.providerCode, providerRequestId: error.providerRequestId }
    : {};
}
