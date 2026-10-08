import { randomUUID } from "node:crypto";
import { db, type Prisma } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { RedFoxClient, RedFoxDiscoveryProvider, type ExternalContent } from "@content-center/providers";
import { UnrecoverableError, type Job } from "bullmq";
import type { BenchmarkCollectionPayload } from "./queue";
import { decideBenchmarkPage } from "./benchmark-collection-utils";

const integrations = new IntegrationService();
const MAX_PAGES_PER_RUN = 50;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function date(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function count(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function profileSnapshot(account: {
  name: string; avatarUrl: string | null; bio: string | null; originalUrl: string | null;
  followers: number | null; likes: number | null; rawProviderMetadata?: Record<string, unknown>;
}) {
  const raw = record(account.rawProviderMetadata);
  return {
    name: account.name,
    avatarUrl: account.avatarUrl,
    bio: account.bio,
    originalUrl: account.originalUrl,
    followers: account.followers,
    likes: account.likes,
    works: count(raw.awemeCount ?? raw.aweme_count ?? raw.workCount ?? raw.work_count ?? raw.postCount ?? raw.post_count ?? raw.videoCount ?? raw.itemCount),
    observedAt: new Date().toISOString(),
    source: "REDFOX_ACCOUNT_DETAIL",
  };
}

function includedInRange(publishedAt: Date | null, start: Date, end: Date) {
  return publishedAt !== null && publishedAt >= start && publishedAt <= end;
}

async function createProvider(workspaceId: string) {
  const status = await integrations.getIntegrationStatus(workspaceId, "REDFOX");
  if (status.status !== "CONFIGURED") throw new UnrecoverableError(status.status === "DISABLED" ? "RedFox 内容数据服务已停用。" : "RedFox 内容数据服务尚未配置。" );
  const config = await integrations.getDecryptedIntegrationConfig(workspaceId, "REDFOX");
  if (!config || typeof config.apiKey !== "string" || !config.apiKey.trim()) throw new UnrecoverableError("RedFox 内容数据服务尚未配置。" );
  return new RedFoxDiscoveryProvider(new RedFoxClient({ apiKey: config.apiKey, baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined }));
}

async function recordProviderUsage(input: { workspaceId: string; userId: string; runId: string; operation: string; offset?: number; startedAt: number; providerRequestId?: string; success: boolean; errorCode?: string }) {
  await db.apiUsage.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: "REDFOX",
      operation: input.operation,
      requestId: `benchmark-collection:${input.runId}:${randomUUID()}`,
      providerRequestId: input.providerRequestId,
      success: input.success,
      units: 1,
      cost: null,
      metadata: json({ runId: input.runId, offset: input.offset ?? null, durationMs: Date.now() - input.startedAt, errorCode: input.errorCode ?? null }),
    },
  }).catch((error: unknown) => console.warn("BENCHMARK_COLLECTION_USAGE_LOG_FAILED", { runId: input.runId, operation: input.operation, message: error instanceof Error ? error.message : "unknown" }));
}

