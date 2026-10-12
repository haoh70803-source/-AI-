import { defineConfig } from "@playwright/test";
import { assertTestDatabaseTarget } from "../../packages/db/src/test-target";
assertTestDatabaseTarget(process.env);
export default defineConfig({
  testDir: "./e2e", testMatch: "workspace-ui.spec.ts", workers: 1, fullyParallel: false,
  outputDir: "../../output/workspace-ui/browser-results", reporter: "list",
  use: { browserName: "chromium", channel: "msedge", viewport: { width: 1440, height: 900 } },
});
