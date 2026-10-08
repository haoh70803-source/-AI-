import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Phase 9C-2 Workbench draft UI contract", () => {
  it("uses employee language and keeps branch and revision concepts distinct", async () => {
    const shell = await readFile(new URL("../components/projects/studio-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain("其他稿件");
    expect(shell).toContain("设为主稿");
    expect(shell).toContain("首次保存");
    expect(shell).not.toContain(">DraftBranch<");
    expect(shell).not.toContain(">DraftRevision<");
  });

  it("keeps 1800ms autosave separate from checkpoint creation before switching", async () => {
    const [shell, editor, route] = await Promise.all([
      readFile(new URL("../components/projects/studio-shell.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/projects/mother-content-editor.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/projects/[id]/drafts/[draftId]/route.ts", import.meta.url), "utf8"),
    ]);
    expect(shell).toContain("/history`");
    expect(shell).toContain("await checkpointCurrentDraft()");
    expect(shell).toContain("/checkpoint`");
    expect(editor).toContain("}, 1_800)");
    expect(route).toContain("saveDraftWorkingState");
    expect(route).not.toContain("createDraftRevision");
    expect(shell).toContain("setTab(\"CREATE\")");
  });

  it("keeps non-primary drafts away from legacy AI and platform writes", async () => {
    const shell = await readFile(new URL("../components/projects/studio-shell.tsx", import.meta.url), "utf8");
    expect(shell).toContain("selection={mother.isPrimary ? selection : null}");
    expect(shell).toContain("onSelectionAction={mother.isPrimary ? runSelectionAction : undefined}");
    expect(shell).toContain("请先将这份稿件设为当前主稿");
    expect(shell).toContain("mother.isPrimary ? <CreationFeedback");
  });
});
