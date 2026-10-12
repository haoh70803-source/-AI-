import { defineConfig } from "@playwright/test";
import base from "./playwright.teardown.config";
if (process.env.CREATION_V3_REAL !== "1") throw Error("EXPLICIT_REAL_E2E_REQUIRED");
Object.assign(process.env, { EXTERNAL_CALLS_DISABLED: "false", SYSTEM_MANAGED_PROVIDERS: "false", MOCK_MODE: "false", KIMI_API_KEY: "", DEEPSEEK_API_KEY: "" });
export default defineConfig({ ...base, testMatch: "creation-quality.spec.ts", timeout: 420000, outputDir: "../../output/v3-quality/browser-results" });
