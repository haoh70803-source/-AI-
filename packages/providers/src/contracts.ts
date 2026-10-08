import type {
  ProviderInput,
  LLMGenerateInput,
  LLMStructuredResult,
  LLMStreamOptions,
  LLMTextResult,
  ProviderResult,
  PublishingTaskStatus,
  SourceMetadata,
  FetchedSourceMedia,
  SourceIngestInput,
  SourceIngestResult,
  TranscriptionInput,
  TranscriptResult,
} from "./types";
import type { Readable } from "node:stream";
import type { ZodType } from "zod";

export interface SourceProvider {
  supports(input: string): boolean;
  resolve(input: string): Promise<ProviderResult<SourceMetadata>>;
  fetchMetadata(input: string): Promise<ProviderResult<SourceMetadata>>;
  fetchMedia(input: string): Promise<ProviderResult<FetchedSourceMedia>>;
}

export interface IngestSourceProvider extends SourceProvider {
  readonly providerName: string;
  ingest(input: SourceIngestInput): Promise<ProviderResult<SourceIngestResult>>;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<ProviderResult<TranscriptResult>>;
}

export interface LLMProvider {
  generateText(input: LLMGenerateInput): Promise<ProviderResult<LLMTextResult>>;
  streamText(input: LLMGenerateInput, options: LLMStreamOptions): Promise<ProviderResult<LLMTextResult>>;
  generateStructured<T>(input: LLMGenerateInput, schema: ZodType<T>): Promise<ProviderResult<LLMStructuredResult<T>>>;
  generate(input: ProviderInput): Promise<ProviderResult<{ text: string }>>;
  rewrite(input: ProviderInput): Promise<ProviderResult<{ text: string }>>;
  summarize(input: ProviderInput): Promise<ProviderResult<{ text: string }>>;
  classify(input: ProviderInput): Promise<ProviderResult<{ labels: string[] }>>;
  adapt(input: ProviderInput & { platform: string }): Promise<ProviderResult<{ text: string }>>;
}

export interface PublishingProvider {
  validate(input: { content: string }): Promise<ProviderResult<{ valid: boolean; issues: string[] }>>;
  publish(input: { content: string }): Promise<ProviderResult<{ status: PublishingTaskStatus; externalId?: string }>>;
  getStatus(input: { externalId: string }): Promise<ProviderResult<{ status: PublishingTaskStatus }>>;
}

export interface StorageProvider {
  upload(input: {
    key: string;
    body: Uint8Array | Readable;
    contentType?: string;
    contentLength?: number;
    assetScope?: StorageAssetScope;
  }): Promise<ProviderResult<{ key: string }>>;
  delete(key: string, assetScope?: StorageAssetScope): Promise<ProviderResult<{ key: string }>>;
  getSignedUrl(key: string, expiresInSeconds?: number, options?: StorageSignedUrlOptions): Promise<ProviderResult<{ url: string }>>;
}

export type StorageAssetScope = {
  workspaceId: string;
  sourceItemId: string;
  assetId: string;
};

export type StorageSignedUrlOptions = {
  disposition?: "inline" | "attachment";
  filename?: string;
  purpose?: "browser" | "doubao";
  assetScope?: StorageAssetScope;
};
