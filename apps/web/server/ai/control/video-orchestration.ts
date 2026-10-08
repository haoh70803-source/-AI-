export const SOURCE_UNDERSTANDING_STEPS = ["INGEST", "TRANSCRIBE", "ANALYZE", "DISTILL", "CANDIDATE_REVIEW", "COMPLETE"] as const;
export type SourceUnderstandingStep = (typeof SOURCE_UNDERSTANDING_STEPS)[number];

export type SourceUnderstandingState = {
  sourceReady: boolean;
  isVideoOrAudio: boolean;
  transcriptReady: boolean;
  analysisReady: boolean;
  distillationReady: boolean;
  candidateReviewComplete: boolean;
};

export function nextSourceUnderstandingStep(state: SourceUnderstandingState): SourceUnderstandingStep {
  if (!state.sourceReady) return "INGEST";
  if (state.isVideoOrAudio && !state.transcriptReady) return "TRANSCRIBE";
  if (!state.analysisReady) return "ANALYZE";
  if (!state.distillationReady) return "DISTILL";
  if (!state.candidateReviewComplete) return "CANDIDATE_REVIEW";
  return "COMPLETE";
}
