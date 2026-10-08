import "server-only";
import { db } from "@content-center/db";
import type { ResearchBlock, ResearchCoverage } from "@content-center/core";
import { personalSessionWhere, researchMember, ResearchError, type ResearchActor } from "./access";
import { researchBlocksSchema, researchScopeSchema, researchSelectionSchema } from "./contracts";
import { parseAccountResearchState } from "./account-research-contract";
import { parseWorkResearchState } from "./work-research-contract";
import { parseAccountV2State } from "./account-v2-contract";
import { parseTopicOpportunityV2State } from "./topic-opportunity-v2-contract";
import { parseFocusV2State } from "./focus-v2-contract";
import { getLegacyResearchResult } from "./legacy";
import { buildResearchSharePreview } from "./sharing";
import type { ResearchSessionView } from "./service";
import { parseTrendStableKey } from "./trends";

export function researchSessionView(session: ResearchSessionView) {
  return { session: { id: session.id, title: session.title, entryTemplate: session.entryTemplate, project: session.project ? { id: session.project.id, title: session.project.title } : null }, hasOlder: session.hasOlder,
    runs: session.runs.map(run => ({ id: run.id, question: run.question, version: run.version, status: run.status, stage: run.stage, savedAt: run.savedAt?.toISOString() ?? null, createdAt: run.createdAt.toISOString(), errorMessage: run.errorMessage, blocks: researchBlocksSchema.parse(run.blocks), scope: researchScopeSchema.parse(run.inputScope), coverage: run.coverage && typeof run.coverage === "object" && "requested" in run.coverage ? run.coverage as unknown as ResearchCoverage : null })) };
}
export async function listResearchResults(actor: ResearchActor, query = "") {
  await researchMember(actor);
  return db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId, session: personalSessionWhere(actor), status: "COMPLETED", savedAt: { not: null }, ...(query.trim() ? { OR: [{ question: { contains: query.trim().slice(0, 100), mode: "insensitive" as const } }, { resultTitle: { contains: query.trim().slice(0, 100), mode: "insensitive" as const } }] } : {}) }, orderBy: [{ savedAt: "desc" }, { id: "desc" }], take: 30, select: { id: true, question: true, resultTitle: true, savedAt: true, version: true, sessionId: true, session: { select: { entryTemplate: true, title: true } } } });
}
export async function getResearchResult(actor: ResearchActor, runId: string, options: { includeUnsaved?: boolean } = {}) {
  await researchMember(actor);
  const run = await db.researchRun.findFirst({ where: { id: runId, workspaceId: actor.workspaceId, requestedById: actor.userId, session: personalSessionWhere(actor), status: "COMPLETED", ...(options.includeUnsaved ? {} : { savedAt: { not: null } }) }, include: { session: { select: { id: true, title: true } } } });
  if (!run) throw new ResearchError("NOT_FOUND", "研究成果不存在或未保存。", 404);
  return { ...run, blocks: researchBlocksSchema.parse(run.blocks) as ResearchBlock[] };
}

