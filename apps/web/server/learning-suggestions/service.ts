import "server-only";

import { createHash } from "node:crypto";
import { db, type CreatorProfileSuggestionType, type MethodSuggestionType, type Prisma } from "@content-center/db";
import { benchmarkAnalysisOutputSchema } from "@content-center/providers";
import { z } from "zod";
import { AIControlService } from "../ai/control/ai-control-service";
import { ActionPermissionPolicy } from "../ai/control/action-permission";
import type { ContextBuilderV2Result } from "../ai/control/context-builder-v2";
import type { ContextManifest, ContextOwnership, WorkspaceRoleName } from "../ai/control/contracts";
import { normalizeCreatorProfileInput, type CreatorProfileInput } from "../creator-profile-service";
import { createMethodFromBenchmarkStudy } from "../methods/service";

const methodTypes = ["OPENING", "STRUCTURE", "VIEWPOINT_PROGRESSION", "CASE_USAGE", "EVIDENCE_USAGE", "ENDING", "RHYTHM", "BOUNDARY"] as const;
const profileTypes = ["CORE_TOPIC", "PERSONAL_VIEW", "HOOK_PREFERENCE", "STRUCTURE_PREFERENCE", "PREFERRED_STYLE", "FORBIDDEN_STYLE", "EXAMPLE_PHRASE"] as const;
const methodSelectionSchema = z.object({ suggestions: z.array(z.object({ sourceMethodIndex: z.number().int().nonnegative(), type: z.enum(methodTypes), rationale: z.string().trim().min(1).max(600) }).strict()).max(5) }).strict();
const profileOutputSchema = z.object({ suggestions: z.array(z.object({ type: z.enum(profileTypes), proposedValue: z.string().trim().min(1).max(500), rationale: z.string().trim().min(1).max(600), evidenceRevisionIds: z.array(z.string().trim().min(1).max(200)).min(3).max(10) }).strict()).max(5) }).strict();
const methodTypeLabels: Record<MethodSuggestionType, string> = { OPENING: "开头方式", STRUCTURE: "结构方式", VIEWPOINT_PROGRESSION: "观点推进", CASE_USAGE: "案例使用", EVIDENCE_USAGE: "证据使用", ENDING: "结尾方式", RHYTHM: "表达节奏", BOUNDARY: "边界与避坑" };
const profileTypeLabels: Record<CreatorProfileSuggestionType, string> = { CORE_TOPIC: "常见主题", PERSONAL_VIEW: "常见观点", HOOK_PREFERENCE: "开头方式", STRUCTURE_PREFERENCE: "结构偏好", PREFERRED_STYLE: "表达习惯", FORBIDDEN_STYLE: "不喜欢的表达", EXAMPLE_PHRASE: "常用句式" };

export class LearningSuggestionError extends Error {
  constructor(readonly code: "NOT_FOUND" | "FORBIDDEN" | "NOT_READY" | "INVALID_INPUT" | "ALREADY_REVIEWED", message: string) { super(message); this.name = "LearningSuggestionError"; }
}

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function list(value: string | string[]) { return typeof value === "string" ? [value] : value; }
function normalized(value: string) { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\s，,。；;：:！？!?、“”‘’（）()《》【】\-—]/gu, ""); }
function fingerprint(parts: string[]) { return createHash("sha256").update(parts.join("|")).digest("hex"); }

async function roleFor(workspaceId: string, userId: string) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
  if (!member) throw new LearningSuggestionError("FORBIDDEN", "当前账号不能处理这些建议。");
  return member.role as WorkspaceRoleName;
}

