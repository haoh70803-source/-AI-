import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const spies = vi.hoisted(() => ({ configuration: vi.fn(), member: vi.fn(), snapshot: vi.fn(), exec: vi.fn(), importComments: vi.fn() }));
vi.mock("@content-center/integrations", () => ({ IntegrationService: class { getIntegrationStatus = spies.configuration; }, parseProviderConfig: vi.fn() }));
vi.mock("@content-center/db", () => ({ db: { workspaceMember: { findUnique: spies.member }, benchmarkContentSnapshot: { findFirst: spies.snapshot } } }));
vi.mock("node:child_process", () => ({ execFile: spies.exec }));
vi.mock("../server/discovery/benchmark-inputs", () => ({ importBenchmarkComments: spies.importComments }));
vi.mock("../server/discovery/research-library", () => ({ ResearchAccessError: class extends Error {} }));
import { getLocalAsrDisplay, initializeLocalAsrModel } from "../server/local-asr";
import { collectF2Comments } from "../server/discovery/f2-collector";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it.each(["offline flag", "review profile", "daily cutover"])("%s: ASR display and initialization never read stored endpoints", async mode => {
  vi.stubEnv("EXTERNAL_CALLS_DISABLED", mode === "daily cutover" ? "true" : "false");
  vi.stubEnv("LOCAL_REVIEW_OFFLINE", mode === "offline flag" ? "true" : "false"); vi.stubEnv("ENVIRONMENT_ID", mode === "review profile" ? "LOCAL_REVIEW" : "LOCAL_TEST");
  expect(await getLocalAsrDisplay("fixture-workspace")).toMatchObject({ status: "NOT_RUNNING", errorCode: "LOCAL_REVIEW_OFFLINE", models: [] });
  await expect(initializeLocalAsrModel({ workspaceId: "fixture-workspace", model: "SENSEVOICE_SMALL" })).rejects.toMatchObject({ code: "LOCAL_REVIEW_OFFLINE" });
  expect(spies.configuration).not.toHaveBeenCalled();
});
it.each(["offline flag", "review profile", "daily cutover"])("%s: F2 never starts a process or injected collector", async mode => {
  vi.stubEnv("EXTERNAL_CALLS_DISABLED", mode === "daily cutover" ? "true" : "false");
  vi.stubEnv("LOCAL_REVIEW_OFFLINE", mode === "offline flag" ? "true" : "false"); vi.stubEnv("ENVIRONMENT_ID", mode === "review profile" ? "LOCAL_REVIEW" : "LOCAL_TEST");
  const input = { workspaceId: "fixture-workspace", userId: "fixture-user", accountId: "fixture-account", snapshotId: "fixture-snapshot", offset: 0 };
  const run = vi.fn();
  await expect(collectF2Comments(input)).rejects.toThrow("LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED");
  await expect(collectF2Comments(input, { run })).rejects.toThrow("LOCAL_REVIEW_EXTERNAL_CALL_BLOCKED");
  for (const spy of [spies.member, spies.snapshot, spies.exec, spies.importComments, run]) expect(spy).not.toHaveBeenCalled();
});
