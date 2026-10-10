import { defineConfig } from "@playwright/test";
import base from "./playwright.teardown.config";
// New isolated workspaces have no integration credentials; only the explicit Mock provider is used.
Object.assign(process.env, { EXTERNAL_CALLS_DISABLED: "false", SYSTEM_MANAGED_PROVIDERS: "false", KIMI_API_KEY: "", DEEPSEEK_API_KEY: "" });
export default defineConfig({ ...base, testMatch: "creation-agent.spec.ts", timeout: 180000, outputDir: "../../output/creation-agent-quality/browser-results" });