function preparedContext(input: { workspaceId: string; userId: string; task: "METHOD_SUGGESTION_FROM_RESEARCH" | "CREATOR_PROFILE_SUGGESTION"; ownership: ContextOwnership; items: Array<{ id: string; version: string | number; content: unknown }> }): ContextBuilderV2Result {
  const manifestCore = { schemaVersion: "ai-context-manifest-v1" as const, generatedAt: new Date().toISOString(), project: { id: null, version: input.items.map(({ version }) => version).join(",") }, currentDraft: null, selectedObjects: [], methodVersions: [], creatorProfile: null, confirmedInformationRefs: input.ownership === "OWN_CONFIRMED" ? input.items.map(({ id }) => id) : [], sourceRefs: input.items.map(({ id }) => id), externalRefs: input.ownership === "EXTERNAL" ? input.items.map(({ id }) => id) : [], conversationMessageRefs: [], items: input.items.map((entry) => ({ objectType: input.task === "METHOD_SUGGESTION_FROM_RESEARCH" ? "BENCHMARK_RESEARCH" : "CONFIRMED_DRAFT_REVISION", objectId: entry.id, version: entry.version, ownership: input.ownership, provenance: input.task.toLowerCase(), whySelected: input.task === "METHOD_SUGGESTION_FROM_RESEARCH" ? "已完成的多样本研究" : "负责人已确认的稿件", truncated: false, content: JSON.stringify(entry.content) })), truncation: { any: false, categories: {} } };
  const manifest: ContextManifest = { ...manifestCore, manifestId: fingerprint([JSON.stringify(manifestCore)]).slice(0, 24) };
  return { context: { task: input.task, items: input.items }, snapshot: null, ownFacts: [], hasOwnEvidence: false, hasOwnCaseOrData: false, ownContribution: "NONE", hasOwnBackground: false, contextTruncated: false, selectedMethods: [], defaultMethod: null, inputSummary: { itemCount: input.items.length }, manifest } as unknown as ContextBuilderV2Result;
}

function methodDTO(row: { id: string; sourceBenchmarkStudyId: string; type: MethodSuggestionType; title: string; steps: Prisma.JsonValue; applicableScenarios: Prisma.JsonValue; boundaries: Prisma.JsonValue; rationale: string; stability: "LIMITED" | "STABLE"; sampleCount: number; sourceRefs: Prisma.JsonValue; evidence: Prisma.JsonValue; status: "PENDING" | "ACCEPTED" | "REJECTED"; savedMethodAssetId: string | null }) {
  return { id: row.id, studyId: row.sourceBenchmarkStudyId, type: row.type, typeLabel: methodTypeLabels[row.type] ?? row.type, title: row.title, steps: strings(row.steps), applicableScenarios: strings(row.applicableScenarios), boundaries: strings(row.boundaries), rationale: row.rationale, stability: row.stability, stabilityLabel: row.stability === "STABLE" ? "多条内容中反复出现" : "目前只在少量样本中看到", sampleCount: row.sampleCount, sourceRefs: strings(row.sourceRefs), evidence: row.evidence, status: row.status, statusLabel: row.status === "PENDING" ? "待处理" : row.status === "ACCEPTED" ? "已保存" : "不采用", savedMethodAssetId: row.savedMethodAssetId };
}

export async function listMethodSuggestions(input: { workspaceId: string; userId: string; benchmarkAccountId: string }) {
  await roleFor(input.workspaceId, input.userId);
  const rows = await db.methodSuggestion.findMany({ where: { workspaceId: input.workspaceId, sourceBenchmarkStudy: { benchmarkAccountId: input.benchmarkAccountId } }, orderBy: { createdAt: "desc" } });
  return rows.map(methodDTO);
}

