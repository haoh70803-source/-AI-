export type ProviderMode = "REAL" | "MOCK";

export type ProviderResult<T> = {
  providerMode: ProviderMode;
  data: T;
};

export type SourceMetadata = {
  sourceType: string;
  platform?: string;
  url?: string;
  title?: string;
  author?: string;
  description?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  raw?: unknown;
};

export type SourceMediaReference = {
  type: "VIDEO" | "IMAGE";
  url: string;
  index?: number;
};

export type FetchedSourceMedia = {
  body?: Uint8Array;
  contentType?: string;
  media?: SourceMediaReference[];
};

export type TranscriptResult = {
  language?: string;
  durationMs?: number;
  fullText: string;
  segments: Array<{
    startMs: number;
    endMs: number;
    text: string;
  }>;
};

export type TranscriptionInput = {
  audio:
    | { mode: "REMOTE_URL"; url: string }
    | { mode: "BINARY_DATA"; data: Uint8Array };
  contentType?: string;
};

export type ProviderInput = { prompt: string };

export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } }
  | { type: "image"; source: { type: "base64"; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } }
  | { type: "image"; source: { type: "file"; fileId: string } };

export type LLMGenerateInput = ProviderInput & {
  systemPrompt?: string;
  /** Prior dialogue; policy and the current prompt are supplied separately. */
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  content?: LLMContentBlock[];
  temperature?: number;
  maxCompletionTokens?: number;
  structuredOutput?: { strategy?: "AUTO" | "JSON_OBJECT"; preferJsonSchema?: boolean; schemaName?: string };
};

export type LLMTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type LLMTextResult = {
  text: string;
  model: string;
  providerRequestId?: string;
  finishReason?: string;
  usage?: LLMTokenUsage;
};

export type LLMStreamOptions = {
  signal?: AbortSignal;
  onDelta: (delta: string) => void | Promise<void>;
};

export type LLMStructuredResult<T> = LLMTextResult & {
  value: T;
};

export type SourceIngestInput = {
  value: string;
  title?: string;
  notes?: string;
};

export type SourceIngestResult = {
  metadata: SourceMetadata;
  rawText: string;
  transcript?: TranscriptResult;
};

export type PublishingTaskStatus =
  | "DRAFT"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "QUEUED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELLED"
  | "MOCK";
