export class IngestProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "IngestProviderError";
  }
}