export async function generateMethodSuggestions(input: { workspaceId: string; userId: string; benchmarkAccountId: string; benchmarkStudyId: string }, dependencies: { controlService?: AIControlService } = {}) {
  const role = await roleFor(input.workspaceId, input.userId); if (role === "VIEWER") throw new LearningSuggestionError("FORBIDDEN", "当前权限可以查看建议，但不能重新整理。");
  const study = await db.benchmarkStudy.findFirst({ where: { id: input.benchmarkStudyId, workspaceId: input.workspaceId, benchmarkAccountId: input.benchmarkAccountId, status: "COMPLETED" }, include: { samples: { select: { id: true, sourceItemId: true, sourceItem: { select: { title: true } } } } } });
  const parsed = study ? benchmarkAnalysisOutputSchema.safeParse(study.output) : null;
  if (!study || !parsed?.success || !parsed.data.commonMethods.length) throw new LearningSuggestionError("NOT_READY", "暂时没整理出可复用的方法，可以稍后再试。");
  const items = [{ id: study.id, version: study.version, content: { sampleCount: study.sampleCount, methods: parsed.data.commonMethods.map((method, index) => ({ index, title: method.title, howTo: method.howTo, applicable: method.applicable, boundaries: method.boundaries, occurrenceSampleIds: method.occurrenceSampleIds, exceptionSampleIds: method.exceptionSampleIds })) } }];
  const context = preparedContext({ workspaceId: input.workspaceId, userId: input.userId, task: "METHOD_SUGGESTION_FROM_RESEARCH", ownership: "EXTERNAL", items });
  const run = await (dependencies.controlService ?? new AIControlService()).execute({ workspaceId: input.workspaceId, userId: input.userId, taskType: "METHOD_SUGGESTION_FROM_RESEARCH", requestedAction: "CREATE_RESEARCH_CANDIDATE", userInput: "从已完成研究中选择值得保存的创作方法", preparedContext: context, action: "METHOD_SUGGESTION_FROM_RESEARCH", operation: "METHOD_SUGGESTION_FROM_RESEARCH", promptVersion: 1, inputSummary: () => ({ benchmarkStudyId: study.id, sampleCount: study.sampleCount, methodCount: parsed.data.commonMethods.length }), metadata: () => ({ benchmarkStudyId: study.id }), auditMetadata: () => ({ benchmarkStudyId: study.id, sampleCount: study.sampleCount }), generate: (provider) => provider.generateStructured({ systemPrompt: "只从提供的研究方法中选择，不新增方法内容，不把外部事实写成我方事实。为每个选择标注方法类型并说明为什么值得尝试。", prompt: JSON.stringify(items[0]!.content), structuredOutput: { preferJsonSchema: true, schemaName: "method_suggestions_from_research" } }, methodSelectionSchema) });
  let created = 0;
  for (const suggestion of run.output.suggestions) {
    const method = parsed.data.commonMethods[suggestion.sourceMethodIndex]; if (!method) continue;
    const sourceRefs = [...new Set(method.occurrenceSampleIds.flatMap((id) => study.samples.find((sample) => sample.id === id)?.sourceItemId ?? []))];
    if (!sourceRefs.length || !method.evidence.length) continue;
    const dedupeKey = fingerprint([study.id, suggestion.type, normalized(method.title)]);
    const exists = await db.methodSuggestion.findUnique({ where: { dedupeKey }, select: { id: true } }); if (exists) continue;
    await db.methodSuggestion.create({ data: { workspaceId: input.workspaceId, ownerUserId: input.userId, sourceBenchmarkStudyId: study.id, sourceMethodIndex: suggestion.sourceMethodIndex, type: suggestion.type, title: method.title, steps: json(list(method.howTo)), applicableScenarios: json(list(method.applicable)), boundaries: json(list(method.boundaries)), rationale: suggestion.rationale, stability: study.sampleCount >= 3 && method.occurrenceSampleIds.length >= 3 ? "STABLE" : "LIMITED", sampleCount: method.occurrenceSampleIds.length, sourceRefs: json(sourceRefs), evidence: json(method.evidence), dedupeKey, generatedById: input.userId } }); created += 1;
  }
  return { created, items: await listMethodSuggestions({ workspaceId: input.workspaceId, userId: input.userId, benchmarkAccountId: study.benchmarkAccountId }) };
}

