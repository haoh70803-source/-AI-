import "server-only";
import { db } from "@content-center/db";
import { benchmarkCreatorProfileOutputV4Schema } from "@content-center/providers";
import type { ResearchSource } from "@content-center/core";
import { researchBenchmarkDetail } from "./benchmarks";
import { researchMember, ResearchError, type ResearchActor } from "./access";
import { researchBlocksSchema, researchScopeSchema } from "./contracts";
import { getLegacyResearchResult } from "./legacy";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import type { DossierWork } from "./benchmark-dossier-math";
import { accountResearchOverview, accountResearchView } from "./account-research-service";
import { deepResearchedWorkIds } from "./work-research-service";
import { recommendWorkResearch } from "./work-research-recommendations";
import { listAccountWorkDecisions } from "./work-research-assets";
import { accountV2Overview } from "./account-v2-service";

const signals: Record<string, string> = { SPECIFIC_PROBLEM: "具体问题切入", NUMBER_RESULT: "数字与结果", SURPRISING_CONTRAST: "反常识与对比", CASE_ENTRY: "案例切入", AUDIENCE_SCENARIO: "受众场景", RESULT_THEN_EXPLAIN: "先结果，再解释", PROBLEM_REASON_ACTION: "问题 → 原因 → 行动", STEP_BY_STEP: "分步骤展开", CASE_DATA_EVIDENCE: "案例与数据佐证", BEFORE_AFTER_COMPARE: "前后对照", EXPERIENCE_STORY: "经历与故事", QUESTION_DRIVEN: "提问推进" };

