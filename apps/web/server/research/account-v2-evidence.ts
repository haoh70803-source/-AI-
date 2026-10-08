import "server-only";
import { createHash } from "node:crypto";
import type { ResearchScope } from "./contracts";
import { ResearchError, type ResearchActor } from "./access";
import { collectAccountResearchEvidence } from "./account-research-evidence";
import { listAccountWorkDecisions } from "./work-research-assets";
import { accountV2StateSchema, type AccountV2State, type AccountWorkDigest } from "./account-v2-contract";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function digestWorkDecision(asset: Awaited<ReturnType<typeof listAccountWorkDecisions>>[number], title: string): AccountWorkDigest {
  const answer = asset.answer; const decision = answer.decision;
  const citations = [answer.understanding.citation, answer.topicIdea.citation, ...answer.structureBlocks.map(item => item.citation),
    ...answer.mechanisms.map(item => item.citation), answer.transferable.citation, decision.topicLogic.citation,
    decision.packaging.citation, decision.promisePayoff.citation, ...decision.claims.map(item => item.citation),
    ...decision.strengths.map(item => item.citation), ...decision.weaknesses.map(item => item.citation)];
  const unique = [...new Map(citations.map(item => [`${item.ref}:${item.quote}`, item])).values()].slice(0, 24);
  return { ref: `W${hash(asset.workId).slice(0, 12)}`, workId: asset.workId, runId: asset.runId,
    title, publishedAt: asset.publishedAt, views: asset.metrics.views, likes: asset.metrics.likes,
    topic: (answer.topicIdea.theme || answer.topicIdea.domain)?.slice(0, 200) ?? null,
    angle: decision.topicLogic.angle, oneLine: decision.executiveSummary.oneLine, playbook: decision.executiveSummary.corePlaybook,
    structure: answer.structureBlocks.map(item => item.role),
    proofKinds: [...new Set(decision.claims.map(item => item.proofKind))].filter(kind => kind !== "NONE"),
    expression: decision.expressionPatterns.map(item => item.finding), cta: decision.ctaAnalysis.action,
    strengths: decision.strengths.map(item => item.finding), weaknesses: decision.weaknesses.map(item => item.finding), citations: unique };
}
export async function collectAccountV2State(actor: ResearchActor, scope: ResearchScope): Promise<AccountV2State> {
  const evidence = await collectAccountResearchEvidence(actor, scope);
  const assets = (await listAccountWorkDecisions(actor, evidence.account.id, evidence.works)).filter(item => item.current);
  if (assets.length < 2) throw new ResearchError("WORK_COMPARISON_REQUIRED", "账号综合研究需要至少两条不同作品的新版深拆；你仍可先做快速扫描或继续研究作品。", 409);
  const digests = assets.map(asset => digestWorkDecision(asset, evidence.works.find(work => work.id === asset.workId)?.title ?? "作品"));
  // Interleave the newest and oldest analyses so a bounded context can still
  // compare periods. The cap is a prompt-size guard, never a study quota.
  const byDate = [...digests].sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
  const ordered: AccountWorkDigest[] = [];
  while (byDate.length) { ordered.push(byDate.pop()!); if (byDate.length) ordered.push(byDate.shift()!); }
  let remainingCharacters = 48000;
  const selected: AccountWorkDigest[] = []; const deferredWorkIds: string[] = [];
  for (const digest of ordered) {
    const cost = JSON.stringify(digest).length;
    if (cost > remainingCharacters && selected.length) { deferredWorkIds.push(digest.workId); continue; }
    selected.push(digest); remainingCharacters -= cost;
  }
  const fingerprint = hash({ evidence: evidence.fingerprint, analyses: selected.map(item => ({ workId: item.workId, runId: item.runId })) });
  return accountV2StateSchema.parse({ schemaVersion: "account-research-v2", account: evidence.account,
    capturedAt: new Date().toISOString(), fingerprint, collectionRunId: evidence.collectionRunId,
    totalWorks: evidence.totalWorks, readableWorks: evidence.works.filter(work => work.bodyHash).length,
    selected, deferredWorkIds, answer: null });
}
