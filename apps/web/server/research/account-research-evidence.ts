import "server-only";
import { createHash } from "node:crypto";
import { db } from "@content-center/db";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import { researchBenchmarkDetail } from "./benchmarks";
import { ResearchError, type ResearchActor } from "./access";
import type { ResearchScope } from "./contracts";
import { accountEvidenceSchema, type AccountEvidence, type AccountResearchState } from "./account-research-contract";

export const evidenceHash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const sourceRef = (prefix: string, id: string) => prefix + evidenceHash(id).slice(0, 12);

export async function collectAccountResearchEvidence(actor: ResearchActor, scope: ResearchScope): Promise<AccountEvidence> {
  if (scope.benchmarkAccountIds.length !== 1) throw new ResearchError("ACCOUNT_SCOPE_REQUIRED", "账号档案研究需要明确选择一个账号。", 400);
  const accountId = scope.benchmarkAccountIds[0]!;
  const detail = await researchBenchmarkDetail(actor, accountId, { view: "dossier", runId: scope.benchmarkCollectionRunId });
  const from = scope.researchDateRange?.from ?? null; const to = scope.researchDateRange?.to ?? null;
  const works = detail.works.filter(work => {
    if (!from && !to) return true;
    if (!work.publishedAt) return false;
    const local = new Date(new Date(work.publishedAt).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
    return (!from || local >= from) && (!to || local <= to);
  });
  if (!works.length) throw new ResearchError("NO_ACCOUNT_EVIDENCE", "当前范围还没有作品证据。可以先更新数据，或扩大日期范围。", 409);
  const readings = new Map<string, Awaited<ReturnType<typeof getMaterialReadableContent>>>();
  const sourceIds = [...new Set(works.flatMap(work => work.sourceItemId ? [work.sourceItemId] : []))];
  // Bounded batches avoid exhausting the DB pool when an account has many Materials.
  for (let start = 0; start < sourceIds.length; start += 8) {
    await Promise.all(sourceIds.slice(start, start + 8).map(async id => { readings.set(id, await getMaterialReadableContent({ ...actor, sourceItemId: id })); }));
  }
  const snapshots = works.map(work => {
    const reading = work.sourceItemId ? readings.get(work.sourceItemId) : null;
    const body = reading?.contentText ?? "";
    const metrics = { views: work.views, ...work.counts };
    const contentOrigin = reading?.contentSource === "TRANSCRIPT" ? "MACHINE_TRANSCRIPT" as const : reading?.contentSource === "SOURCE_UNDERSTANDING" ? "AI_READING" as const : "ORIGINAL" as const;
    return { id: work.id, ref: sourceRef("W", work.id), sourceItemId: work.sourceItemId, title: work.title, url: /^https:\/\//i.test(work.url) ? work.url : null,
      publishedAt: work.publishedAt, observedAt: work.latestObservedAt || work.observedAt, metrics, durationMs: work.durationMs,
      metadataHash: evidenceHash({ title: work.title, publishedAt: work.publishedAt, metrics, durationMs: work.durationMs }),
      bodyHash: body ? evidenceHash({ body, contentOrigin }) : null, bodyText: body.slice(0, 8000), bodyLength: body.length,
      contentOrigin, contentVersion: reading?.version ?? null, hasTimecodes: Array.isArray(reading?.segments) && reading.segments.length > 0 };
  });
  const where = { snapshotId: { in: snapshots.map(work => work.id) }, snapshot: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId } };
  const [rows, totalComments] = await Promise.all([
    db.benchmarkComment.findMany({ where, orderBy: [{ likes: "desc" }, { id: "asc" }], take: 40, select: { id: true, text: true, likes: true, postedAt: true, snapshotId: true } }),
    db.benchmarkComment.count({ where }),
  ]);
  const comments = rows.map(comment => ({ id: comment.id, ref: sourceRef("C", comment.id), workRef: snapshots.find(work => work.id === comment.snapshotId)!.ref, text: comment.text.slice(0, 1600), likes: comment.likes, postedAt: comment.postedAt?.toISOString() ?? null, hash: evidenceHash({ text: comment.text, likes: comment.likes, postedAt: comment.postedAt }) }));
  const fingerprint = evidenceHash({ accountId, collectionRunId: detail.selected?.id ?? null, from, to, works: snapshots.map(work => ({ ref: work.ref, metadataHash: work.metadataHash, bodyHash: work.bodyHash })).sort((a, b) => a.ref.localeCompare(b.ref)), comments: comments.map(comment => ({ ref: comment.ref, hash: comment.hash })).sort((a, b) => a.ref.localeCompare(b.ref)) });
  return accountEvidenceSchema.parse({ schemaVersion: "account-evidence-v1", account: { id: accountId, name: detail.account.name, platform: detail.account.platform }, capturedAt: new Date().toISOString(), fingerprint,
    collectionRunId: detail.selected?.id ?? null, from: from ?? detail.selected?.rangeStart.toISOString() ?? null, to: to ?? detail.selected?.rangeEnd.toISOString() ?? null,
    totalWorks: from || to ? snapshots.length : detail.workCount, limited: detail.workCount > detail.works.length, works: snapshots, comments, totalComments });
}

