import type { TranscriptionProvider } from "../contracts";
import type { TranscriptionInput } from "../types";
import { DoubaoClient } from "./client";
import { normalizeDoubaoTranscript } from "./normalize";

export class DoubaoTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly client: DoubaoClient) {}

  async transcribe(input: TranscriptionInput) {
    const response = await this.client.recognizeFlash(input);
    return { providerMode: "REAL" as const, data: normalizeDoubaoTranscript(response) };
  }

  getLastRequestMetadata() {
    return this.client.getLastRequestMetadata();
  }
}