export async function decideMethodSuggestion(input: { workspaceId: string; userId: string; benchmarkAccountId?: string; suggestionId: string; decision: "SAVE" | "REJECT"; title?: string; steps?: string[]; applicableScenarios?: string[]; boundaries?: string[] }) {
  const role = await roleFor(input.workspaceId, input.userId); const action = input.decision === "SAVE" ? "SAVE_FORMAL_METHOD" : "CREATE_RESEARCH_CANDIDATE"; const permission = new ActionPermissionPolicy().evaluate({ role, action, userConfirmed: input.decision === "SAVE" });
  if (permission.decision !== "ALLOW") throw new LearningSuggestionError("FORBIDDEN", "当前权限可以查看建议，但不能处理。");
  const suggestion = await db.methodSuggestion.findFirst({ where: { id: input.suggestionId, workspaceId: input.workspaceId, status: "PENDING", ...(input.benchmarkAccountId ? { sourceBenchmarkStudy: { benchmarkAccountId: input.benchmarkAccountId } } : {}) } });
  if (!suggestion) throw new LearningSuggestionError("ALREADY_REVIEWED", "这条建议已经处理。");
  if (input.decision === "REJECT") { await db.$transaction([db.methodSuggestion.update({ where: { id: suggestion.id }, data: { status: "REJECTED", reviewedById: input.userId, reviewedAt: new Date() } }), db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "method_suggestion.rejected", resourceType: "method_suggestion", resourceId: suggestion.id, metadata: { benchmarkStudyId: suggestion.sourceBenchmarkStudyId } } })]); return { status: "REJECTED" as const }; }
  const method = await createMethodFromBenchmarkStudy({ workspaceId: input.workspaceId, ownerUserId: input.userId, benchmarkStudyId: suggestion.sourceBenchmarkStudyId, methodIndex: suggestion.sourceMethodIndex, title: input.title ?? suggestion.title, steps: input.steps ?? strings(suggestion.steps), applicableScenarios: input.applicableScenarios ?? strings(suggestion.applicableScenarios), boundaries: input.boundaries ?? strings(suggestion.boundaries) });
  await db.$transaction([db.methodSuggestion.update({ where: { id: suggestion.id }, data: { status: "ACCEPTED", savedMethodAssetId: method.id, reviewedById: input.userId, reviewedAt: new Date() } }), db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "method_suggestion.saved", resourceType: "method_suggestion", resourceId: suggestion.id, metadata: { benchmarkStudyId: suggestion.sourceBenchmarkStudyId, methodAssetId: method.id } } })]);
  return { status: "ACCEPTED" as const, method };
}

function emptyProfile(name = ""): CreatorProfileInput { return { displayName: name, positioning: "", targetAudience: "", tone: "", preferredStyle: "", forbiddenStyle: "", coreTopics: [], personalViews: [], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [], notes: "" }; }
function profileInput(profile: Awaited<ReturnType<typeof db.creatorProfile.findUnique>>, name = ""): CreatorProfileInput { return profile ? { displayName: profile.displayName, positioning: profile.positioning, targetAudience: profile.targetAudience, tone: profile.tone, preferredStyle: profile.preferredStyle, forbiddenStyle: profile.forbiddenStyle, coreTopics: strings(profile.coreTopics), personalViews: strings(profile.personalViews), brandTerms: strings(profile.brandTerms), forbiddenTerms: strings(profile.forbiddenTerms), hookPreferences: strings(profile.hookPreferences), structurePreferences: strings(profile.structurePreferences), ctaPreferences: strings(profile.ctaPreferences), examplePhrases: strings(profile.examplePhrases), notes: profile.notes } : emptyProfile(name); }
function currentValue(profile: CreatorProfileInput, type: CreatorProfileSuggestionType): string | string[] { const fields: Record<CreatorProfileSuggestionType, keyof CreatorProfileInput> = { CORE_TOPIC: "coreTopics", PERSONAL_VIEW: "personalViews", HOOK_PREFERENCE: "hookPreferences", STRUCTURE_PREFERENCE: "structurePreferences", PREFERRED_STYLE: "preferredStyle", FORBIDDEN_STYLE: "forbiddenStyle", EXAMPLE_PHRASE: "examplePhrases" }; return profile[fields[type]]; }

