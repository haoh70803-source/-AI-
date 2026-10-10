import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve("output/architecture-upgrade-20261005/releases");
const directories = readdirSync(root).filter(name => name.startsWith("release-")).sort();
const directory = join(root, directories.at(-1) ?? "missing");
const receipt = JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8"));
const build = join(directory, "workspace/apps/web/.next-production");
if (receipt.status !== "BUILT" || receipt.networkDenied !== 0 || !receipt.liveFilesUnchanged || !receipt.sourceUnchanged) {
  throw new Error("BUILD_RECEIPT_FAILED");
}
for (const name of ["BUILD_ID", "build-manifest.json", "routes-manifest.json", "server", "static"]) {
  if (!existsSync(join(build, name))) throw new Error(`BUILD_ARTIFACT_MISSING: ${name}`);
}
if (readFileSync(join(build, "BUILD_ID"), "utf8").trim() !== receipt.buildId) throw new Error("BUILD_ID_MISMATCH");
process.stdout.write(JSON.stringify({ id: receipt.id, status: receipt.status, buildId: receipt.buildId, artifactFiles: receipt.artifactFiles.length }) + "\n");