export function planAccountResearch(evidence: AccountEvidence, previous: AccountResearchState | null, previousRunId: string | null): AccountResearchState {
  const oldWorks = new Map(previous?.evidence.works.map(work => [work.ref, work]));
  const oldAnalyses = new Map(previous?.workAnalyses.map(item => [item.ref, item]));
  const oldComments = new Map(previous?.evidence.comments.map(comment => [comment.ref, comment]));
  const currentRefs = new Set(evidence.works.map(work => work.ref)); const commentRefs = new Set(evidence.comments.map(comment => comment.ref));
  const delta = {
    added: evidence.works.filter(work => !oldWorks.has(work.ref)).map(work => work.ref),
    updatedText: evidence.works.filter(work => oldWorks.has(work.ref) && oldWorks.get(work.ref)!.bodyHash !== work.bodyHash).map(work => work.ref),
    updatedMetadata: evidence.works.filter(work => oldWorks.has(work.ref) && oldWorks.get(work.ref)!.metadataHash !== work.metadataHash).map(work => work.ref),
    removed: [...oldWorks.keys()].filter(ref => !currentRefs.has(ref)),
    addedComments: evidence.comments.filter(comment => !oldComments.has(comment.ref)).map(comment => comment.ref),
    changedComments: evidence.comments.filter(comment => oldComments.has(comment.ref) && oldComments.get(comment.ref)!.hash !== comment.hash).map(comment => comment.ref),
    removedComments: [...oldComments.keys()].filter(ref => !commentRefs.has(ref)),
    previousTextCount: previous?.evidence.works.filter(work => work.bodyHash).length ?? 0,
    currentTextCount: evidence.works.filter(work => work.bodyHash).length,
  };
  const reusable = evidence.works.flatMap(work => {
    const old = oldWorks.get(work.ref); const analysis = oldAnalyses.get(work.ref);
    if (!old || !analysis) return [];
    const same = work.bodyHash ? old.bodyHash === work.bodyHash && old.title === work.title && analysis.basis === "TEXT" : old.bodyHash === null && old.title === work.title && analysis.basis === "TITLE";
    return same ? [analysis] : [];
  });
  const reusedRefs = reusable.map(item => item.ref); const reusedSet = new Set(reusedRefs);
  const candidates = evidence.works.filter(work => !reusedSet.has(work.ref)).sort((a, b) => Number(Boolean(b.bodyHash)) - Number(Boolean(a.bodyHash)) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  let characters = 36000;
  const analyzedRefs: string[] = []; const pendingRefs: string[] = [];
  for (const work of candidates) {
    const cost = (work.bodyText || work.title).length;
    if (analyzedRefs.length >= 30 || cost > characters) { pendingRefs.push(work.ref); continue; }
    analyzedRefs.push(work.ref); characters -= cost;
  }
  return { schemaVersion: "account-research-v1", evidence, delta, previousRunId, analyzedRefs, reusedRefs, pendingRefs, workAnalyses: reusable, answer: null };
}
