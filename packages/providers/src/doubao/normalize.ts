import { DoubaoError } from "./errors";
import type { DoubaoFlashResponse } from "./schemas";
import type { TranscriptResult } from "../types";

export function normalizeDoubaoTranscript(response: DoubaoFlashResponse): TranscriptResult {
  const fullText = response.result.text.trim();
  if (!fullText) throw new DoubaoError("DOUBAO_EMPTY_TRANSCRIPT", "豆包没有返回可用转写文本。", false);
  return {
    durationMs: response.audio_info?.duration,
    fullText,
    segments: response.result.utterances
      .map((utterance) => ({
        startMs: utterance.start_time,
        endMs: utterance.end_time,
        text: utterance.text.trim(),
      }))
      .filter((segment) => segment.text.length > 0 && segment.endMs >= segment.startMs),
  };
}
