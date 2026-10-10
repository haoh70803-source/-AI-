import path from "node:path";
import { defineConfig } from "@playwright/test";
import base from "./playwright.teardown.config";
const directory = process.env.V3_RELEASE_APP;
if (!directory || !directory.startsWith(path.resolve("output/architecture-upgrade-20261005/releases") + path.sep)) throw Error("ISOLATED_RELEASE_REQUIRED");
export default defineConfig({ ...base, testMatch: "creation-production-smoke.spec.ts", outputDir: "../../output/v3-quality/production-browser-results", webServer: { ...base.webServer as object, command: `node "${path.resolve("apps/web/node_modules/next/dist/bin/next")}" start --port 3016`, cwd: directory, url: "http://localhost:3016", reuseExistingServer: false, timeout: 60000 } });
