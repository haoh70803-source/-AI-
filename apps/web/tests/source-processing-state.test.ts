import { describe, expect, it } from "vitest";
import { getSourceProcessingState, materialTranscriptionViewState } from "../lib/source-processing-state";

const storedVideo = { assetType: "VIDEO", status: "STORED" } as const;
const storedAudio = { assetType: "AUDIO", status: "STORED" } as const;
const redfoxSucceeded = { jobType: "PROCESS_MEDIA", provider: "REDFOX", status: "SUCCEEDED" } as const;

describe("getSourceProcessingState", () => {
  it("reports saved video with unconfigured ASR without changing READY semantics", () => {
    expect(getSourceProcessingState({
      sourceStatus: "READY",
      transcriptionStatus: "UNCONFIGURED",
      hasTranscript: false,
      assets: [storedVideo],
      jobs: [redfoxSucceeded],
    })).toMatchObject({
      transcription: "NOT_CONFIGURED",
      libraryLabel: "已保存 · 待转写",
      steps: { redfoxParse: "SUCCEEDED", videoSave: "SUCCEEDED", audioExtraction: "SKIPPED", aiTranscription: "SKIPPED" },
    });
  });

  it("maps queued, audio extraction and transcription progress explicitly", () => {
    const base = { sourceStatus: "READY", transcriptionStatus: "CONFIGURED", hasTranscript: false, assets: [storedVideo], jobs: [redfoxSucceeded] } as const;
    expect(getSourceProcessingState(base).transcription).toBe("NOT_STARTED");
    expect(getSourceProcessingState({ ...base, jobs: [{ jobType: "TRANSCRIBE", provider: "DOUBAO_ASR", status: "QUEUED" }, ...base.jobs] }).transcription).toBe("QUEUED");
    expect(getSourceProcessingState({ ...base, jobs: [{ jobType: "TRANSCRIBE", provider: "DOUBAO_ASR", status: "RUNNING", metadata: { progressStage: "EXTRACTING_AUDIO" } }, ...base.jobs] }).transcription).toBe("EXTRACTING_AUDIO");
    expect(getSourceProcessingState({ ...base, assets: [storedVideo, storedAudio], jobs: [{ jobType: "TRANSCRIBE", provider: "DOUBAO_ASR", status: "RUNNING", metadata: { progressStage: "TRANSCRIBING" } }, ...base.jobs] })).toMatchObject({
      transcription: "TRANSCRIBING",
      steps: { audioExtraction: "SUCCEEDED", aiTranscription: "PROCESSING" },
      libraryLabel: "已保存",
    });
    expect(getSourceProcessingState({
      ...base,
      hasTranscript: true,
      assets: [storedVideo, storedAudio],
      jobs: [{ jobType: "TRANSCRIBE", provider: "DOUBAO_ASR", status: "SUCCEEDED" }, ...base.jobs],
    })).toMatchObject({ transcription: "SUCCEEDED", transcriptionLabel: "已完成", libraryLabel: "已转写" });
  });

  it("reports the real RedFox download and storage stages", () => {
    const base = { sourceStatus: "PROCESSING", transcriptionStatus: "CONFIGURED", hasTranscript: false, assets: [], jobs: [] } as const;
    expect(getSourceProcessingState({
      ...base,
      jobs: [{ jobType: "PROCESS_MEDIA", provider: "REDFOX", status: "RUNNING", metadata: { progressStage: "DOWNLOADING_MEDIA" } }],
    })).toMatchObject({ currentLabel: "下载视频中", steps: { redfoxParse: "SUCCEEDED", videoSave: "PROCESSING" } });
    expect(getSourceProcessingState({
      ...base,
      jobs: [{ jobType: "PROCESS_MEDIA", provider: "REDFOX", status: "RUNNING", metadata: { progressStage: "STORING" } }],
    })).toMatchObject({ currentLabel: "保存视频中", steps: { redfoxParse: "SUCCEEDED", videoSave: "PROCESSING" } });
  });

  it("keeps an old transcript visible while exposing the latest retry failure", () => {
    expect(getSourceProcessingState({
      sourceStatus: "READY",
      transcriptionStatus: "CONFIGURED",
      hasTranscript: true,
      assets: [storedVideo, storedAudio],
      jobs: [{ jobType: "TRANSCRIBE", provider: "DOUBAO_ASR", status: "FAILED" }, redfoxSucceeded],
    })).toMatchObject({
      transcription: "FAILED",
      libraryLabel: "已转写",
      steps: { videoSave: "SUCCEEDED", audioExtraction: "SUCCEEDED", aiTranscription: "FAILED" },
    });
  });

  it("marks a stored RedFox image as saved without inventing a video step", () => {
    expect(getSourceProcessingState({
      sourceStatus: "READY",
      transcriptionStatus: "UNCONFIGURED",
      hasTranscript: false,
      assets: [{ assetType: "IMAGE", status: "STORED" }],
      jobs: [redfoxSucceeded],
    }).steps).toMatchObject({ redfoxParse: "SUCCEEDED", videoSave: "SUCCEEDED", audioExtraction: "SKIPPED", aiTranscription: "SKIPPED" });
  });

  it("maps internal ASR progress to the five user-visible states", () => {
    for (const sourceType of ["VIDEO", "AUDIO"] as const) {
      expect(materialTranscriptionViewState(sourceType, "NOT_CONFIGURED")).toBe("NOT_TRANSCRIBED");
      expect(materialTranscriptionViewState(sourceType, "NOT_STARTED")).toBe("NOT_TRANSCRIBED");
      expect(materialTranscriptionViewState(sourceType, "QUEUED")).toBe("QUEUED");
      expect(materialTranscriptionViewState(sourceType, "EXTRACTING_AUDIO")).toBe("PROCESSING");
      expect(materialTranscriptionViewState(sourceType, "TRANSCRIBING")).toBe("PROCESSING");
      expect(materialTranscriptionViewState(sourceType, "SUCCEEDED")).toBe("COMPLETE");
      expect(materialTranscriptionViewState(sourceType, "FAILED")).toBe("FAILED");
    }
    for (const sourceType of ["IMAGE", "DOCUMENT", "URL", "TEXT"] as const) {
      expect(materialTranscriptionViewState(sourceType, "NOT_STARTED")).toBeNull();
      expect(materialTranscriptionViewState(sourceType, "FAILED")).toBeNull();
    }
  });

  it("shows a saved audio file as waiting for an optional transcription", () => {
    expect(getSourceProcessingState({ sourceStatus: "READY", transcriptionStatus: "CONFIGURED", hasTranscript: false, assets: [storedAudio], jobs: [] })).toMatchObject({
      transcription: "NOT_STARTED",
      libraryLabel: "已保存 · 待转写",
      busy: false,
    });
  });

  it("keeps an existing transcript complete without a new job", () => {
    const processing = getSourceProcessingState({ sourceStatus: "READY", transcriptionStatus: "CONFIGURED", hasTranscript: true, assets: [storedVideo], jobs: [] });
    expect(materialTranscriptionViewState("VIDEO", processing.transcription)).toBe("COMPLETE");
  });
});
