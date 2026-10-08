import { describe, expect, it } from "vitest";
import { canTransitionJob, canTransitionSource, isRetryableIngestError } from "./source-domain";

describe("source and job states", () => {
  it("allows only explicit source state transitions", () => {
    expect(canTransitionSource("PENDING", "PROCESSING")).toBe(true);
    expect(canTransitionSource("PROCESSING", "READY")).toBe(true);
    expect(canTransitionSource("READY", "PENDING")).toBe(false);
    expect(canTransitionSource("FAILED", "PENDING")).toBe(true);
  });

  it("supports a queued retry only from running or failed jobs", () => {
    expect(canTransitionJob("RUNNING", "QUEUED")).toBe(true);
    expect(canTransitionJob("FAILED", "QUEUED")).toBe(true);
    expect(canTransitionJob("SUCCEEDED", "QUEUED")).toBe(false);
  });

  it("retries only transient network and server failures", () => {
    expect(isRetryableIngestError({ code: "TIMEOUT" })).toBe(true);
    expect(isRetryableIngestError({ httpStatus: 503 })).toBe(true);
    expect(isRetryableIngestError({ code: "SSRF_BLOCKED" })).toBe(false);
    expect(isRetryableIngestError({ httpStatus: 404 })).toBe(false);
  });
});
