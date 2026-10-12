import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { assertTestDatabaseTarget } from "../../packages/db/src/test-target";
assertTestDatabaseTarget(process.env);
const baseURL = "http://localhost:3016";
Object.assign(process.env, { APP_URL: baseURL, NEXT_BUILD_CHECK: "1", WORKER_MODE: "disabled", EXTERNAL_CALLS_DISABLED: "true", FREE_WORKER_MODE: "false", MOCK_MODE: "true", AUTH_COOKIE_PREFIX: "teardown-test", NEXT_TELEMETRY_DISABLED: "1" });
export default defineConfig({ testDir: "./e2e", testMatch: "teardown.spec.ts", workers: 1, timeout: 120000, reporter: "list", outputDir: "../../output/teardown-private/browser-results", use: { baseURL, trace: "retain-on-failure", ...devices["Desktop Chrome"], channel: "msedge" }, webServer: { command: "node node_modules/next/dist/bin/next dev --port 3016", cwd: path.resolve(process.cwd(), "apps/web"), url: baseURL, reuseExistingServer: false, timeout: 120000 } });
