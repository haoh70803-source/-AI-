import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { assertTestDatabaseTarget } from "./packages/db/src/test-target";
assertTestDatabaseTarget(process.env);
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/", import.meta.url)) } },
  test: { exclude: [...configDefaults.exclude, "output/**"], setupFiles: [fileURLToPath(new URL("./scripts/test-database-setup.ts", import.meta.url))] },
});
