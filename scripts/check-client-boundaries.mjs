import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("vitest")] }));
const root = fileURLToPath(new URL("../", import.meta.url));
const entries = [
  "projects/artifact-window.tsx", "projects/assistant-markdown.tsx",
  "projects/assistant-result-renderer.tsx", "projects/canvas-free-node.tsx",
  "projects/content-canvas.tsx", "projects/studio-default-method.tsx",
  "projects/studio-shell.tsx", "research/work-creation-action.tsx", "research/research-session.tsx",
].map(p => "apps/web/components/" + p);
export function assertPureContract(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  for (const node of ast.statements) {
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) continue;
    if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly && node.moduleSpecifier.text.startsWith("./")) continue;
    throw new Error("PURE_CONTRACT_BOUNDARY: " + filename);
  }
}
export function assertClientInputs(inputs) {
  for (const input of inputs) {
    const p = input.replaceAll("\\", "/");
    if (/(^|\/)apps\/web\/server\//.test(p) || /(^|\/)(server-only|@content-center\/(db|providers|integrations)|@prisma)(\/|$)/.test(p) || /(^|\/)packages\/(db|providers|integrations)\//.test(p)) {
      throw new Error("CLIENT_SERVER_BOUNDARY: " + p);
    }
  }
}
export async function checkClientBoundaries() {
  const contracts = ["assistant", "references", "artifacts", "canvas"];
  for (const name of contracts) {
    const p = "apps/web/lib/contracts/" + name + ".ts";
    assertPureContract(await fs.readFile(path.join(root, p), "utf8"), p);
  }
  const result = await build({
    absWorkingDir: root, entryPoints: entries, bundle: true, write: false,
    outdir: "client-boundary-check", platform: "browser", format: "esm",
    metafile: true, packages: "external", alias: { "@": path.join(root, "apps/web"), "@content-center/ui": path.join(root, "packages/ui/src/index.ts"), "@content-center/core": path.join(root, "packages/core/src/index.ts") },
    loader: { ".css": "empty" }, logLevel: "silent",
  });
  assertClientInputs(Object.keys(result.metafile.inputs));
  assertClientInputs(Object.values(result.metafile.outputs).flatMap(v => v.imports.map(i => i.path)));
  return { clientEntries: entries.length, bundledInputs: Object.keys(result.metafile.inputs).length, contracts: contracts.length, serverInputs: 0 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkClientBoundaries();
  process.stdout.write(JSON.stringify(result) + "\n");
}
