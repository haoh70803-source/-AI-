import { defineConfig } from "@playwright/test";
import base from "./playwright.creation.config";
export default defineConfig({ ...base, testMatch: "workbench-ux.spec.ts", timeout: 300000, outputDir: "../../output/v4-ux/browser-results" });
