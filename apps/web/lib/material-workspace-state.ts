export function buildMaterialWorkspaceState(input: { storedAssets: number; sourceStatus: string; hasTranscript: boolean; analysisStatus?: string | null; relatedProjects: number }) {
  return {
    saved: input.storedAssets > 0 || input.sourceStatus === "READY",
    transcribed: input.hasTranscript,
    organized: input.analysisStatus === "COMPLETED",
    inProject: input.relatedProjects > 0,
  };
}
