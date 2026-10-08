import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPureContract, assertClientInputs, checkClientBoundaries } from "./check-client-boundaries.mjs";
test("pure contracts reject values, side effects and server type dependencies", () => {
  assertPureContract('import type { A } from "./a"; export type T = A;', "safe.ts");
  for (const source of ['import "server-only";', 'export const secret = "x";', 'import type { X } from "@/server/x";', 'export { x } from "./x";']) {
    assert.throws(() => assertPureContract(source, "unsafe.ts"), /PURE_CONTRACT_BOUNDARY/);
  }
});
test("client bundles reject server modules and sensitive workspace packages", () => {
  assertClientInputs(["apps/web/lib/contracts/artifacts.ts", "react"]);
  for (const p of ["apps/web/server/artifacts/view-model.ts", "packages/db/src/index.ts", "@content-center/providers", "server-only", "@prisma/client"]) {
    assert.throws(() => assertClientInputs([p]), /CLIENT_SERVER_BOUNDARY/);
  }
});
test("affected clients produce browser bundles without server inputs", async () => {
  assert.equal((await checkClientBoundaries()).serverInputs, 0);
});
