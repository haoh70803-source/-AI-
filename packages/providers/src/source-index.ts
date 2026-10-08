/**
 * A small, deterministic index over the text that was actually persisted on a
 * Transcript.  The short `ref` is only a prompt-local handle; the remaining
 * fields keep enough provenance to resolve it without asking a model to infer
 * a location.
 */

export type SourceRefKind = "REAL_SEGMENT" | "TEXT_BLOCK";
export const SOURCE_INDEX_ALGORITHM_VERSION = "source-index-v1" as const;

export type SourceRef = {
  ref: string;
  transcriptId: string;
  transcriptVersion: string;
  sourceIndexVersion: typeof SOURCE_INDEX_ALGORITHM_VERSION;
  kind: SourceRefKind;
  /** The original zero-based segment/block position. */
  index: number;
  text: string;
  /** UTF-16 offsets into the persisted fullText; end is exclusive. */
  startOffset?: number;
  endOffset?: number;
  /** Present only when the persisted segment supplied real timestamps. */
  startMs?: number;
  endMs?: number;
};

export type TranscriptSourceIndexInput = {
  id?: string;
  transcriptId?: string;
  version?: string | number | Date;
  transcriptVersion?: string | number | Date;
  updatedAt?: string | number | Date;
  fullText?: string | null;
  segments?: unknown;
};

export type TranscriptSourceIndex = {
  transcriptId: string;
  transcriptVersion: string;
  sourceIndexVersion: typeof SOURCE_INDEX_ALGORITHM_VERSION;
  refs: SourceRef[];
  /** Prompt-facing short handles; the entries themselves remain in `refs`. */
  availableSourceRefs: string[];
};

const TEXT_BLOCK_MAX_CHARS = 480;
const SENTENCE_ENDINGS = new Set(["。", "！", "？", "!", "?", "；", ";", "…", ":", "："]);
const CLOSING_MARKS = new Set(["”", "’", "」", "』", "）", ")", "】", "]", "》", "〉", "'", '"']);

type TextRange = { start: number; end: number };

function asVersion(value: string | number | Date | undefined): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return undefined;
}

function transcriptVersion(input: TranscriptSourceIndexInput): string {
  return asVersion(input.transcriptVersion)
    ?? asVersion(input.version)
    ?? asVersion(input.updatedAt)
    ?? "unknown";
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function sourceText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sourceSegments(value: unknown): Array<{ index: number; text: string; startMs?: number; endMs?: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const row = candidate as Record<string, unknown>;
    const text = sourceText(row.text);
    if (!text) return [];
    const startMs = finiteNonNegative(row.startMs);
    const endMs = finiteNonNegative(row.endMs);
    // A reversed pair is not a trustworthy timestamp. Keep neither value in
    // that case rather than turning malformed ASR metadata into provenance.
    const timestamps = startMs !== undefined && endMs !== undefined && endMs < startMs
      ? {}
      : { ...(startMs !== undefined ? { startMs } : {}), ...(endMs !== undefined ? { endMs } : {}) };
    return [{ index, text, ...timestamps }];
  });
}

function trimRange(text: string, start: number, end: number): TextRange | undefined {
  while (start < end && /\s/u.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/u.test(text[end - 1] ?? "")) end -= 1;
  return start < end ? { start, end } : undefined;
}

function paragraphRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  let paragraphStart = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const atEnd = index === text.length;
    const lineBreak = !atEnd && (text[index] === "\n" || text[index] === "\r");
    if (!atEnd && !lineBreak) continue;
    const paragraph = trimRange(text, paragraphStart, index);
    if (paragraph) ranges.push(paragraph);
    if (text[index] === "\r" && text[index + 1] === "\n") index += 1;
    paragraphStart = index + 1;
  }
  return ranges;
}

