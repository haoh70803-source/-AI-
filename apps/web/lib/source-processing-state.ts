export type ProcessingStepState = "WAITING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

export type TranscriptionState =
  | "NOT_CONFIGURED"
  | "NOT_STARTED"
  | "QUEUED"
  | "EXTRACTING_AUDIO"
  | "TRANSCRIBING"
  | "SUCCEEDED"
  | "FAILED";

export type MaterialTranscriptionViewState = "NOT_TRANSCRIBED" | "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";

export function materialTranscriptionViewState(sourceType: "VIDEO" | "AUDIO" | "IMAGE" | "DOCUMENT" | "URL" | "TEXT", state: TranscriptionState): MaterialTranscriptionViewState | null {
  if (sourceType !== "VIDEO" && sourceType !== "AUDIO") return null;
  if (state === "QUEUED") return "QUEUED";
  if (state === "EXTRACTING_AUDIO" || state === "TRANSCRIBING") return "PROCESSING";
  if (state === "SUCCEEDED") return "COMPLETE";
  if (state === "FAILED") return "FAILED";
  return "NOT_TRANSCRIBED";
}

type SourceProcessingInput = {
  sourceStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "ARCHIVED";
  transcriptionStatus?: "UNCONFIGURED" | "CONFIGURED" | "DISABLED" | "MOCK" | "ERROR";
  hasTranscript: boolean;
  assets: ReadonlyArray<{ assetType: "VIDEO" | "IMAGE" | "AUDIO" | "DOCUMENT"; status: "REMOTE" | "DOWNLOADING" | "STORED" | "FAILED" }>;
  jobs: ReadonlyArray<{
    jobType: string;
    provider: string;
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
    metadata?: unknown;
  }>;
};

export const transcriptionStateLabels: Record<TranscriptionState, string> = {
  NOT_CONFIGURED: "未配置",
  NOT_STARTED: "未开始",
  QUEUED: "等待转写",
  EXTRACTING_AUDIO: "正在提取音频",
  TRANSCRIBING: "正在转写",
  SUCCEEDED: "已完成",
  FAILED: "转写失败",
};

function progressStage(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const stage = (metadata as Record<string, unknown>).progressStage;
  return typeof stage === "string" ? stage : undefined;
}

