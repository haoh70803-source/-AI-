import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { assertTestDatabaseTarget } from "../../packages/db/src/test-target";
assertTestDatabaseTarget(process.env);
const port = process.env.AGENT_TEST_PORT || "3015";
const baseURL = `http://localhost:${port}`;
Object.assign(process.env, { ENVIRONMENT_ID: "LOCAL_TEST", MOCK_MODE: "true", APP_URL: baseURL, SYSTEM_MANAGED_PROVIDERS: "false", ALLOW_PUBLIC_SIGNUP: "true", INTERNAL_SIGNUP_ENABLED: "true", INTERNAL_SIGNUP_INVITE_CODE: "agent-test", AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString("hex"), INTEGRATION_ENCRYPTION_KEY: process.env.INTEGRATION_ENCRYPTION_KEY || randomBytes(32).toString("base64") });
export default defineConfig({ testDir: "./e2e", testMatch: "project-agent-core.spec.ts", workers: 1, retries: 0, timeout: 90_000, reporter: "list", use: { baseURL, trace: "retain-on-failure", ...devices["Desktop Chrome"] }, webServer: { command: `pnpm --filter @content-center/web exec next dev --port ${port}`, url: baseURL, reuseExistingServer: false, timeout: 120_000 } });
