import { defineConfig } from "@playwright/test";
import base from "./playwright.creation.config";

export default defineConfig({
  ...base,
  testMatch: "frontend-ui.spec.ts",
  timeout: 360000,
  outputDir: "../../output/frontend-replica/browser-results",
  use: { ...base.use, channel: undefined, launchOptions: { executablePath: process.env.UI_CHROMIUM_PATH || "E:/agent 开发环境/aegnt开发/06-数据/playwright-browsers/chromium-1243/chrome-win64/chrome.exe" } },
});
