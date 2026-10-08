import { describe, expect, it } from "vitest";
import { getProjectNextAction } from "../lib/project-next-action";

const base = { sources: [{ completedAnalysis: true }], supplement: "我的观点", mother: { body: "我的口播稿", version: 1, confirmedVersion: 1 }, platformStatuses: [] as string[] };

describe("project next action", () => {
  it.each([
    [{ sources: [], supplement: "", mother: null, platformStatuses: [] }, "ADD_REFERENCE"],
    [{ sources: [{ completedAnalysis: false }], supplement: "", mother: null, platformStatuses: [] }, "ORGANIZE_REFERENCE"],
    [{ ...base, supplement: "" }, "COMPLETE_SUPPLEMENT"],
    [{ ...base, mother: null }, "GENERATE_MOTHER"],
    [{ ...base, mother: { body: "稿子", version: 2, confirmedVersion: 1 } }, "CONFIRM_MOTHER"],
    [{ ...base }, "GENERATE_PLATFORM"],
    [{ ...base, platformStatuses: ["READY"] }, "SUBMIT_REVIEW"],
    [{ ...base, platformStatuses: ["APPROVED"] }, "ADD_TO_PUBLISHING"],
  ])("derives %s", (input, key) => expect(getProjectNextAction(input as Parameters<typeof getProjectNextAction>[0]).key).toBe(key));
});
