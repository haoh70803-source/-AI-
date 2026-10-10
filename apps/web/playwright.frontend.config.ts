import { defineConfig } from "@playwright/test";
import base from "./playwright.creation.config";

export default defineConfig({
  ...base,
  testMatch: "frontend-ui.spec.ts",
  timeout: 360000,
  outputDir: "../../output/frontend-replica/browser-results",
  use: { ...base.use, channel: undefined, launchOptions: process.env.UI_CHROMIUM_PATH ? { executablePath: process.env.UI_CHROMIUM_PATH } : undefined },
});
