import type { TranscriptionProvider } from "../contracts";
import type { TranscriptionInput } from "../types";
import { normalizeDoubaoTranscript } from "./normalize";
import { DoubaoRecordingFileClient } from "./recording-file-client";

export class DoubaoRecordingFileTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly client: DoubaoRecordingFileClient) {}
  async transcribe(input: TranscriptionInput) {
    return { providerMode: "REAL" as const, data: normalizeDoubaoTranscript(await this.client.recognize(input)) };
  }
  getLastRequestMetadata() { return this.client.getLastRequestMetadata(); }
}