function sentenceRanges(text: string, paragraph: TextRange): TextRange[] {
  const ranges: TextRange[] = [];
  let start = paragraph.start;
  for (let index = paragraph.start; index < paragraph.end; index += 1) {
    if (!SENTENCE_ENDINGS.has(text[index] ?? "")) continue;
    let end = index + 1;
    while (end < paragraph.end && SENTENCE_ENDINGS.has(text[end] ?? "")) end += 1;
    while (end < paragraph.end && CLOSING_MARKS.has(text[end] ?? "")) end += 1;
    const range = trimRange(text, start, end);
    if (range) ranges.push(range);
    start = end;
  }
  const last = trimRange(text, start, paragraph.end);
  if (last) ranges.push(last);
  return ranges;
}

function splitLongRange(text: string, range: TextRange): TextRange[] {
  const ranges: TextRange[] = [];
  for (let start = range.start; start < range.end; start += TEXT_BLOCK_MAX_CHARS) {
    const end = Math.min(start + TEXT_BLOCK_MAX_CHARS, range.end);
    const piece = trimRange(text, start, end);
    if (piece) ranges.push(piece);
  }
  return ranges;
}

function textBlockRanges(text: string): TextRange[] {
  const sentences = paragraphRanges(text).flatMap((paragraph) => sentenceRanges(text, paragraph));
  const pieces = sentences.flatMap((range) => splitLongRange(text, range));
  const blocks: TextRange[] = [];
  let current: TextRange | undefined;
  for (const piece of pieces) {
    if (!current) {
      current = { ...piece };
      continue;
    }
    const mergedLength = piece.end - current.start;
    if (mergedLength <= TEXT_BLOCK_MAX_CHARS) {
      current.end = piece.end;
      continue;
    }
    blocks.push(current);
    current = { ...piece };
  }
  if (current) blocks.push(current);
  return blocks;
}

function findSegmentOffset(fullText: string, text: string, from: number): TextRange | undefined {
  const found = fullText.indexOf(text, from);
  return found < 0 ? undefined : { start: found, end: found + text.length };
}

function realSegmentRefs(input: TranscriptSourceIndexInput, transcriptId: string, version: string, fullText: string): SourceRef[] {
  const segments = sourceSegments(input.segments);
  let searchFrom = 0;
  return segments.map((segment, ordinal) => {
    const offset = findSegmentOffset(fullText, segment.text, searchFrom);
    if (offset) searchFrom = offset.end;
    return {
      ref: `S${String(ordinal + 1).padStart(3, "0")}`,
      transcriptId,
      transcriptVersion: version,
      sourceIndexVersion: SOURCE_INDEX_ALGORITHM_VERSION,
      kind: "REAL_SEGMENT" as const,
      index: segment.index,
      text: segment.text,
      ...(offset ? { startOffset: offset.start, endOffset: offset.end } : {}),
      ...(segment.startMs !== undefined ? { startMs: segment.startMs } : {}),
      ...(segment.endMs !== undefined ? { endMs: segment.endMs } : {}),
    };
  });
}

function textBlockRefs(fullText: string, transcriptId: string, version: string): SourceRef[] {
  return textBlockRanges(fullText).map((range, index) => ({
    ref: `T${String(index + 1).padStart(3, "0")}`,
    transcriptId,
    transcriptVersion: version,
    sourceIndexVersion: SOURCE_INDEX_ALGORITHM_VERSION,
    kind: "TEXT_BLOCK" as const,
    index,
    startOffset: range.start,
    endOffset: range.end,
    text: fullText.slice(range.start, range.end),
  }));
}

/** Build prompt-local source refs from persisted Transcript data. */
export function buildTranscriptSourceIndex(input: TranscriptSourceIndexInput): TranscriptSourceIndex {
  const transcriptId = input.transcriptId ?? input.id ?? "unknown";
  const version = transcriptVersion(input);
  const fullText = typeof input.fullText === "string" ? input.fullText : "";
  const refs = realSegmentRefs(input, transcriptId, version, fullText);
  const resolved = refs.length ? refs : textBlockRefs(fullText, transcriptId, version);
  return {
    transcriptId,
    transcriptVersion: version,
    sourceIndexVersion: SOURCE_INDEX_ALGORITHM_VERSION,
    refs: resolved,
    availableSourceRefs: resolved.map(({ ref }) => ref),
  };
}
