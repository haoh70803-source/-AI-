import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// These UI tests use mocked routing and static local previews, without database fixtures.
export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["apps/web/tests/research-navigation.test.tsx", "apps/web/tests/sidebar-state.test.ts", "apps/web/tests/research-lite.test.tsx", "apps/web/tests/resource-center-lite.test.tsx", "apps/web/tests/feishu-wiki-browser.test.tsx", "apps/web/tests/feishu-knowledge-subscriptions.test.tsx"] },
});
