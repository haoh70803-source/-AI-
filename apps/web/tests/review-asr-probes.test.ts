import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@content-center/db", () => ({ db: { $queryRawUnsafe: vi.fn(async () => []) } }));
vi.mock("@content-center/integrations", () => ({ getSystemProviderConfig: () => null, resolveSystemProviderConfig: async () => null, systemManagedProvidersEnabled: () => false }));
vi.mock("@content-center/providers/storage", () => ({ storageHealthFromEnv: () => "UNCONFIGURED" }));
import { getSystemServiceStatuses } from "../server/admin/system-services";
import { getRuntimeHealth } from "../server/runtime/health";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function configure(mode: string) {
  vi.stubEnv("EXTERNAL_CALLS_DISABLED", mode === "daily" ? "true" : "false");
  vi.stubEnv("ENVIRONMENT_ID", mode === "profile" ? "LOCAL_REVIEW" : "LOCAL_TEST");
  vi.stubEnv("LOCAL_REVIEW_OFFLINE", mode === "flag" ? "true" : "false");
  vi.stubEnv("LOCAL_ASR_ENDPOINT", "https://asr.example.invalid");
  for (const key of ["REDIS_URL", "WORKER_HEALTH_URL", "S3_ENDPOINT"]) vi.stubEnv(key, "");
}
it.each(["flag", "profile", "daily"])("%s skips both ASR probes and reports review-disabled", async mode => {
  configure(mode); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await getSystemServiceStatuses()).localFunAsr).toBe("DISABLED_FOR_REVIEW");
  expect((await getRuntimeHealth()).asr).toEqual({ status: "DISABLED_FOR_REVIEW", source: "NONE" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("normal mode still checks ASR and reports the actual successful probe", async () => {
  configure("normal"); const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 200 })); vi.stubGlobal("fetch", fetcher);
  expect((await getSystemServiceStatuses()).localFunAsr).toBe("AVAILABLE");
  expect((await getRuntimeHealth()).asr).toEqual({ status: "OK", source: "LOCAL" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