export async function researchBenchmarkDossier(actor: ResearchActor, accountId: string, runId?: string, range: { from?: string; to?: string } = {}) {
  const detail = await researchBenchmarkDetail(actor, accountId, { runId, view: "dossier" });
  const [savedResearchRuns, study, compareAccounts] = await Promise.all([
    db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED", savedAt: { not: null }, inputScope: { path: ["benchmarkAccountIds"], array_contains: [accountId] }, session: { workspaceId: actor.workspaceId, createdById: actor.userId, entryTemplate: "BENCHMARK" } }, orderBy: { savedAt: "desc" }, take: 100, select: { id: true, blocks: true, coverage: true, savedAt: true, sessionId: true, inputScope: true } }),
    db.benchmarkStudy.findFirst({ where: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId, status: "COMPLETED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, output: true, version: true, sampleCount: true, createdAt: true, samples: { select: { sourceItemId: true, sourceItem: { select: { workspaceId: true } } } } } }),
    db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true, id: { not: accountId } }, select: { id: true, name: true, platform: true }, orderBy: { updatedAt: "desc" }, take: 60 }),
  ]);
  const latestRun = savedResearchRuns.find(run => { const parsed = researchScopeSchema.safeParse(run.inputScope); return parsed.success && parsed.data.researchProfile !== "WORK_DEEP"; }) ?? null;
  const safeStudy = study && study.samples.every(sample => sample.sourceItem.workspaceId === actor.workspaceId) ? study : null;
  const legacy = safeStudy ? await getLegacyResearchResult(actor, safeStudy.id) : null;
  const runBlocks = latestRun ? researchBlocksSchema.safeParse(latestRun.blocks) : null;
  const blocks = runBlocks?.success ? runBlocks.data : legacy?.blocks ?? [];
  const sources = blocks.flatMap(block => block.type === "sources" ? block.refs : []);
  const cards = blocks.flatMap(block => {
    if (block.type !== "text" || block.provenance !== "AI_INTERPRETATION") return [];
    const citations = sources.filter(source => block.sourceRefs.includes(source.ref));
    if (!citations.length) return [];
    if (block.id.startsWith("account-finding-")) {
      const labels: Record<string, string> = { "观众任务": "在解决什么问题", "主题观察": "主要在讲什么", "开头观察": "怎样吸引注意", "内容结构": "通常怎样展开", "可借鉴": "值得借鉴", "不可照搬": "不建议照搬" };
      return block.text.split("\n").flatMap((line, index) => { const split = line.indexOf("："); const label = labels[line.slice(0, split)]; return label ? [{ id: `${block.id}-${index}`, title: label, text: line.slice(split + 1), limitation: block.limitation, sources: citations }] : []; });
    }
    return [{ id: block.id, title: block.title, text: block.text, limitation: block.limitation, sources: citations }];
  });
  const parsed = safeStudy ? benchmarkCreatorProfileOutputV4Schema.safeParse(safeStudy.output) : null;
  const validSourceIds = new Set(safeStudy?.samples.map(sample => sample.sourceItemId));
  const linkedSourceIds = new Set(detail.works.flatMap(work => work.sourceItemId ? [work.sourceItemId] : []));
  const classifications = parsed?.success ? [...new Map(parsed.data.videoSignals.filter(item => validSourceIds.has(item.sourceItemId) && linkedSourceIds.has(item.sourceItemId)).map(item => [item.sourceItemId, item])).values()] : [];
  const topicBySource = new Map(classifications.map(item => [item.sourceItemId, item.primaryTopic]));
  const groupSignals = (kind: "topicSignals" | "styleSignals") => {
    const grouped = new Map<string, Set<string>>();
    for (const item of classifications) for (const signal of item[kind]) {
      if (!signal.evidence.some(evidence => evidence.sourceItemId === item.sourceItemId)) continue;
      const refs = grouped.get(signal.code) ?? new Set<string>(); refs.add(item.sourceItemId); grouped.set(signal.code, refs);
    }
    return [...grouped].map(([code, ids]) => ({ name: signals[code] || code, sourceItemIds: [...ids], count: ids.size })).sort((a, b) => b.count - a.count);
  };
  const works: DossierWork[] = detail.works.map(work => ({ ...work, readable: "readable" in work && Boolean(work.readable), timed: "timed" in work && Boolean(work.timed), openingSnippet: "openingSnippet" in work && typeof work.openingSnippet === "string" ? work.openingSnippet : null, topic: work.sourceItemId ? topicBySource.get(work.sourceItemId) ?? null : null }));
  const [living, accountV2] = await Promise.all([
    accountResearchOverview(actor, accountId, { collectionRunId: runId ?? detail.selected?.id ?? "history", ...range }),
    accountV2Overview(actor, accountId),
  ]);
  const researchView = accountResearchView(living);
  if (living.state?.answer) {
    const savedWorks = new Map(living.state.evidence.works.map(work => [work.id, work]));
    const analyses = new Map(living.state.workAnalyses.map(item => [item.ref, item]));
    const current = new Map(living.currentEvidence.map(work => [work.id, work]));
    for (const work of works) {
      const saved = savedWorks.get(work.id); const analysis = saved ? analyses.get(saved.ref) : null; const now = current.get(work.id);
      work.topic = analysis?.topic ?? null; work.topicBasis = analysis?.basis ?? null;
      work.researchStatus = !analysis ? "NOT_ANALYZED" : saved && now && (saved.bodyHash !== now.bodyHash || saved.metadataHash !== now.metadataHash) ? "OUTDATED" : analysis.basis === "TITLE" ? "TITLE_ONLY" : "CURRENT";
    }
  } else for (const work of works) { work.topicBasis = work.topic ? "TEXT" : null; work.researchStatus = work.topic ? "CURRENT" : "NOT_ANALYZED"; }
  const deepIds = await deepResearchedWorkIds(actor, accountId, works.map(work => work.id));
  for (const work of works) work.deepResearched = deepIds.has(work.id);
  const v2Assets = living.currentSnapshot ? await listAccountWorkDecisions(actor, accountId, living.currentSnapshot.works) : [];
  const comments = detail.commentCount ? await db.benchmarkComment.findMany({ where: { snapshotId: { in: works.map(work => work.id) }, snapshot: { workspaceId: actor.workspaceId, benchmarkAccountId: accountId } }, orderBy: [{ likes: "desc" }, { id: "desc" }], take: 50, select: { id: true, text: true, likes: true, postedAt: true, snapshotId: true } }) : [];
  return {
    account: detail.account, compareAccounts, accountResearch: researchView,
    accountV2: { ...accountV2, currentWorkCount: v2Assets.filter(item => item.current).length, workIds: v2Assets.filter(item => item.current).map(item => item.workId) },
    works, recommendations: recommendWorkResearch(works), total: detail.workCount, limited: detail.workCount > works.length,
    scope: detail.selected ? { id: detail.selected.id, status: detail.selected.status, from: detail.selected.rangeStart.toISOString(), to: detail.selected.rangeEnd.toISOString(), capturedAt: detail.selected.createdAt.toISOString(), note: detail.selected.stopReason, undated: detail.selected.undatedCount } : null,
    runs: detail.runs.map(run => ({ id: run.id, status: run.status, from: run.rangeStart.toISOString(), to: run.rangeEnd.toISOString(), count: run.inRangeCount })), activeRun: detail.activeRun ? { id: detail.activeRun.id, status: detail.activeRun.status } : null,
    analysis: latestRun && runBlocks?.success ? { kind: "run" as const, id: latestRun.id, date: latestRun.savedAt!.toISOString(), label: "我的已保存研究", sessionId: latestRun.sessionId } : safeStudy ? { kind: "study" as const, id: safeStudy.id, date: safeStudy.createdAt.toISOString(), label: `历史研究 · 第 ${safeStudy.version} 版`, sessionId: null } : null,
    cards, classifications: { count: classifications.length, topics: [...new Set(classifications.map(item => item.primaryTopic))].map(name => ({ name, sourceItemIds: classifications.filter(item => item.primaryTopic === name).map(item => item.sourceItemId) })), openings: groupSignals("topicSignals"), structures: groupSignals("styleSignals"), source: safeStudy ? { id: safeStudy.id, version: safeStudy.version, date: safeStudy.createdAt.toISOString() } : null },
    comments: comments.map(comment => ({ ...comment, postedAt: comment.postedAt?.toISOString() ?? null })), commentTotal: detail.commentCount,
    history: [...detail.savedRuns.map(run => ({ id: run.id, kind: "run", title: run.resultTitle || run.question, date: run.savedAt!.toISOString(), sampleCount: null as number | null })), ...detail.studies.map(item => ({ id: item.id, kind: "study", title: `历史账号研究 · 第 ${item.version} 版`, date: item.createdAt.toISOString(), sampleCount: item.sampleCount }))],
  };
}