async function savePage(input: {
  workspaceId: string;
  accountId: string;
  runId: string;
  items: ExternalContent[];
  rangeStart: Date;
  rangeEnd: Date;
  nextOffset: number;
  pageCount: number;
  providerExhausted: boolean;
}) {
  await db.$transaction(async (tx) => {
    const newItems: Array<{ snapshotId: string; inRange: boolean; publishedAt: Date | null; item: ExternalContent }> = [];
    for (const item of input.items) {
      const publishedAt = date(item.publishedAt);
      const existing = await tx.benchmarkContentSnapshot.findUnique({
        where: { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: item.platform, externalId: item.externalId } },
        select: { id: true, benchmarkAccountId: true, metadata: true },
      });
      if (existing && existing.benchmarkAccountId !== input.accountId) throw new Error("账号作品标识与另一个对标账号冲突，已停止写入。");
      const oldMetadata = record(existing?.metadata);
      const snapshot = await tx.benchmarkContentSnapshot.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: input.workspaceId, platform: item.platform, externalId: item.externalId } },
        create: {
          workspaceId: input.workspaceId,
          benchmarkAccountId: input.accountId,
          platform: item.platform,
          externalId: item.externalId,
          title: item.title || item.description || "未命名对标内容",
          url: item.originalUrl,
          authorName: item.authorName,
          coverUrl: item.coverUrl,
          metadata: json({ contentType: item.contentType, description: item.description?.slice(0, 500) ?? null, metrics: item.metrics, durationMs: item.durationMs }),
          publishedAt,
          observedAt: new Date(),
        },
        update: {
          title: item.title || item.description || "未命名对标内容",
          url: item.originalUrl,
          authorName: item.authorName,
          coverUrl: item.coverUrl,
          metadata: json({ ...oldMetadata, contentType: item.contentType, description: item.description?.slice(0, 500) ?? null, metrics: item.metrics, durationMs: item.durationMs }),
          ...(publishedAt ? { publishedAt } : {}),
          observedAt: new Date(),
        },
      });
      const alreadyInRun = await tx.benchmarkCollectionRunItem.findUnique({ where: { collectionRunId_snapshotId: { collectionRunId: input.runId, snapshotId: snapshot.id } }, select: { id: true } });
      if (!alreadyInRun) {
        const effectivePublishedAt = publishedAt ?? snapshot.publishedAt;
        newItems.push({ snapshotId: snapshot.id, inRange: includedInRange(effectivePublishedAt, input.rangeStart, input.rangeEnd), publishedAt: effectivePublishedAt, item });
      }
    }
    if (newItems.length) {
      await tx.benchmarkCollectionRunItem.createMany({
        data: newItems.map(({ snapshotId, inRange, publishedAt, item }) => ({
          collectionRunId: input.runId,
          snapshotId,
          titleSnapshot: item.title || item.description || "未命名对标内容",
          urlSnapshot: item.originalUrl,
          coverUrlSnapshot: item.coverUrl,
          metadataSnapshot: json({ contentType: item.contentType, description: item.description?.slice(0, 500) ?? null, durationMs: item.durationMs }),
          publishedAt,
          inRange,
        })),
        skipDuplicates: true,
      });
      const included = newItems.filter((entry) => entry.inRange);
      if (included.length) await tx.benchmarkMetricObservation.createMany({
        data: included.map(({ snapshotId, item }) => ({ snapshotId, collectionRunId: input.runId, metrics: json(item.metrics) })),
        skipDuplicates: true,
      });
    }
    await tx.benchmarkCollectionRun.update({
      where: { id: input.runId },
      data: {
        pageCount: input.pageCount,
        nextOffset: input.nextOffset,
        seenCount: { increment: newItems.length },
        inRangeCount: { increment: newItems.filter((entry) => entry.inRange).length },
        undatedCount: { increment: newItems.filter((entry) => !entry.publishedAt).length },
        ...(input.providerExhausted ? { status: "COMPLETED", completedAt: new Date(), stopReason: "数据服务返回列表结束。" } : {}),
      },
    });
  });
}