export async function listCreatorProfileSuggestions(input: { workspaceId: string; userId: string }) {
  await roleFor(input.workspaceId, input.userId); const rows = await db.creatorProfileSuggestion.findMany({ where: { workspaceId: input.workspaceId, targetUserId: input.userId }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({ id: row.id, type: row.type, typeLabel: profileTypeLabels[row.type] ?? row.type, currentValue: row.currentValue, proposedValue: row.proposedValue, rationale: row.rationale, evidenceRefs: strings(row.evidenceRefs), sampleCount: row.sampleCount, status: row.status, statusLabel: row.status === "PENDING" ? "待处理" : row.status === "ACCEPTED" ? "已接受" : "不采用" }));
}

export async function generateCreatorProfileSuggestions(input: { workspaceId: string; userId: string }, dependencies: { controlService?: AIControlService } = {}) {
  const role = await roleFor(input.workspaceId, input.userId); if (role === "VIEWER") throw new LearningSuggestionError("FORBIDDEN", "当前权限可以查看建议，但不能重新整理。");
  const revisions = await db.draftRevision.findMany({ where: { project: { workspaceId: input.workspaceId, createdById: input.userId }, confirmedFor: { isNot: null } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, revision: true, title: true, body: true, origin: true, createdAt: true, project: { select: { id: true, title: true } } } });
  if (revisions.length < 5) return { created: 0, reason: "还需要更多已确认稿件，才能判断稳定变化。", items: await listCreatorProfileSuggestions(input) };
  const [profile, user] = await Promise.all([db.creatorProfile.findUnique({ where: { workspaceId_userId: input } }), db.user.findUnique({ where: { id: input.userId }, select: { name: true } })]); const current = profileInput(profile, user?.name ?? "");
  const context = preparedContext({ workspaceId: input.workspaceId, userId: input.userId, task: "CREATOR_PROFILE_SUGGESTION", ownership: "OWN_CONFIRMED", items: revisions.map((revision) => ({ id: revision.id, version: revision.revision, content: { title: revision.title, body: revision.body.slice(0, 12_000), origin: revision.origin, projectTitle: revision.project.title } })) });
  const run = await (dependencies.controlService ?? new AIControlService()).execute({ workspaceId: input.workspaceId, userId: input.userId, taskType: "CREATOR_PROFILE_SUGGESTION", requestedAction: "CREATE_FREE_TEXT_CANDIDATE", userInput: "总结已确认稿件中重复出现的创作偏好", preparedContext: context, action: "CREATOR_PROFILE_SUGGESTION", operation: "CREATOR_PROFILE_SUGGESTION", promptVersion: 1, inputSummary: () => ({ confirmedRevisionCount: revisions.length, creatorProfileId: profile?.id ?? null }), metadata: () => ({ creatorProfileId: profile?.id ?? null }), auditMetadata: () => ({ confirmedRevisionCount: revisions.length }), generate: (provider) => provider.generateStructured({ systemPrompt: "只根据至少三篇已确认稿件中重复出现的表达形成建议。不要分析性格，不使用外部资料，不修改画像。每条必须引用真实 revision id。", prompt: JSON.stringify({ currentProfile: current, confirmedRevisions: context.manifest.items }), structuredOutput: { preferJsonSchema: true, schemaName: "creator_profile_suggestions" } }, profileOutputSchema) });
  const allowed = new Set(revisions.map(({ id }) => id)); let created = 0;
  for (const suggestion of run.output.suggestions) {
    const refs = [...new Set(suggestion.evidenceRevisionIds)].filter((id) => allowed.has(id)); if (refs.length < 3) continue;
    const dedupeKey = fingerprint([input.workspaceId, input.userId, suggestion.type, normalized(suggestion.proposedValue)]); const exists = await db.creatorProfileSuggestion.findUnique({ where: { dedupeKey }, select: { id: true } }); if (exists) continue;
    await db.creatorProfileSuggestion.create({ data: { workspaceId: input.workspaceId, creatorProfileId: profile?.id, targetUserId: input.userId, type: suggestion.type, currentValue: json(currentValue(current, suggestion.type)), proposedValue: suggestion.proposedValue, rationale: suggestion.rationale, evidenceRefs: json(refs), sampleCount: refs.length, dedupeKey, generatedById: input.userId } }); created += 1;
  }
  return { created, items: await listCreatorProfileSuggestions(input) };
}

function applyProfileValue(profile: CreatorProfileInput, type: CreatorProfileSuggestionType, value: string) {
  const next = { ...profile }; const append = (items: string[]) => [...new Set([...items, value])];
  if (type === "CORE_TOPIC") next.coreTopics = append(next.coreTopics); else if (type === "PERSONAL_VIEW") next.personalViews = append(next.personalViews); else if (type === "HOOK_PREFERENCE") next.hookPreferences = append(next.hookPreferences); else if (type === "STRUCTURE_PREFERENCE") next.structurePreferences = append(next.structurePreferences); else if (type === "EXAMPLE_PHRASE") next.examplePhrases = append(next.examplePhrases); else if (type === "PREFERRED_STYLE") next.preferredStyle = value; else next.forbiddenStyle = value;
  return next;
}

export async function decideCreatorProfileSuggestion(input: { workspaceId: string; userId: string; suggestionId: string; decision: "ACCEPT" | "REJECT" }) {
  const role = await roleFor(input.workspaceId, input.userId); const permission = new ActionPermissionPolicy().evaluate({ role, action: input.decision === "ACCEPT" ? "UPDATE_CREATOR_PROFILE" : "CREATE_FREE_TEXT_CANDIDATE", userConfirmed: input.decision === "ACCEPT" }); if (permission.decision !== "ALLOW") throw new LearningSuggestionError("FORBIDDEN", "当前权限可以查看建议，但不能处理。");
  const suggestion = await db.creatorProfileSuggestion.findFirst({ where: { id: input.suggestionId, workspaceId: input.workspaceId, targetUserId: input.userId, status: "PENDING" } }); if (!suggestion) throw new LearningSuggestionError("ALREADY_REVIEWED", "这条建议已经处理。");
  if (input.decision === "REJECT") { await db.$transaction([db.creatorProfileSuggestion.update({ where: { id: suggestion.id }, data: { status: "REJECTED", reviewedById: input.userId, reviewedAt: new Date() } }), db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "creator_profile_suggestion.rejected", resourceType: "creator_profile_suggestion", resourceId: suggestion.id, metadata: { evidenceRefs: suggestion.evidenceRefs } } })]); return { status: "REJECTED" as const }; }
  const [profile, user] = await Promise.all([db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } }), db.user.findUnique({ where: { id: input.userId }, select: { name: true } })]); const before = profileInput(profile, user?.name ?? ""); const after = applyProfileValue(before, suggestion.type, suggestion.proposedValue); const data = normalizeCreatorProfileInput(after);
  const updated = await db.$transaction(async (tx) => { const saved = await tx.creatorProfile.upsert({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } }, create: { workspaceId: input.workspaceId, userId: input.userId, ...data }, update: data }); await tx.creatorProfileSuggestion.update({ where: { id: suggestion.id }, data: { status: "ACCEPTED", creatorProfileId: saved.id, reviewedById: input.userId, reviewedAt: new Date() } }); await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "creator_profile_suggestion.accepted", resourceType: "creator_profile_suggestion", resourceId: suggestion.id, metadata: json({ creatorProfileId: saved.id, type: suggestion.type, before: currentValue(before, suggestion.type), after: currentValue(after, suggestion.type), evidenceRefs: suggestion.evidenceRefs }) } }); return saved; });
  return { status: "ACCEPTED" as const, profile: updated };
}
