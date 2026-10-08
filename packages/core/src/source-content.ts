export type SourceContentSource = "TRANSCRIPT" | "EXTRACTED_TEXT";

export type SourceContentInput = {
  sourceType: string;
  rawText?: string | null;
  sourceUpdatedAt: Date;
  transcript?: {
    id: string;
    fullText: string;
    segments: unknown;
    updatedAt: Date;
  } | null;
};

export type SourceContent = {
  contentText: string;
  contentSource: SourceContentSource;
  updatedAt: Date;
  version: string;
  transcriptId: string | null;
  segments: unknown;
};

export function resolveSourceContent(input: SourceContentInput): SourceContent | null {
  const media = input.sourceType === "VIDEO" || input.sourceType === "AUDIO";
  const transcriptText = input.transcript?.fullText.trim() ?? "";
  const rawText = input.rawText?.trim() ?? "";
  const contentText = media ? transcriptText || rawText : rawText || transcriptText;
  // IMAGE is intentionally media-only until a stable Vision route is enabled.
  if (!contentText) return null;
  const useTranscript = Boolean(transcriptText) && (media || !rawText);
  const updatedAt = useTranscript ? input.transcript!.updatedAt : input.sourceUpdatedAt;
  const contentSource: SourceContentSource = useTranscript ? "TRANSCRIPT" : "EXTRACTED_TEXT";
  return {
    contentText,
    contentSource,
    updatedAt,
    version: `${contentSource}:${updatedAt.toISOString()}`,
    transcriptId: useTranscript ? input.transcript?.id ?? null : null,
    segments: useTranscript ? input.transcript?.segments ?? [] : [],
  };
}