export async function researchBenchmarkWork(actor: ResearchActor, accountId: string, workId: string) {
  await researchMember(actor);
  const work = await db.benchmarkContentSnapshot.findFirst({ where: { id: workId, workspaceId: actor.workspaceId, benchmarkAccountId: accountId, benchmarkAccount: { workspaceId: actor.workspaceId, enabled: true } }, select: { id: true, title: true, url: true, platform: true, externalId: true, observations: { orderBy: { observedAt: "desc" }, take: 30, select: { observedAt: true, metrics: true } } } });
  if (!work) throw new ResearchError("NOT_FOUND", "作品不存在或不可访问。", 404);
  const source = await db.sourceItem.findFirst({ where: { workspaceId: actor.workspaceId, sourcePlatform: work.platform, externalId: work.externalId, status: { not: "ARCHIVED" } }, select: { id: true } });
  const readable = source ? await getMaterialReadableContent({ ...actor, sourceItemId: source.id }) : null;
  return { id: work.id, title: work.title, url: /^https:\/\//i.test(work.url) ? work.url : null, sourceItemId: source?.id ?? null, text: readable?.contentText.slice(0, 20000) ?? null, truncated: (readable?.contentText.length ?? 0) > 20000, origin: readable?.contentSource ?? null, version: readable?.version ?? null,
    observations: work.observations.map(item => ({ at: item.observedAt.toISOString(), metrics: item.metrics })) };
}
export type BenchmarkDossier = Awaited<ReturnType<typeof researchBenchmarkDossier>>;
export type BenchmarkWorkReading = Awaited<ReturnType<typeof researchBenchmarkWork>>;
export type DossierCitation = ResearchSource;
