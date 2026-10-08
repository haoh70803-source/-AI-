import "server-only";
import { createHash } from "node:crypto";
import { db } from "@content-center/db";
import { ResearchError, researchMember, type ResearchActor } from "./access";
import { researchScopeSchema, type ResearchScope } from "./contracts";
import { collectAccountResearchEvidence } from "./account-research-evidence";
import { listAccountWorkDecisions } from "./work-research-assets";
import { digestWorkDecision } from "./account-v2-evidence";
import { parseAccountV2State } from "./account-v2-contract";
import { focusV2StateSchema, type FocusV2State, type FocusPattern, type FocusWork } from "./focus-v2-contract";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function collectFocusV2State(actor: ResearchActor, question: string, scope: ResearchScope): Promise<FocusV2State> {
  await researchMember(actor, true);
  const accountIds = [...new Set(scope.benchmarkAccountIds)];
  if (!accountIds.length || accountIds.length > 3) throw new ResearchError("FOCUS_ACCOUNT_REQUIRED", "请选择一个到三个对标账号。", 400);
  const accounts = await db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true, id: { in: accountIds } },
    select: { id: true, name: true, platform: true } });
  if (accounts.length !== accountIds.length) throw new ResearchError("BENCHMARK_NOT_FOUND", "所选账号不存在或不可访问。", 404);
  const perAccount = await Promise.all(accounts.map(async account => {
    const evidence = await collectAccountResearchEvidence(actor, researchScopeSchema.parse({ benchmarkAccountIds: [account.id] }));
    const assets = (await listAccountWorkDecisions(actor, account.id, evidence.works)).filter(item => item.current);
    const works = assets.map(asset => ({ ...digestWorkDecision(asset, evidence.works.find(item => item.id === asset.workId)?.title ?? "作品"),
      accountId: account.id, accountName: account.name }));
    const previous = await db.researchRun.findFirst({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId,
      status: "COMPLETED", AND: [{ inputScope: { path: ["researchProfile"], equals: "ACCOUNT_V2" } },
        { inputScope: { path: ["benchmarkAccountIds"], array_contains: [account.id] } }],
      session: { workspaceId: actor.workspaceId, createdById: actor.userId } }, orderBy: { finishedAt: "desc" },
      select: { coverage: true } });
    const accountState = parseAccountV2State(previous?.coverage);
    const patterns = accountState?.account.id === account.id && accountState.answer ? accountState.answer.patterns.map(item => ({
      accountId: account.id, id: item.id, name: item.name, howUsed: item.howUsed,
      workRefs: item.workRefs, counterRefs: item.counterRefs, limitation: item.limitation })) : [];
    return { works, patterns };
  }));
  const allWorks = perAccount.flatMap(item => item.works);
  if (!allWorks.length) throw new ResearchError("WORK_ANALYSIS_REQUIRED", "专项研究需要已完成的新版作品深拆；可以先在账号作品库选择代表作品。", 409);
  const manual = new Set(scope.focusWorkIds ?? []);
  if (manual.size && [...manual].some(id => !allWorks.some(work => work.workId === id))) throw new ResearchError("WORK_ANALYSIS_REQUIRED", "手动选中的作品尚未完成新版深拆或证据已变化。", 409);
  const candidates = manual.size ? allWorks.filter(work => manual.has(work.workId)) : allWorks;
  const grouped = accounts.map(account => candidates.filter(work => work.accountId === account.id)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")));
  const ordered: FocusWork[] = [];
  while (grouped.some(items => items.length)) for (const items of grouped) if (items.length) ordered.push(items.shift()!);
  let remaining = 55000;
  const works: FocusWork[] = []; const deferredWorkIds: string[] = [];
  for (const item of ordered) { const cost = JSON.stringify(item).length;
    if (cost > remaining && works.length) { deferredWorkIds.push(item.workId); continue; }
    works.push(item); remaining -= cost;
  }
  const selectedRefs = new Set(works.map(work => work.ref));
  const patterns: FocusPattern[] = perAccount.flatMap(item => item.patterns).filter(item =>
    item.workRefs.length >= 2 && item.workRefs.every(ref => selectedRefs.has(ref)));
  const fingerprint = hash({ question, accountIds: accountIds.sort(), works: works.map(work => [work.workId, work.runId]),
    patterns: patterns.map(item => [item.accountId, item.id]), manual: [...manual].sort() });
  return focusV2StateSchema.parse({ schemaVersion: "focus-research-v2", question, capturedAt: new Date().toISOString(),
    fingerprint, accounts, works, patterns, deferredWorkIds, totalAvailableWorks: allWorks.length, answer: null });
}