export async function researchResultLibrary(actor: ResearchActor, input: { q?: string; library?: string; type?: string; projectId?: string; accountId?: string; trendKey?: string; before?: string; page?: string }) {
  await researchMember(actor);
  const page = Math.min(1000, Math.max(1, Number(input.page) || 1));
  const take = 20; const query = input.q?.trim().slice(0, 100);
  const date = input.before && /^\d{4}-\d{2}-\d{2}$/.test(input.before) ? new Date(`${input.before}T23:59:59.999+08:00`) : null;
  const before = date && !Number.isNaN(date.getTime()) ? date : undefined;
  if (input.library === "workspace") {
    const where = { workspaceId: actor.workspaceId, status: "COMPLETED" as const, ...(input.accountId ? { benchmarkAccountId: input.accountId } : {}), ...(query ? { benchmarkAccount: { name: { contains: query, mode: "insensitive" as const } } } : {}), ...(before ? { createdAt: { lte: before } } : {}) };
    const [rows, count] = await Promise.all([db.benchmarkStudy.findMany({ where, select: { id: true, version: true, createdAt: true, sampleCount: true, _count: { select: { sharedArtifacts: true } }, benchmarkAccount: { select: { id: true, name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take }), db.benchmarkStudy.count({ where })]);
    return { items: rows.map(row => ({ id: row.id, kind: "study", title: `${row.benchmarkAccount.name} · 历史研究 ${row.version}`, date: row.createdAt, label: "工作空间历史", context: `${row.sampleCount} 条保存样本 · ${row.benchmarkAccount.name}`, summary: null, sourceCount: null, sampleCount: row.sampleCount, sharedCount: row._count.sharedArtifacts })), count, page, pages: Math.max(1, Math.ceil(count / take)) };
  }
  const scopeFilters = [...(input.library === "clippings" ? [{ coverage: { path: ["manualClipping"], equals: true } }] : []), ...(input.accountId ? [{ inputScope: { path: ["benchmarkAccountIds"], array_contains: [input.accountId] } }] : []), ...(input.trendKey ? [{ inputScope: { path: ["trendKeys"], array_contains: [input.trendKey] } }] : [])];
  const where = { workspaceId: actor.workspaceId, requestedById: actor.userId, session: { ...personalSessionWhere(actor), ...(input.projectId ? { projectId: input.projectId } : {}), ...(["DIRECT", "BREAKDOWN", "OPPORTUNITY", "BENCHMARK"].includes(input.type ?? "") ? { entryTemplate: input.type } : {}) }, status: "COMPLETED" as const, savedAt: { not: null, ...(before ? { lte: before } : {}) }, ...(scopeFilters.length ? { AND: scopeFilters } : {}), ...(query ? { OR: [{ question: { contains: query, mode: "insensitive" as const } }, { resultTitle: { contains: query, mode: "insensitive" as const } }] } : {}) };
  const [rows, count] = await Promise.all([db.researchRun.findMany({ where, select: { id: true, question: true, resultTitle: true, savedAt: true, version: true, blocks: true, sourceRefs: true, coverage: true, _count: { select: { sharedArtifacts: true } }, session: { select: { entryTemplate: true, project: { select: { title: true } } } } }, orderBy: [{ savedAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take }), db.researchRun.count({ where })]);
  return { items: rows.map(row => {
    const parsed = researchBlocksSchema.safeParse(row.blocks);
    const manual = Boolean(row.coverage && typeof row.coverage === "object" && !Array.isArray(row.coverage) && row.coverage.manualClipping === true);
    const conclusion = parsed.success ? parsed.data.find(block => block.type === "text" && (manual ? block.id === "quote" : block.provenance === "AI_INTERPRETATION")) : undefined;
    const sources = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
    const externalSources = sources.filter(source => source && typeof source === "object" && "kind" in source && ["MATERIAL", "BENCHMARK_ACCOUNT", "BENCHMARK_WORK", "TREND"].includes(String(source.kind)));
    const coverage = row.coverage && typeof row.coverage === "object" && !Array.isArray(row.coverage) ? row.coverage : {};
    return { id: row.id, kind: "run", title: row.resultTitle || row.question, date: row.savedAt!, label: manual ? "私人手工摘录" : "私人研究", context: `${row.session.project ? `项目背景：${row.session.project.title}` : "个人研究"} · 第 ${row.version} 次提问`, summary: conclusion?.type === "text" ? conclusion.text.replace(/\s+/g, " ").slice(0, 160) : null, sourceCount: externalSources.length, sampleCount: typeof coverage.aiSampleCount === "number" ? coverage.aiSampleCount : null, sharedCount: row._count.sharedArtifacts };
  }), count, page, pages: Math.max(1, Math.ceil(count / take)) };
}
export async function researchProjectOptions(actor: ResearchActor) {
  await researchMember(actor);
  return db.contentProject.findMany({ where: { workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 100 });
}

/** Stable, owner-scoped saved result input for future consumers. Project sharing remains explicit. */
export async function getResearchReadableContent(actor: ResearchActor, runId: string) {
  const result = await getResearchResult(actor, runId);
  const state = parseAccountResearchState(result.coverage);
  const accountV2 = parseAccountV2State(result.coverage);
  const opportunityV2 = parseTopicOpportunityV2State(result.coverage);
  const focusV2 = parseFocusV2State(result.coverage);
  const work = parseWorkResearchState(result.coverage);
  const title = result.resultTitle || result.question;
  const content = buildResearchSharePreview(title, result.blocks);
  return { id: result.id, sessionId: result.sessionId, title, version: result.version,
    savedAt: result.savedAt!.toISOString(), text: content.body, blocks: result.blocks,
    sources: result.blocks.flatMap(block => block.type === "sources" ? block.refs : []),
    evidenceFingerprint: work?.evidence.fingerprint ?? accountV2?.fingerprint ?? opportunityV2?.fingerprint ?? focusV2?.fingerprint ?? state?.evidence.fingerprint ?? null,
    evidenceCapturedAt: work?.evidence.capturedAt ?? accountV2?.capturedAt ?? opportunityV2?.capturedAt ?? focusV2?.capturedAt ?? state?.evidence.capturedAt ?? null,
    structured: focusV2?.answer ? { kind: "FOCUS_V2" as const, question: focusV2.question,
      accountIds: focusV2.accounts.map(item => item.id), workAnalyses: focusV2.works.map(item => ({ workId: item.workId, runId: item.runId, oneLine: item.oneLine })),
      patterns: focusV2.patterns, findings: focusV2.answer.findings, comparisons: focusV2.answer.comparisons,
      dissent: focusV2.answer.dissent, evolution: focusV2.answer.whatChanged, transferable: focusV2.answer.transferable,
      evidenceRefs: result.sourceRefs } : opportunityV2?.answer ? { kind: "TOPIC_OPPORTUNITY_V2" as const, trendKey: opportunityV2.trend.stableKey,
      projectId: opportunityV2.project.id, angleClusters: opportunityV2.answer.angleClusters,
      crowded: opportunityV2.answer.crowded, underused: opportunityV2.answer.underused,
      businessFit: opportunityV2.answer.businessFit, opportunities: opportunityV2.answer.opportunities,
      evidenceRefs: result.sourceRefs } : accountV2?.answer ? { kind: "ACCOUNT_V2" as const, accountId: accountV2.account.id,
      findings: accountV2.answer.inOneSentence, workAnalyses: accountV2.selected.map(item => ({ workId: item.workId, runId: item.runId, oneLine: item.oneLine })),
      patterns: accountV2.answer.patterns, evolution: accountV2.answer.evolution, skillCandidates: accountV2.answer.skillCandidates,
      evidenceRefs: result.sourceRefs } : work?.answer ? { kind: "WORK_DEEP" as const, accountId: work.evidence.accountId, workId: work.evidence.workId, depth: work.depth,
      understanding: work.answer.understanding, topicIdea: work.answer.topicIdea, structureBlocks: work.answer.structureBlocks,
      mechanisms: work.answer.mechanisms, transferable: work.answer.transferable,
      ...(work.schemaVersion === "work-research-v2" ? { decision: work.answer.decision } : {}), evidenceRefs: result.sourceRefs } : state?.answer ? {
      kind: "ACCOUNT" as const, findings: state.answer.findings, workAnalyses: state.workAnalyses, comparisons: state.answer.comparisons,
      recentChanges: state.answer.recentChanges, templates: state.answer.templates, evidenceRefs: result.sourceRefs,
    } : null,
    contentOrigin: "AI_RESEARCH" as const, href: `/research/results/run/${result.id}` };
}

/** Owner membership is checked here before resolving research-home links. */
export async function researchHomeInputs(actor: ResearchActor, input: { accounts?: string | string[]; trend?: string; material?: string }) {
  await researchMember(actor);
  const rawAccounts = typeof input.accounts === "string" ? [input.accounts] : input.accounts ?? [];
  const requestedAccounts = [...new Set(rawAccounts.flatMap(value => value.split(",")).filter(Boolean))];
  const accountIds = requestedAccounts.length <= 3 ? requestedAccounts : [];
  const updatedAccounts = await db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 4, select: { id: true, name: true, platform: true, updatedAt: true } });
  const accounts = accountIds.length ? await db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true, id: { in: accountIds } }, select: { id: true, name: true } }) : [];
  let trend: { key: string; title: string } | null = null;
  if (typeof input.trend === "string") {
    try {
      const identity = parseTrendStableKey(input.trend);
      const snapshot = await db.trendSnapshot.findFirst({ where: { workspaceId: actor.workspaceId, ...identity }, orderBy: [{ observedAt: "desc" }, { id: "desc" }], select: { title: true } });
      if (snapshot) trend = { key: input.trend, title: snapshot.title };
    } catch { /* Invalid links cannot attach out-of-scope trends. */ }
  }
  const selectedMaterial = typeof input.material === "string" ? await db.sourceItem.findFirst({ where: { id: input.material, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true, title: true, sourceType: true } }) : null;
  return { updatedAccounts, requestedAccounts, accountIds, accounts, trend, selectedMaterial };
}

export async function getSelectedResearch(actor: ResearchActor, kind: "run" | "study", resultId: string, selection: import("../../lib/contracts/references").ResearchSelection) {
  await researchMember(actor);
  const parsed = researchSelectionSchema.parse(selection);
  if (parsed.kind !== kind) throw new ResearchError("INVALID_SELECTION", "研究来源不一致，请重新选择。", 400);
  const result = kind === "run" ? await getResearchResult(actor, resultId, { includeUnsaved: true }) : await getLegacyResearchResult(actor, resultId);
  if (result.version !== parsed.version) throw new ResearchError("RESULT_CHANGED", "研究版本已变化，请重新查看并选择结论。", 409);
  const selected = parsed.items.map(item => {
    const original = result.blocks.find(block => block.id === item.id && block.type === "text");
    if (!original || original.type !== "text") throw new ResearchError("INVALID_SELECTION", "选中的结论不存在，请重新选择。", 400);
    return { ...original, text: item.text, limitation: item.text === original.text ? original.limitation : ["这段文字经用户调整，原研究未修改。", original.limitation].filter(Boolean).join(" ") };
  });
  const used = new Set(selected.flatMap(block => block.sourceRefs));
  const sources = result.blocks.filter(block => block.type === "sources").map(block => ({ ...block, refs: block.refs.filter(ref => used.has(ref.ref)), sourceRefs: block.sourceRefs.filter(ref => used.has(ref)) }));
  return { title: "resultTitle" in result ? result.resultTitle || result.question : result.title, version: result.version, blocks: [...selected, ...sources], selection: parsed };
}

export async function researchCreationTarget(actor: ResearchActor, projectId: string, options: { requireOwnThread?: boolean } = { requireOwnThread: true }) {
  await researchMember(actor);
  const project = await db.contentProject.findFirst({ where: { id: projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true, title: true, workspace: { select: { name: true } } } });
  if (!project) throw new ResearchError("PROJECT_NOT_FOUND", "项目不存在或已归档。", 404);
  const thread = await db.assistantThread.findFirst({ where: { workspaceId: actor.workspaceId, projectId, canvasObjectId: null }, select: { createdById: true } });
  if (options.requireOwnThread && thread && thread.createdById !== actor.userId) throw new ResearchError("THREAD_FORBIDDEN", "此项目对话属于其他成员。请选择其他项目，或仅分享获准的结论。", 403);
  return { actor, projectId, projectTitle: project.title, workspaceName: project.workspace.name, conversationVisibility: "这段项目对话仅你可见；保存为项目成果后，该工作空间有读取权限的有效成员（含只读成员）可见。" };
}

/** Existing material inventory, never a synthesized news feed or scheduled collection. */
export async function researchSourceInbox(actor: ResearchActor, params: { q?: string; view?: string; cursor?: string; days?: string } = {}) {
  await researchMember(actor);
  const preferences = await db.researchObjectPreference.findMany({
    where: { workspaceId: actor.workspaceId, userId: actor.userId, kind: "MATERIAL" },
    select: { objectKey: true, viewedAt: true, followedAt: true },
  });
  const q = params.q?.trim().slice(0, 100);
  const days = ["1", "3", "7", "30"].includes(params.days || "") ? Number(params.days) : null;
  const rows = await db.sourceItem.findMany({
    where: { workspaceId: actor.workspaceId, status: "READY",
      ...(days ? { createdAt: { gte: new Date(Date.now() - days * 86400000), lte: new Date() } } : {}),
      ...(params.view === "favorites" ? { id: { in: preferences.filter(p => p.followedAt).map(p => p.objectKey) } } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { rawText: { contains: q, mode: "insensitive" } }, { transcript: { is: { fullText: { contains: q, mode: "insensitive" } } } }] } : {}),
    },
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
    select: { id: true, title: true, sourceType: true, sourcePlatform: true, sourceUrl: true, createdAt: true, updatedAt: true, rawText: true, description: true,
      transcript: { select: { fullText: true } } },
  });
  const nextCursor = rows.length > 30 ? rows[29]!.id : null;
  const items = rows.slice(0, 30).map(row => {
    const preference = preferences.find(p => p.objectKey === row.id);
    const read = Boolean(preference?.viewedAt && preference.viewedAt >= row.updatedAt);
    const { rawText, transcript, description, ...source } = row;
    const text = rawText?.trim() || transcript?.fullText?.trim() || description?.trim() || "";
    return { ...source, excerpt: text.replace(/\s+/g, " ").slice(0, 260), excerptKind: rawText?.trim() ? "原文摘录" : transcript?.fullText?.trim() ? "机器文字稿摘录" : description?.trim() ? "来源描述" : "暂无可读正文", read, followed: Boolean(preference?.followedAt) };
  });
  return { items: params.view === "unread" ? items.filter(item => !item.read) : items, nextCursor };
}

