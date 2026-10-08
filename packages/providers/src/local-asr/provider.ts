import type { TranscriptionProvider } from "../contracts";
import type { TranscriptionInput } from "../types";
import { LocalAsrClient } from "./client";

export class LocalFunASRTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly client: LocalAsrClient) {}

  async transcribe(input: TranscriptionInput) {
    const result = await this.client.transcribe(input);
    return {
      providerMode: "REAL" as const,
      data: {
        language: result.language,
        durationMs: result.durationMs,
        fullText: result.fullText,
        segments: result.segments,
      },
    };
  }

  getLastRequestMetadata() {
    return this.client.getLastRequestMetadata();
  }
}

