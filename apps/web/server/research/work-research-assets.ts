import "server-only";
import { db } from "@content-center/db";
import type { AccountEvidenceWork } from "./account-research-contract";
import { researchMember, type ResearchActor } from "./access";
import { parseWorkResearchState, type WorkDeepAnswerV2 } from "./work-research-contract";
import { workResearchSessionKey } from "./work-research-identity";

/** Latest reusable V2 work assets for account synthesis; V1 runs remain readable separately. */
export async function listAccountWorkDecisions(actor: ResearchActor, accountId: string, works: AccountEvidenceWork[]) {
  await researchMember(actor);
  if (!works.length) return [];
  const byKey = new Map(works.map(work => [workResearchSessionKey(actor, accountId, work.id), work]));
  const sessions = await db.researchSession.findMany({ where: { workspaceId: actor.workspaceId, createdById: actor.userId,
    requestKey: { in: [...byKey.keys()] } }, select: { requestKey: true,
    runs: { where: { workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED" },
      orderBy: { version: "desc" }, take: 8, select: { id: true, coverage: true, version: true, savedAt: true } } } });
  return sessions.flatMap(session => {
    const work = byKey.get(session.requestKey);
    const match = session.runs.map(run => ({ run, state: parseWorkResearchState(run.coverage) })).find(item =>
      item.state?.schemaVersion === "work-research-v2" && item.state.answer && item.state.evidence.accountId === accountId && item.state.evidence.workId === work?.id);
    if (!work || !match || match.state?.schemaVersion !== "work-research-v2" || !match.state.answer) return [];
    const current = match.state.evidence.title === work.title && match.state.evidence.contentVersion === work.contentVersion &&
      match.state.evidence.contentLength === work.bodyLength && match.state.evidence.contentText.slice(0, 8000) === work.bodyText;
    return [{ workId: work.id, ref: work.ref, runId: match.run.id, runVersion: match.run.version, saved: Boolean(match.run.savedAt),
      publishedAt: work.publishedAt, metrics: work.metrics, current,
      evidenceFingerprint: match.state.evidence.fingerprint, answer: match.state.answer as WorkDeepAnswerV2 }];
  }).sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") || a.workId.localeCompare(b.workId));
}
