import { describe, expect, it } from "vitest";
import { allowedProjectTransitions, ProjectTransitionError, transitionProjectStatus } from "./content-project-state";

describe("ContentProject state machine", () => {
  it("allows the explicit workflow, revision loops and archive", () => {
    expect(transitionProjectStatus({ from: "DRAFT", to: "RESEARCHING" })).toBe("RESEARCHING");
    expect(transitionProjectStatus({ from: "RESEARCHING", to: "BRIEF_READY", brief: { topic: "选题", coreMessage: "核心观点" } })).toBe("BRIEF_READY");
    expect(transitionProjectStatus({ from: "BRIEF_READY", to: "WRITING" })).toBe("WRITING");
    expect(transitionProjectStatus({ from: "WRITING", to: "IN_REVIEW", motherContent: { body: "正文" } })).toBe("IN_REVIEW");
    expect(allowedProjectTransitions("IN_REVIEW")).toEqual(["WRITING", "APPROVED", "ARCHIVED"]);
    expect(transitionProjectStatus({ from: "APPROVED", to: "WRITING" })).toBe("WRITING");
    expect(transitionProjectStatus({ from: "DRAFT", to: "ARCHIVED" })).toBe("ARCHIVED");
  });

  it("rejects arbitrary transitions", () => {
    expect(() => transitionProjectStatus({ from: "DRAFT", to: "APPROVED" })).toThrow(ProjectTransitionError);
    expect(() => transitionProjectStatus({ from: "ARCHIVED", to: "DRAFT" })).toThrowError(expect.objectContaining({ code: "INVALID_TRANSITION" }));
  });

  it("enforces the minimal Brief and Mother Content gates", () => {
    expect(() => transitionProjectStatus({ from: "RESEARCHING", to: "BRIEF_READY", brief: { topic: "", coreMessage: "观点" } })).toThrowError(expect.objectContaining({ code: "BRIEF_REQUIRED" }));
    expect(() => transitionProjectStatus({ from: "WRITING", to: "IN_REVIEW", motherContent: { body: "  " } })).toThrowError(expect.objectContaining({ code: "MOTHER_CONTENT_REQUIRED" }));
  });
});