export async function researchSourceDetail(actor: ResearchActor, id: string) {
  await researchMember(actor);
  const source = await db.sourceItem.findFirst({ where: { id, workspaceId: actor.workspaceId, status: "READY" },
    select: { id: true, title: true, sourceType: true, sourcePlatform: true, sourceUrl: true, createdAt: true, updatedAt: true, description: true } });
  if (!source) throw new ResearchError("NOT_FOUND", "资料不存在或无法访问。", 404);
  const { getMaterialReadableContent } = await import("../material-detail/readable-content");
  const [content, preference] = await Promise.all([getMaterialReadableContent({ ...actor, sourceItemId: id }), db.researchObjectPreference.findUnique({
    where: { workspaceId_userId_kind_objectKey: { ...actor, kind: "MATERIAL", objectKey: id } }, select: { viewedAt: true, followedAt: true },
  })]);
  const [clippings, topics] = await Promise.all([
    db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId, session: personalSessionWhere(actor), status: "COMPLETED", savedAt: { not: null }, coverage: { path: ["manualClipping"], equals: true }, inputScope: { path: ["materialIds"], array_contains: [id] } }, orderBy: { savedAt: "desc" }, take: 10, select: { id: true, resultTitle: true, question: true } }),
    db.contentIdea.findMany({ where: { workspaceId: actor.workspaceId, status: { not: "ARCHIVED" }, references: { some: { sourceItemId: id } } }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, title: true, projectId: true } }),
  ]);
  return { source, content, clippings: clippings.map(item => ({ id: item.id, title: item.resultTitle || item.question })), topics, read: Boolean(preference?.viewedAt && preference.viewedAt >= source.updatedAt), followed: Boolean(preference?.followedAt) };
}

