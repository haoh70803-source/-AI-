import "server-only";

import { db } from "@content-center/db";
import { enqueueBenchmarkCollectionRun } from "@content-center/worker/queue";
import { resolveBenchmarkCollectionRange, type BenchmarkCollectionRangeInput } from "./benchmark-collection-contract";

export class BenchmarkCollectionError extends Error {
  constructor(readonly code: "BENCHMARK_NOT_FOUND" | "COLLECTION_ALREADY_RUNNING" | "COLLECTION_QUEUE_UNAVAILABLE" | "COLLECTION_RANGE_INVALID", message: string) {
    super(message);
    this.name = "BenchmarkCollectionError";
  }
}

function dto(run: {
  id: string; status: string; rangeStart: Date; rangeEnd: Date; pageCount: number; seenCount: number;
  inRangeCount: number; undatedCount: number; nextOffset: number; stopReason: string | null;
  errorMessage: string | null; createdAt: Date; startedAt: Date | null; completedAt: Date | null;
}) {
  return {
    id: run.id,
    status: run.status,
    rangeStart: run.rangeStart.toISOString(),
    rangeEnd: run.rangeEnd.toISOString(),
    pageCount: run.pageCount,
    seenCount: run.seenCount,
    inRangeCount: run.inRangeCount,
    undatedCount: run.undatedCount,
    nextOffset: run.nextOffset,
    stopReason: run.stopReason,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export async function createBenchmarkCollectionRun(input: {
  workspaceId: string;
  benchmarkAccountId: string;
  requestedById: string;
  range: BenchmarkCollectionRangeInput;
}) {
  let range: ReturnType<typeof resolveBenchmarkCollectionRange>;
  try { range = resolveBenchmarkCollectionRange(input.range); }
  catch (error) { throw new BenchmarkCollectionError("COLLECTION_RANGE_INVALID", error instanceof Error ? error.message : "采集范围无效。"); }

  const account = await db.benchmarkAccount.findFirst({ where: { id: input.benchmarkAccountId, workspaceId: input.workspaceId, enabled: true }, select: { id: true } });
  if (!account) throw new BenchmarkCollectionError("BENCHMARK_NOT_FOUND", "对标账号不存在。");
  const active = await db.benchmarkCollectionRun.findFirst({
    where: { workspaceId: input.workspaceId, benchmarkAccountId: account.id, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  if (active) throw new BenchmarkCollectionError("COLLECTION_ALREADY_RUNNING", "这个账号已有采集任务正在运行。");

  let run;
  try {
    run = await db.benchmarkCollectionRun.create({
      data: {
        workspaceId: input.workspaceId,
        benchmarkAccountId: account.id,
        requestedById: input.requestedById,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new BenchmarkCollectionError("COLLECTION_ALREADY_RUNNING", "这个账号已有采集任务正在运行。");
    throw error;
  }
  try {
    await enqueueBenchmarkCollectionRun({ runId: run.id, workspaceId: input.workspaceId, requestedById: input.requestedById });
  } catch (error) {
    await db.benchmarkCollectionRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), errorMessage: "采集队列暂不可用。", stopReason: "任务未能进入后台队列。" } });
    throw new BenchmarkCollectionError("COLLECTION_QUEUE_UNAVAILABLE", error instanceof Error ? "采集任务未能进入后台队列，请确认后台 worker 正常后重试。" : "采集队列暂不可用。");
  }
  await db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.requestedById, action: "discovery.benchmark_collection_started", resourceType: "benchmark_collection_run", resourceId: run.id, metadata: { benchmarkAccountId: account.id, preset: range.preset, startDate: range.startDate, endDate: range.endDate, days: range.days } } }).catch(() => undefined);
  return { ...dto(run), preset: range.preset, days: range.days };
}

export async function listBenchmarkCollectionRuns(input: { workspaceId: string; benchmarkAccountId: string }) {
  const runs = await db.benchmarkCollectionRun.findMany({ where: input, orderBy: { createdAt: "desc" }, take: 12 });
  return runs.map(dto);
}

export async function getBenchmarkCollectionRun(input: { workspaceId: string; benchmarkAccountId: string; runId: string }) {
  const run = await db.benchmarkCollectionRun.findFirst({ where: { id: input.runId, workspaceId: input.workspaceId, benchmarkAccountId: input.benchmarkAccountId } });
  return run ? dto(run) : null;
}
