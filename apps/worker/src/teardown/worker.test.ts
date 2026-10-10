import { describe, expect, it } from "vitest";
import { TEARDOWN_SCHEMA } from "@content-center/core";
import { teardownExecutionExpired } from "./worker";

describe("long transcription and report deadlines", () => {
  const started = Date.parse("2026-10-09T00:00:00Z");
  const base = { startedAt: new Date(started), createdAt: new Date(started), coverage: { schema: TEARDOWN_SCHEMA, sourceItemId: "source", ingestJobId: null } };
  it("keeps a two-hour transcription wait active and leaves the report its own budget", () => {
    const coverage = { ...base.coverage, transcriptionWait: { startedAt: new Date(started + 60_000).toISOString() } };
    expect(teardownExecutionExpired({ ...base, coverage }, started + 2 * 60 * 60_000)).toBe(false);
    const completed = { ...coverage, transcriptionWait: { ...coverage.transcriptionWait, finishedAt: new Date(started + 2 * 60 * 60_000).toISOString() } };
    expect(teardownExecutionExpired({ ...base, coverage: completed }, started + 2 * 60 * 60_000 + 10 * 60_000)).toBe(false);
    expect(teardownExecutionExpired({ ...base, coverage: completed }, started + 3 * 60 * 60_000)).toBe(true);
  });
  it("bounds stalled transcription and never exempts old or malformed waits", () => {
    const coverage = { ...base.coverage, transcriptionWait: { startedAt: new Date(started + 60_000).toISOString() } };
    expect(teardownExecutionExpired({ ...base, coverage }, started + 8 * 60 * 60_000)).toBe(true);
    expect(teardownExecutionExpired(base, started + 46 * 60_000)).toBe(true);
    expect(teardownExecutionExpired({ ...base, coverage: { ...base.coverage, transcriptionWait: { startedAt: "invalid" } } }, started + 46 * 60_000)).toBe(true);
  });
});