/** Saved work queue. Publication dates stay distinct from collection observations. */
export async function researchWorkInbox(actor: ResearchActor, params: { q?: string; platform?: string; accountId?: string; view?: string; days?: string; includeDismissed?: boolean } = {}) {
  await researchMember(actor);
  const days = ["3","7","30"].includes(params.days || "") ? Number(params.days) : null;
  const platform = ["DOUYIN","XIAOHONGSHU","WECHAT","BILIBILI","YOUTUBE","TIKTOK","GENERIC","OTHER"].includes(params.platform || "") ? params.platform as "DOUYIN" : undefined;
  const q = params.q?.trim().slice(0,100);
  const [rows, preferences, accounts] = await Promise.all([
    db.benchmarkContentSnapshot.findMany({ where: { workspaceId: actor.workspaceId, benchmarkAccount: { enabled: true },
      ...(params.accountId ? { benchmarkAccountId: params.accountId } : {}), ...(platform ? { platform } : {}),
      ...(days ? { publishedAt: { gte: new Date(Date.now()-days*86400000), lte: new Date() } } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) }, orderBy: [{ publishedAt: "desc" }, { observedAt: "desc" }, { id: "desc" }], take: 100,
      select: { id: true, title: true, platform: true, externalId: true, url: true, publishedAt: true, observedAt: true, benchmarkAccountId: true,
        benchmarkAccount: { select: { name: true, researchNotes: true, lastSyncedAt: true } }, observations: { orderBy: { observedAt: "desc" }, take: 1, select: { metrics: true, observedAt: true } } } }),
    db.researchObjectPreference.findMany({ where: { ...actor, kind: { in: ["WORK", "WORK_DISMISSED"] } }, select: { kind: true, objectKey: true, viewedAt: true, followedAt: true } }),
    db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true }, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true } }),
  ]);
  const sources = rows.length ? await db.sourceItem.findMany({ where: { workspaceId: actor.workspaceId, status: "READY", OR: rows.map(row => ({ sourcePlatform: row.platform, externalId: row.externalId })) },
    select: { id: true, sourcePlatform: true, externalId: true, rawText: true, transcript: { select: { fullText: true } } } }) : [];
  const [reports, topics] = await Promise.all([
    rows.length ? db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId, session: personalSessionWhere(actor), status: "COMPLETED", OR: rows.map(row => ({ inputScope: { path: ["benchmarkWorkId"], equals: row.id } })) },
      select: { id: true, inputScope: true, version: true }, orderBy: { createdAt: "desc" }, take: 300 }) : [],
    sources.length ? db.contentIdeaReference.findMany({ where: { sourceItemId: { in: sources.map(source => source.id) }, idea: { workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } } },
      select: { sourceItemId: true, idea: { select: { id: true, title: true, projectId: true } } }, take: 300 }) : [],
  ]);
  const items = rows.map(row => {
    const preference = preferences.find(p => p.objectKey === row.id && p.kind === "WORK");
    const source = sources.find(source => source.sourcePlatform === row.platform && source.externalId === row.externalId);
    const report = reports.find(report => researchScopeSchema.safeParse(report.inputScope).data?.benchmarkWorkId === row.id);
    const metrics = row.observations[0]?.metrics; const values = metrics && typeof metrics === "object" && !Array.isArray(metrics) ? metrics : {};
    const count = (key: string) => { const value=values[key]; return typeof value==="number" && Number.isFinite(value) && value>=0 ? value : null; };
    return { ...row, observations: undefined, counts: { likes: count("likes"), comments: count("comments"), favorites: count("favorites"), shares: count("shares") },
      metricsObservedAt: row.observations[0]?.observedAt ?? null, sourceItemId: source?.id ?? null, readable: Boolean(source?.rawText?.trim() || source?.transcript?.fullText?.trim()),
      reportId: report?.id ?? null, topics: topics.filter(topic => topic.sourceItemId === source?.id).map(topic=>topic.idea),
      dismissed: preferences.some(p => p.objectKey === row.id && p.kind === "WORK_DISMISSED" && p.followedAt),
      read: Boolean(preference?.viewedAt), followed: Boolean(preference?.followedAt) };
  });
  return { items: params.includeDismissed ? items : params.view === "dismissed" ? items.filter(item=>item.dismissed) : params.view === "read" ? items.filter(item=>item.read && !item.dismissed) : params.view === "unread" ? items.filter(item=>!item.read && !item.dismissed) : params.view === "favorites" ? items.filter(item=>item.followed && !item.dismissed) : items.filter(item=>!item.dismissed), accounts, boundedCount: rows.length, unreadCount: items.filter(item=>!item.read&&!item.dismissed).length, readCount: items.filter(item=>item.read&&!item.dismissed).length, dismissedCount: items.filter(item=>item.dismissed).length };
}
