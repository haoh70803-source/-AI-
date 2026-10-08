import "server-only";
import { db } from "@content-center/db";
import { z } from "zod";
import { ResearchAccessError } from "./research-library";
import { commentAnalysisSchema, commentEvidenceSchema } from "./comment-analysis-schema";

export const commentImportSchema = z.object({
  snapshotId: z.string().min(1).max(200),
  payload: z.object({ comments: z.array(z.object({
    cid: z.string().min(1).max(200), aweme_id: z.string().min(1).max(200),
    text: z.string().trim().min(1).max(5000),
    digg_count: z.number().int().min(0).max(2147483647).nullable().optional(),
    create_time: z.number().int().min(0).max(4102444800).nullable().optional(),
    reply_id: z.string().max(200).nullable().optional(),
  }).strip()).min(1).max(1000) }).strip(),
}).strict();

async function scopedAccount(workspaceId: string, userId: string, accountId: string) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!member) throw new ResearchAccessError(404);
  const account = await db.benchmarkAccount.findFirst({ where: { id: accountId, workspaceId, enabled: true }, select: { id: true, platform: true } });
  if (!account) throw new ResearchAccessError(404);
  return { account, member };
}

export async function importBenchmarkComments(input: { workspaceId: string; userId: string; accountId: string; data: unknown }) {
  const { member, account } = await scopedAccount(input.workspaceId, input.userId, input.accountId);
  if (member.role === "VIEWER") throw new ResearchAccessError(403);
  const data = commentImportSchema.parse(input.data);
  const snapshot = await db.benchmarkContentSnapshot.findFirst({ where: { id: data.snapshotId, workspaceId: input.workspaceId, benchmarkAccountId: account.id } });
  if (!snapshot || account.platform !== "DOUYIN") throw new ResearchAccessError(404);
  if (data.payload.comments.some((item) => item.aweme_id !== snapshot.externalId)) throw new z.ZodError([{ code: "custom", path: ["payload", "comments"], message: "评论中的 aweme_id 与所选作品不一致。" }]);
  const comments = [...new Map(data.payload.comments.map((item) => [item.cid, item])).values()];
  await db.$transaction(async (tx) => {
    for (const item of comments) {
      const fields = { text: item.text, likes: item.digg_count ?? null, postedAt: item.create_time ? new Date(item.create_time * 1000) : null, parentId: item.reply_id && item.reply_id !== "0" ? item.reply_id : null };
      await tx.benchmarkComment.upsert({ where: { snapshotId_externalId: { snapshotId: snapshot.id, externalId: item.cid } }, create: { snapshotId: snapshot.id, externalId: item.cid, ...fields }, update: { ...fields, importedAt: new Date() } });
    }
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "benchmark.comments_imported", resourceType: "benchmark_account", resourceId: account.id, metadata: { snapshotId: snapshot.id, count: comments.length, format: "F2_RAW", authorFieldsDiscarded: true } } });
  }, { timeout: 30000 });
  return { imported: comments.length };
}

function metric(value: unknown, key: string): number | null {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : null;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : null;
}

export async function getBenchmarkInputs(workspaceId: string, userId: string, accountId: string, collectionRunId?: string) {
  await scopedAccount(workspaceId, userId, accountId);
  const collectionRun = collectionRunId ? await db.benchmarkCollectionRun.findFirst({ where: { id: collectionRunId, workspaceId, benchmarkAccountId: accountId, status: { in: ["COMPLETED", "PARTIAL"] } }, select: { id: true } }) : null;
  if (collectionRunId && !collectionRun) throw new ResearchAccessError(404);
  const batchItems = collectionRun ? await db.benchmarkCollectionRunItem.findMany({ where: { collectionRunId: collectionRun.id, inRange: true }, select: { snapshotId: true, titleSnapshot: true, urlSnapshot: true } }) : null;
  const batchTitles = new Map(batchItems?.map((item) => [item.snapshotId, { title: item.titleSnapshot, url: item.urlSnapshot }]) ?? []);
  const snapshotIds = batchItems?.map((item) => item.snapshotId);
  const [snapshots, comments, commentCount, analysis] = await Promise.all([
    db.benchmarkContentSnapshot.findMany({ where: { workspaceId, benchmarkAccountId: accountId, ...(snapshotIds ? { id: { in: snapshotIds } } : {}) }, orderBy: { observedAt: "desc" }, select: { id: true, externalId: true, title: true, url: true,
      observations: { where: collectionRun ? { collectionRunId: collectionRun.id } : {}, orderBy: { observedAt: "desc" }, take: collectionRun ? 1 : 2, select: { observedAt: true, metrics: true } },
      _count: { select: { comments: true } },
    } }),
    db.benchmarkComment.findMany({ where: { snapshot: { workspaceId, benchmarkAccountId: accountId, ...(snapshotIds ? { id: { in: snapshotIds } } : {}) } }, orderBy: [{ likes: { sort: "desc", nulls: "last" } }, { id: "asc" }], take: 200, select: { id: true, text: true, likes: true, postedAt: true, importedAt: true, snapshot: { select: { id: true, title: true, url: true } } } }),
    db.benchmarkComment.count({ where: { snapshot: { workspaceId, benchmarkAccountId: accountId, ...(snapshotIds ? { id: { in: snapshotIds } } : {}) } } }),
    db.aIRun.findFirst({ where: { workspaceId, action: "ANALYZE_SOURCES", status: "SUCCEEDED", AND: [{ metadata: { path: ["benchmarkAccountId"], equals: accountId } }, { metadata: { path: ["inputKind"], equals: "BENCHMARK_COMMENTS" } }, ...(collectionRun ? [{ metadata: { path: ["collectionRunId"], equals: collectionRun.id } }] : [])] }, orderBy: { createdAt: "desc" }, select: { id: true, outputJson: true, createdAt: true, metadata: true } }),
  ]);
  const parsed = commentAnalysisSchema.safeParse(analysis?.outputJson);
  const evidence = commentEvidenceSchema.safeParse((analysis?.metadata as { commentEvidence?: unknown } | null)?.commentEvidence);
  return {
    collectionRunId: collectionRun?.id ?? null,
    collectorConfigured: Boolean(process.env.BENCHMARK_F2_PYTHON && process.env.BENCHMARK_F2_COOKIE && process.env.BENCHMARK_F2_WORKSPACE_ID === workspaceId),
    analysis: analysis && parsed.success ? { id: analysis.id, output: parsed.data, evidence: evidence.success ? evidence.data : [], createdAt: analysis.createdAt.toISOString(), stale: comments.some((comment) => comment.importedAt > analysis.createdAt) } : null,
    commentCount,
    comments: comments.map((item) => ({ ...item, postedAt: item.postedAt?.toISOString() ?? null, importedAt: item.importedAt.toISOString() })),
    works: snapshots.map((item) => {
      const latest = item.observations[0]; const previous = item.observations[1];
      const a = latest ? metric(latest.metrics, "likes") : null; const b = previous ? metric(previous.metrics, "likes") : null;
      const pinnedTitle = batchTitles.get(item.id);
      return { id: item.id, externalId: item.externalId, title: pinnedTitle?.title ?? item.title, url: pinnedTitle?.url ?? item.url, commentCount: item._count.comments,
        latestObservedAt: latest?.observedAt.toISOString() ?? null, previousObservedAt: previous?.observedAt.toISOString() ?? null,
        likesDelta: a !== null && b !== null ? a - b : null };
    }),
  };
}
export type BenchmarkInputs = Awaited<ReturnType<typeof getBenchmarkInputs>>;
