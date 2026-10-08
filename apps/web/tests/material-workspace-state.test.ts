import { describe, expect, it } from "vitest";
import { buildMaterialWorkspaceState } from "../lib/material-workspace-state";

describe("material workspace state", () => {
  it("reports only persisted pipeline facts", () => {
    expect(buildMaterialWorkspaceState({ storedAssets: 1, sourceStatus: "PROCESSING", hasTranscript: true, analysisStatus: "COMPLETED", relatedProjects: 1 })).toEqual({ saved: true, transcribed: true, organized: true, inProject: true });
    expect(buildMaterialWorkspaceState({ storedAssets: 0, sourceStatus: "PROCESSING", hasTranscript: false, analysisStatus: null, relatedProjects: 0 })).toEqual({ saved: false, transcribed: false, organized: false, inProject: false });
  });
});