export async function processBenchmarkCollectionRunJob(job: Job<BenchmarkCollectionPayload>) {
  const { runId, workspaceId } = job.data;
  const run = await db.benchmarkCollectionRun.findFirst({ where: { id: runId, workspaceId }, include: { benchmarkAccount: true } });
  if (!run) throw new UnrecoverableError("对标账号采集批次不存在。");
  if (["COMPLETED", "PARTIAL", "FAILED"].includes(run.status)) return { status: run.status, runId };

  await db.benchmarkCollectionRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: run.startedAt ?? new Date(), errorMessage: null } });
  try {
    const provider = await createProvider(workspaceId);
    const profileRequestStarted = Date.now();
    try {
      const detail = await provider.accountDetail.get({ platform: run.benchmarkAccount.platform as "DOUYIN" | "XIAOHONGSHU", accountId: run.benchmarkAccount.externalAccountId });
      await recordProviderUsage({ workspaceId, userId: job.data.requestedById, runId: run.id, operation: "DISCOVERY_BENCHMARK_RUN_PROFILE", startedAt: profileRequestStarted, providerRequestId: detail.providerRequestId, success: true });
      await db.benchmarkCollectionRun.update({ where: { id: run.id }, data: { profileSnapshot: json(profileSnapshot(detail.item)) } });
      await db.benchmarkAccount.update({ where: { id: run.benchmarkAccountId }, data: { name: detail.item.name, avatarUrl: detail.item.avatarUrl, bio: detail.item.bio, originalUrl: detail.item.originalUrl, lastSyncedAt: new Date() } });
    } catch (error) {
      await recordProviderUsage({ workspaceId, userId: job.data.requestedById, runId: run.id, operation: "DISCOVERY_BENCHMARK_RUN_PROFILE", startedAt: profileRequestStarted, success: false, errorCode: error instanceof Error ? error.name : "REDFOX_API_ERROR" });
      await db.benchmarkCollectionRun.update({ where: { id: run.id }, data: { profileSnapshot: json({ name: run.benchmarkAccount.name, avatarUrl: run.benchmarkAccount.avatarUrl, bio: run.benchmarkAccount.bio, originalUrl: run.benchmarkAccount.originalUrl, observedAt: new Date().toISOString(), source: "PREVIOUS_ACCOUNT_RECORD", stale: true }), stopReason: `主页快照未获取：${error instanceof Error ? error.message : "数据服务不可用"}` } });
    }

    let offset = run.nextOffset;
    let pages = run.pageCount;
    let completed = false;
    while (pages < MAX_PAGES_PER_RUN) {
      const pageRequestStarted = Date.now();
      let page;
      try {
        page = await provider.accountWorks.list({ platform: run.benchmarkAccount.platform as "DOUYIN" | "XIAOHONGSHU", accountId: run.benchmarkAccount.externalAccountId, offset, sortType: "2" });
        await recordProviderUsage({ workspaceId, userId: job.data.requestedById, runId: run.id, operation: "DISCOVERY_BENCHMARK_RUN_WORKS", offset, startedAt: pageRequestStarted, providerRequestId: page.providerRequestId, success: true });
      } catch (error) {
        await recordProviderUsage({ workspaceId, userId: job.data.requestedById, runId: run.id, operation: "DISCOVERY_BENCHMARK_RUN_WORKS", offset, startedAt: pageRequestStarted, success: false, errorCode: error instanceof Error ? error.name : "REDFOX_API_ERROR" });
        throw error;
      }
      const unique = [...new Map(page.items.map((item) => [item.externalId, item])).values()];
      pages += 1;
      const nextOffset = page.nextOffset;
      const decision = decideBenchmarkPage({ hasMore: page.hasMore, nextOffset, currentOffset: offset, pageCount: pages, maxPages: MAX_PAGES_PER_RUN });
      await savePage({ workspaceId, accountId: run.benchmarkAccountId, runId: run.id, items: unique, rangeStart: run.rangeStart, rangeEnd: run.rangeEnd, nextOffset: decision.kind === "NEXT" ? decision.nextOffset : nextOffset ?? offset, pageCount: pages, providerExhausted: decision.kind === "EXHAUSTED" });
      if (decision.kind === "EXHAUSTED") { completed = true; break; }
      if (decision.kind === "PARTIAL") {
        const stopReason = decision.reason === "PAGE_LIMIT" ? `达到单批次 ${MAX_PAGES_PER_RUN} 页保护上限，仍未确认列表结束。` : "数据服务没有提供可验证的下一页游标，无法确认完整覆盖。";
        await db.benchmarkCollectionRun.update({ where: { id: run.id }, data: { status: "PARTIAL", completedAt: new Date(), stopReason } });
        return { status: "PARTIAL", runId };
      }
      offset = decision.nextOffset;
      if (!unique.length && page.hasMore !== true) {
        await db.benchmarkCollectionRun.update({ where: { id: run.id }, data: { status: "PARTIAL", completedAt: new Date(), stopReason: "数据服务返回空页但未声明列表结束。" } });
        return { status: "PARTIAL", runId };
      }
    }
    if (completed) return { status: "COMPLETED", runId };
    await db.benchmarkCollectionRun.update({ where: { id: run.id }, data: { status: "PARTIAL", completedAt: new Date(), stopReason: `达到单批次 ${MAX_PAGES_PER_RUN} 页保护上限，仍未确认列表结束。` } });
    return { status: "PARTIAL", runId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "采集失败。";
    const current = await db.benchmarkCollectionRun.findUnique({ where: { id: run.id }, select: { seenCount: true } });
    const hasSamples = (current?.seenCount ?? 0) > 0;
    const status = hasSamples ? "PARTIAL" : "FAILED";
    await db.benchmarkCollectionRun.update({ where: { id: run.id }, data: { status, completedAt: new Date(), errorMessage: message, stopReason: hasSamples ? "采集过程中断，已保留已成功获取的部分。" : "采集未能取得作品样本。" } });
    if (error instanceof UnrecoverableError) throw error;
    console.error("BENCHMARK_COLLECTION_RUN_FAILED", { runId, workspaceId, message });
    return { status, runId };
  }
}
