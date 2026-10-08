import "server-only";
import { execFile } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { db } from "@content-center/db";
import { assertReviewExternalAllowed } from "@content-center/providers";
import { importBenchmarkComments } from "./benchmark-inputs";
import { ResearchAccessError } from "./research-library";
import { z } from "zod";

const resultSchema = z.object({ comments: z.array(z.unknown()).max(1000), hasMore: z.boolean(), nextOffset: z.number().int().nonnegative().nullable() });
async function run(workId: string, offset: number): Promise<unknown> {
  assertReviewExternalAllowed();
  const python = process.env.BENCHMARK_F2_PYTHON;
  if (!python || !isAbsolute(python) || !process.env.BENCHMARK_F2_COOKIE) throw new Error("F2_NOT_CONFIGURED");
  const script = process.env.BENCHMARK_F2_SCRIPT || resolve(process.cwd(), "../../services/research-collector/f2_comments.py");
  return new Promise((accept, reject) => {
    execFile(python, [script, workId, String(offset)], { timeout: 45000, maxBuffer: 2_500_000, windowsHide: true, encoding: "utf8",
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE,
        TEMP: process.env.TEMP, TMP: process.env.TMP, APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA,
        BENCHMARK_F2_COOKIE: process.env.BENCHMARK_F2_COOKIE, PYTHONIOENCODING: "utf-8" } }, (error, stdout) => {
      if (error) { reject(new Error("F2_COLLECTION_FAILED")); return; }
      const line = stdout.split(/\r?\n/).find((value) => value.startsWith("XSJ_RESULT:"));
      try { accept(JSON.parse(line?.slice(11) ?? "")); } catch { reject(new Error("F2_INVALID_RESPONSE")); }
    });
  });
}
export async function collectF2Comments(input: { workspaceId: string; userId: string; accountId: string; snapshotId: string; offset: number }, dependencies: { run?: (workId: string, offset: number) => Promise<unknown> } = {}) {
  assertReviewExternalAllowed();
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } });
  if (!member) throw new ResearchAccessError(404);
  if (member.role === "VIEWER") throw new ResearchAccessError(403);
  const snapshot = await db.benchmarkContentSnapshot.findFirst({ where: { id: input.snapshotId, workspaceId: input.workspaceId, benchmarkAccountId: input.accountId, platform: "DOUYIN", benchmarkAccount: { enabled: true } } });
  if (!snapshot) throw new ResearchAccessError(404);
  if (!dependencies.run && process.env.BENCHMARK_F2_WORKSPACE_ID !== input.workspaceId) throw new Error("F2_WORKSPACE_NOT_CONFIGURED");
  if (!/^\d{1,100}$/.test(snapshot.externalId) || !Number.isSafeInteger(input.offset) || input.offset < 0) throw new Error("INVALID_COLLECTOR_INPUT");
  const result = resultSchema.parse(await (dependencies.run ?? run)(snapshot.externalId, input.offset));
  const imported = result.comments.length ? await importBenchmarkComments({ ...input, data: { snapshotId: snapshot.id, payload: { comments: result.comments } } }) : { imported: 0 };
  return { ...imported, nextOffset: result.hasMore && result.nextOffset !== null && result.nextOffset > input.offset ? result.nextOffset : null, hasMore: result.hasMore };
}