export function getSourceProcessingState(input: SourceProcessingInput) {
  const redfoxJob = input.jobs.find((job) => job.provider === "REDFOX" && job.jobType === "PROCESS_MEDIA");
  const transcriptionJob = input.jobs.find((job) => job.jobType === "TRANSCRIBE");
  const storedVideo = input.assets.some((asset) => asset.assetType === "VIDEO" && asset.status === "STORED");
  const storedPrimaryMedia = input.assets.some((asset) => (asset.assetType === "VIDEO" || asset.assetType === "IMAGE" || asset.assetType === "DOCUMENT") && asset.status === "STORED");
  const failedPrimaryMedia = input.assets.some((asset) => (asset.assetType === "VIDEO" || asset.assetType === "IMAGE" || asset.assetType === "DOCUMENT") && asset.status === "FAILED");
  const storedAudio = input.assets.some((asset) => asset.assetType === "AUDIO" && asset.status === "STORED");
  const storedMedia = storedVideo || storedAudio;
  const failedAudio = input.assets.some((asset) => asset.assetType === "AUDIO" && asset.status === "FAILED");
  const transcriptionConfigured = input.transcriptionStatus === "CONFIGURED";
  const stage = progressStage(transcriptionJob?.metadata);
  const redfoxStage = progressStage(redfoxJob?.metadata);

  let transcription: TranscriptionState;
  if (transcriptionJob?.status === "FAILED") transcription = "FAILED";
  else if (transcriptionJob?.status === "QUEUED") transcription = "QUEUED";
  else if (transcriptionJob?.status === "RUNNING" && (stage === "EXTRACTING_AUDIO" || stage === "UPLOADING_AUDIO")) transcription = "EXTRACTING_AUDIO";
  else if (transcriptionJob?.status === "RUNNING") transcription = "TRANSCRIBING";
  else if (transcriptionJob?.status === "SUCCEEDED" || input.hasTranscript) transcription = "SUCCEEDED";
  else if (!transcriptionConfigured) transcription = "NOT_CONFIGURED";
  else transcription = "NOT_STARTED";

  const redfoxParse: ProcessingStepState = redfoxJob?.status === "FAILED" && !storedPrimaryMedia
    ? "FAILED"
    : redfoxJob?.status === "SUCCEEDED" || storedPrimaryMedia || redfoxStage === "DOWNLOADING_MEDIA" || redfoxStage === "STORING" || redfoxStage === "DONE"
        ? "SUCCEEDED"
      : redfoxJob?.status === "RUNNING"
        ? "PROCESSING"
        : redfoxJob?.status === "CANCELLED"
          ? "SKIPPED"
          : "WAITING";

  const videoSave: ProcessingStepState = storedPrimaryMedia
    ? "SUCCEEDED"
    : failedPrimaryMedia
      ? "FAILED"
      : redfoxParse === "FAILED" || redfoxParse === "SKIPPED"
        ? "SKIPPED"
        : redfoxJob?.status === "RUNNING" && (redfoxStage === "DOWNLOADING_MEDIA" || redfoxStage === "STORING")
          ? "PROCESSING"
          : "WAITING";

  const audioExtraction: ProcessingStepState = storedAudio
    ? "SUCCEEDED"
    : transcription === "EXTRACTING_AUDIO"
      ? "PROCESSING"
      : transcription === "TRANSCRIBING" || transcription === "SUCCEEDED"
        ? "SUCCEEDED"
    : !transcriptionConfigured || videoSave === "FAILED" || videoSave === "SKIPPED"
      ? "SKIPPED"
      : failedAudio || (transcription === "FAILED" && !storedAudio)
        ? "FAILED"
        : "WAITING";

  const aiTranscription: ProcessingStepState = transcription === "FAILED"
      ? "FAILED"
      : transcription === "SUCCEEDED"
        ? "SUCCEEDED"
        : transcription === "QUEUED" || transcription === "TRANSCRIBING" || transcription === "EXTRACTING_AUDIO"
          ? "PROCESSING"
        : !transcriptionConfigured || videoSave === "FAILED" || videoSave === "SKIPPED"
          ? "SKIPPED"
          : "WAITING";

  const libraryLabel = storedMedia
    ? input.hasTranscript
      ? "已转写"
      : transcription === "QUEUED" || transcription === "EXTRACTING_AUDIO" || transcription === "TRANSCRIBING"
        ? "已保存"
        : "已保存 · 待转写"
    : storedPrimaryMedia || input.hasTranscript
      ? "已保存"
    : input.sourceStatus === "FAILED"
      ? "失败"
      : "处理中";

  const currentLabel = redfoxJob?.status === "RUNNING"
    ? redfoxStage === "DOWNLOADING_MEDIA"
      ? "下载视频中"
      : redfoxStage === "STORING"
        ? "保存视频中"
        : "收录中"
    : transcription === "QUEUED"
      ? "等待转写"
      : transcription === "EXTRACTING_AUDIO"
        ? "正在提取音频"
        : transcription === "TRANSCRIBING"
          ? "转写中"
          : transcription === "SUCCEEDED"
            ? "已完成"
            : transcription === "FAILED"
              ? "转写失败"
              : libraryLabel;

  return {
    steps: { redfoxParse, videoSave, audioExtraction, aiTranscription },
    transcription,
    transcriptionLabel: transcriptionStateLabels[transcription],
    libraryLabel,
    currentLabel,
    busy: input.sourceStatus === "PENDING" || input.sourceStatus === "PROCESSING" || transcription === "QUEUED" || transcription === "EXTRACTING_AUDIO" || transcription === "TRANSCRIBING",
  };
}
