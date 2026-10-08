import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { assertTestDatabaseTarget } from "../../packages/db/src/test-target";
assertTestDatabaseTarget(process.env);

process.env.INTEGRATION_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");
process.env.ALLOW_PUBLIC_SIGNUP ??= "true";
process.env.INTERNAL_SIGNUP_ENABLED ??= "true";
process.env.INTERNAL_SIGNUP_INVITE_CODE ??= "test-invite";
process.env.SYSTEM_MANAGED_PROVIDERS ??= "false";
process.env.TRANSCRIPTION_PRIMARY ??= "LOCAL_FUNASR";

if (process.env.ENVIRONMENT_ID !== "LOCAL_TEST") {
  throw new Error("PLAYWRIGHT_ENVIRONMENT_GUARD_FAILED: E2E must run with ENVIRONMENT_ID=LOCAL_TEST");
}

const baseURL = "http://localhost:3001";
const serverCommand = process.env.PLAYWRIGHT_SERVER_MODE === "production"
  ? "pnpm --filter @content-center/web exec next start --port 3001"
  : "pnpm --filter @content-center/web exec next dev --port 3001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
