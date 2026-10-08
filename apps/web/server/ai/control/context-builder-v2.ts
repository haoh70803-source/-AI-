import "server-only";
import {feishuContextItems} from "../../feishu/service";

import { createHash } from "node:crypto";
import { db } from "@content-center/db";
import { ProjectContextBuilder } from "../project-context";
import type { SkillResolution } from "../skill-resolver";
import type { AIControlTask, ContextItem, ContextManifest, ContextOwnership, ConversationContextMessage, SelectedContextObject } from "./contracts";
import { AIControlError } from "./contracts";
import { resolveContextReferences, type ContextReference } from "../../assistant/references";
import { fitContext } from "../../assistant/context-budget";
import { resolveSkillPoolDryRun, selectedMethodMetadata } from "../skill-resolver";
import { getSelectedGenerationMethods, type SelectedGenerationMethod } from "../../project-methods/service";
import { resolveOwnContribution } from "../../../lib/content-production";

type BuildInput = {
  workspaceId: string;
  userId: string;
  projectId: string;
  taskType: AIControlTask;
  action: Parameters<ProjectContextBuilder["build"]>[0]["action"];
  studioAction?: Parameters<ProjectContextBuilder["build"]>[0]["studioAction"];
  selectedObjects?: SelectedContextObject[];
  resolvedContextItems?: ContextItem[];
  conversationHistory?: ConversationContextMessage[];
  references?: ContextReference[];
  skillVersionId?: string | null;
  userInput?: string;
  historySummary?: string;
};

type ProjectContextRecord = {
  id: string;
  title: string;
  description: string | null;
  ipContextSnapshot?: unknown;
  goal: string | null;
  audience: string | null;
  updatedAt: Date;
  creatorProfile: { id: string; updatedAt: Date } | null;
  primaryDraftBranch: DraftContextRecord | null;
  draftBranches: DraftContextRecord[];
};

type DraftContextRecord = {
  id: string;
  workingTitle: string;
  workingBody: string;
  workingOutline: unknown;
  currentRevisionId: string | null;
  version: number;
  updatedAt: Date;
};

export interface SelectedContextObjectAdapter {
  resolve(input: { workspaceId: string; projectId: string; selectedObjects: SelectedContextObject[] }): Promise<ContextItem[]>;
}

class CanvasSelectedObjectAdapter implements SelectedContextObjectAdapter {
  async resolve(input: { workspaceId: string; projectId: string; selectedObjects: SelectedContextObject[] }) {
    const requestedCanvas = input.selectedObjects.filter((item) => item.objectType === "CANVAS_OBJECT");
    const requestedSources = input.selectedObjects.filter((item) => item.objectType === "SOURCE_ITEM");
    const [rows, sourceRows] = await Promise.all([
      requestedCanvas.length ? db.canvasObject.findMany({
      where: { id: { in: requestedCanvas.map(({ objectId }) => objectId) }, workspaceId: input.workspaceId, projectId: input.projectId, deletedAt: null },
      select: { id: true, objectType: true, title: true, textContent: true, contentVersion: true, targetRelations: { where: { relationType: "GENERATED_FROM" }, orderBy: { createdAt: "asc" }, take: 8, select: { sourceSnapshot: { select: { id: true, objectType: true, objectContentVersion: true, title: true, textContent: true, referenceManifest: true } } } } },
      }) : [],
      requestedSources.length ? db.projectSource.findMany({ where: { projectId: input.projectId, sourceItemId: { in: requestedSources.map(({ objectId }) => objectId) }, sourceItem: { workspaceId: input.workspaceId, status:{not:"ARCHIVED"} } }, select: { sourceItem: { select: { id: true, title: true, description: true, sourceType: true, sourcePlatform: true, materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1, select: { version: true, summary: true, keyPoints: true } } } } } }) : [],
    ]);
    return [...rows.flatMap((row): ContextItem[] => {
      const requestedItem = requestedCanvas.find(({ objectId }) => objectId === row.id);
      return [{
        objectType: "CANVAS_OBJECT",
        objectId: row.id,
        version: row.contentVersion,
        ownership: row.objectType === "TEXT" ? "PENDING" : "EXTERNAL",
        provenance: `canvas:${row.objectType}`,
        whySelected: requestedItem?.whySelected ?? "用户当前选中对象",
        truncated: false,
        content: [row.title, row.textContent].filter(Boolean).join("\n"),
      }, ...row.targetRelations.map(({ sourceSnapshot }): ContextItem => ({ objectType: "CANVAS_OBJECT_SNAPSHOT", objectId: sourceSnapshot.id, version: sourceSnapshot.objectContentVersion, ownership: sourceSnapshot.objectType === "TEXT" && !sourceSnapshot.referenceManifest ? "PENDING" : "EXTERNAL", provenance: "generated_from_snapshot", whySelected: "当前节点的历史生成来源", truncated: false, content: [sourceSnapshot.title, sourceSnapshot.textContent, sourceSnapshot.referenceManifest ? JSON.stringify(sourceSnapshot.referenceManifest) : null].filter(Boolean).join("\n") }))];
    }), ...sourceRows.map(({ sourceItem }): ContextItem => {
      const requestedItem = requestedSources.find(({ objectId }) => objectId === sourceItem.id);
      const analysis = sourceItem.materialAnalyses[0];
      return { objectType: "SOURCE_ITEM", objectId: sourceItem.id, version: analysis?.version ?? null, ownership: "EXTERNAL", provenance: sourceItem.sourcePlatform, whySelected: requestedItem?.whySelected ?? "用户本次添加的项目资料", truncated: false, content: JSON.stringify({ title: sourceItem.title, description: sourceItem.description, type: sourceItem.sourceType, summary: analysis?.summary, keyPoints: analysis?.keyPoints }) };
    })];
  }
}

type ContextBuilderStore = {
  loadProject(input: { workspaceId: string; userId: string; projectId: string }): Promise<ProjectContextRecord | null>;
};

const defaultStore: ContextBuilderStore = {
  loadProject: (input) => db.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } },
    select: {
      id: true,
      title: true,
      description: true,
      ipContextSnapshot:true,
      goal: true,
      audience: true,
      updatedAt: true,
      creatorProfile: { select: { id: true, updatedAt: true } },
      primaryDraftBranch: { select: { id: true, workingTitle: true, workingBody: true, workingOutline: true, currentRevisionId: true, version: true, updatedAt: true } },
      draftBranches: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, workingTitle: true, workingBody: true, workingOutline: true, currentRevisionId: true, version: true, updatedAt: true } },
    },
  }),
};

const budgets = { project: 4_000, draft: 16_000, selected: 8_000, profile: 4_000, method: 6_000, fact: 8_000, source: 12_000, conversation: 8_000 } as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function bounded(content: string, maximum: number) {
  return content.length <= maximum ? { content, truncated: false } : { content: content.slice(0, maximum), truncated: true };
}

function item(input: Omit<ContextItem, "content" | "truncated"> & { content: string }, maximum: number): ContextItem {
  return { ...input, ...bounded(input.content, maximum) };
}

function boundedItems(entries: Array<Omit<ContextItem, "truncated">>, maximum: number) {
  let remaining = maximum;
  return entries.map((entry): ContextItem => {
    const selected = bounded(entry.content, Math.max(0, remaining));
    remaining -= selected.content.length;
    return { ...entry, ...selected, truncated: selected.truncated || remaining === 0 && entry.content.length > selected.content.length };
  });
}

function sourceRows(context: unknown): Array<Record<string, unknown>> {
  const external = record(record(context).externalReferences);
  return [
    ...array(external.materials).map((value) => ({ ...record(value), contextKind: "material" })),
    ...array(external.evidence).map((value) => ({ ...record(value), id: record(value).sourceItemId ?? record(value).id, contextKind: "evidence" })),
    ...array(external.additional).map((value) => ({ ...record(value), contextKind: "additional" })),
  ];
}

export class ContextBuilderV2 {
  constructor(
    private readonly legacyBuilder: Pick<ProjectContextBuilder, "build"> = new ProjectContextBuilder(),
    private readonly store: ContextBuilderStore = defaultStore,
    private readonly selectedObjectAdapter: SelectedContextObjectAdapter = new CanvasSelectedObjectAdapter(),
  ) {}

  async build(input: BuildInput) {
    if (input.action === "PROJECT_ASSISTANT" && input.taskType === "GENERAL_QUERY") return this.buildAssistant(input);
    const [project, legacy] = await Promise.all([
      this.store.loadProject(input),
      this.legacyBuilder.build({ workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, action: input.action, studioAction: input.studioAction }),
    ]);
    if (!project) return null;

    const feishuItems = await feishuContextItems(input, input.userInput || project.title);
    const selected = [
      ...feishuItems,
      ...await this.selectedObjectAdapter.resolve({ workspaceId: input.workspaceId, projectId: input.projectId, selectedObjects: input.selectedObjects ?? [] }),
      ...(input.resolvedContextItems ?? []),
    ];
    const draft = project.primaryDraftBranch ?? project.draftBranches[0] ?? null;
    const effectiveDefaultMethod = legacy.selectedMethods.length ? null : legacy.defaultMethod;
    const selectedItems = boundedItems(selected, budgets.selected);
    const projectItem = item({ objectType: "PROJECT", objectId: project.id, version: project.updatedAt.toISOString(), ownership: "OWN_CONFIRMED", provenance: "project", whySelected: "当前项目目标", content: JSON.stringify({ ipBackground:project.ipContextSnapshot, title: project.title, description: project.description, goal: project.goal, audience: project.audience }) }, budgets.project);
    const draftItem = draft ? item({ objectType: "DRAFT_WORKING_STATE", objectId: draft.id, version: draft.version, ownership: "OWN_CONFIRMED", provenance: "draft_branch_working_state", whySelected: "当前主稿 working state", content: JSON.stringify({ title: draft.workingTitle, body: draft.workingBody, outline: draft.workingOutline }) }, budgets.draft) : null;
    const profile = record(record(legacy.context).creatorProfile);
    const profileItem = project.creatorProfile ? item({ objectType: "CREATOR_PROFILE", objectId: project.creatorProfile.id, version: project.creatorProfile.updatedAt.toISOString(), ownership: "PENDING", provenance: "creator_profile", whySelected: "项目绑定的人物画像", content: JSON.stringify(profile) }, budgets.profile) : null;
    const methodItems = boundedItems([
      ...(effectiveDefaultMethod ? [{ objectType: "DEFAULT_METHOD_VERSION", objectId: effectiveDefaultMethod.versionId, version: effectiveDefaultMethod.version, ownership: "METHOD_GUIDANCE" as ContextOwnership, provenance: "workspace_default_method", whySelected: "当前任务对应的默认创作方式", content: JSON.stringify(effectiveDefaultMethod.sections) }] : []),
      ...legacy.selectedMethods.map((method) => ({ objectType: "METHOD_VERSION", objectId: method.methodVersionId, version: method.version, ownership: "METHOD_GUIDANCE" as ContextOwnership, provenance: "project_method_selection", whySelected: "项目已选择的创作方法", content: JSON.stringify({ title: method.title, steps: method.steps, applicableScenarios: method.applicableScenarios, boundaries: method.boundaries }) })),
    ], budgets.method);
    const factItems = boundedItems(legacy.ownFacts.map((fact) => ({ objectType: "CONFIRMED_INFORMATION", objectId: fact.sourceId ?? `${fact.source}:${fact.text.slice(0, 40)}`, version: null, ownership: "OWN_CONFIRMED" as ContextOwnership, provenance: fact.source, whySelected: "已确认我方信息", content: fact.text })), budgets.fact);
    const sources = boundedItems(sourceRows(legacy.context).map((source) => ({ objectType: "SOURCE_ITEM", objectId: String(source.id ?? "unknown"), version: Number(record(source.materialDistillation).version ?? record(source.materialAnalysis).version ?? 0) || null, ownership: "EXTERNAL" as ContextOwnership, provenance: String(source.platform ?? source.contextKind ?? "external_source"), whySelected: "相关项目资料摘要", content: JSON.stringify({ title: source.title, content: source.content, materialDistillation: source.materialDistillation, materialUnderstanding: source.materialUnderstanding, materialAnalysis: source.materialAnalysis }) })), budgets.source);
    const conversationItems = boundedItems((input.conversationHistory ?? []).slice(-10).map((message) => ({ objectType: "ASSISTANT_MESSAGE", objectId: message.id, version: message.createdAt, ownership: "PENDING" as ContextOwnership, provenance: "assistant_thread", whySelected: "最近必要的项目对话", content: `${message.role === "USER" ? "员工" : "鑫小助"}：${message.content}` })), budgets.conversation);
    const items = [projectItem, ...(draftItem ? [draftItem] : []), ...selectedItems, ...(profileItem ? [profileItem] : []), ...methodItems, ...factItems, ...sources, ...conversationItems];
    const categories = Object.fromEntries(items.map((entry) => [entry.objectType, items.filter((candidate) => candidate.objectType === entry.objectType).some((candidate) => candidate.truncated)]));

    const manifestCore = {
      schemaVersion: "ai-context-manifest-v1" as const,
      generatedAt: new Date().toISOString(),
      project: { id: project.id, version: project.updatedAt.toISOString() },
      currentDraft: draft ? { branchId: draft.id, workingVersion: draft.version, currentRevisionId: draft.currentRevisionId } : null,
      selectedObjects: selectedItems.map(({ objectType, objectId, version, ownership, whySelected, truncated }) => ({ objectType, objectId, version, ownership, whySelected, truncated })),
      methodVersions: [
        ...(effectiveDefaultMethod ? [{ assetId: effectiveDefaultMethod.assetId, versionId: effectiveDefaultMethod.versionId, version: effectiveDefaultMethod.version }] : []),
        ...legacy.selectedMethods.map(({ methodAssetId, methodVersionId, version }) => ({ assetId: methodAssetId, versionId: methodVersionId, version })),
      ],
      creatorProfile: project.creatorProfile ? { id: project.creatorProfile.id, version: project.creatorProfile.updatedAt.toISOString() } : null,
      confirmedInformationRefs: factItems.map(({ objectId }) => objectId),
      sourceRefs: [...new Set(sources.map(({ objectId }) => objectId))],
      externalRefs: [...new Set(sources.map(({ objectId }) => objectId))],
      conversationMessageRefs: conversationItems.map(({ objectId }) => objectId),
      items,
      truncation: { any: legacy.contextTruncated || items.some(({ truncated }) => truncated), categories },
    };
    const manifestId = createHash("sha256").update(JSON.stringify(manifestCore)).digest("hex").slice(0, 24);
    const manifest: ContextManifest = { ...manifestCore, manifestId };
    const legacyContext = record(legacy.context);
    const context = {
      ...legacyContext,
      currentDraft: draft ? { branchId: draft.id, workingVersion: draft.version, currentRevisionId: draft.currentRevisionId, updatedAt: draft.updatedAt.toISOString(), body: bounded(draft.workingBody, budgets.draft).content, truncated: draftItem?.truncated ?? false } : legacyContext.currentDraft,
      feishuReferences: feishuItems,
      selectedObjects: selectedItems,
      recentConversation: conversationItems.map(({ objectId, content }) => ({ messageId: objectId, content })),
      contextManifest: { manifestId, schemaVersion: manifest.schemaVersion },
    };
    return { ...legacy, defaultMethod: effectiveDefaultMethod, skillResolution: legacy.skillResolution as SkillResolution | undefined, context, manifest, contextTruncated: manifest.truncation.any };
  }

  private async buildAssistant(input: BuildInput): Promise<Omit<Awaited<ReturnType<ProjectContextBuilder["build"]>>, "context"> & { context: { items: ContextItem[]; warnings: string[] }; manifest: ContextManifest }> {
    const project = await this.store.loadProject(input);
    if (!project) throw new AIControlError("PERMISSION_DENIED");
    const refs = [...(input.references ?? []), ...(input.selectedObjects ?? []).filter(r => r.objectType === "SOURCE_ITEM").map(r => ({ sourceType: "MATERIAL" as const, sourceId: r.objectId }))];
    const resolved = await resolveContextReferences(input, refs, { query: input.userInput });
    let methods: SelectedGenerationMethod[] = [];
    if (input.skillVersionId) {
      const version = await db.methodVersion.findFirst({ where: { id: input.skillVersionId, asset: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: { not: "DISABLED" } } } });
      if (!version) throw new AIControlError("PERMISSION_DENIED", "所选 Skill 不存在或不可使用。");
      const strings = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
      methods = [{ methodAssetId: version.assetId, methodVersionId: version.id, version: version.version, title: version.title, steps: strings(version.steps), applicableScenarios: strings(version.applicableScenarios), boundaries: strings(version.boundaries), workflowContract: version.workflowContract as unknown as SelectedGenerationMethod["workflowContract"] }];
    } else if (input.skillVersionId === undefined) methods = (await getSelectedGenerationMethods(input)).slice(0, 1);
    const skillResolution = resolveSkillPoolDryRun({ taskType: input.taskType, userTask: input.userInput, workspaceId: input.workspaceId, selectedSkills: methods.map(m => selectedMethodMetadata({ ...m, id: m.methodVersionId, workspaceId: input.workspaceId })) });
    const make = (objectType: string, objectId: string, content: string, ownership: ContextOwnership = "PENDING"): ContextItem => ({ objectType, objectId, content, ownership, version: null, provenance: "project_assistant", whySelected: "当前对话上下文", truncated: false });
    const projectItem = make("PROJECT", project.id, JSON.stringify({ ipBackground:project.ipContextSnapshot, title: project.title, description: project.description, goal: project.goal, audience: project.audience }), "OWN_CONFIRMED");
    const skills = methods.map(m => make("METHOD_VERSION", m.methodVersionId, JSON.stringify(m), "METHOD_GUIDANCE"));
    const history = (input.conversationHistory ?? []).map(m => ({ ...make("ASSISTANT_MESSAGE", m.id, `${m.role}: ${m.content}`), version: m.createdAt }));
    // Reserve recent dialogue separately so a large explicit document cannot erase the last answer.
    const recent = fitContext([...history].reverse(), 10_000);
    const latestAnswer = [...history].reverse().find(i => i.content.startsWith("ASSISTANT:"));
    if (latestAnswer && !recent.items.some(i => i.objectId === latestAnswer.objectId)) throw new AIControlError("NO_CONTEXT", "上一条回答超过本轮上下文预算，请先保存为成果，再引用该成果继续修改。");
    recent.items.reverse();
    const canvas = await this.selectedObjectAdapter.resolve({ workspaceId: input.workspaceId, projectId: input.projectId, selectedObjects: (input.selectedObjects ?? []).filter(r => r.objectType === "CANVAS_OBJECT") });
    const feishuItems = await feishuContextItems(input,input.userInput || project.title);
    const selected = [...resolved.items, ...canvas, ...(input.resolvedContextItems ?? []), ...feishuItems];
    // Each explicit source receives a share; one large PDF must not crowd out all other references.
    const perReference = Math.max(1400, Math.floor(18_000 / Math.max(1, selected.length)));
    const balancedSelected = selected.flatMap(entry => fitContext([entry], perReference).items);
    const fitted = fitContext([projectItem, ...skills, ...balancedSelected, ...(input.historySummary ? [make("CONVERSATION_SUMMARY", "summary", input.historySummary)] : [])], 22_000);
    if (skills.some(skill => !fitted.items.some(i => i.objectType === "METHOD_VERSION" && i.objectId === skill.objectId))) throw new AIControlError("NO_CONTEXT", "所选 Skill 内容超过本轮预算，请精简 Skill 后重试。");
    const items = [...fitted.items, ...recent.items];
    const truncated = items.some(i => i.truncated) || fitted.budget.omitted.length > 0 || recent.budget.omitted.length > 0;
    const warnings = [...resolved.warnings, ...(truncated ? ["部分上下文超过预算，已保留优先内容；可减少引用后重试。"] : [])];
    const core = {
      schemaVersion: "ai-context-manifest-v1" as const, generatedAt: new Date().toISOString(), project: { id: project.id, version: project.updatedAt.toISOString() }, currentDraft: null,
      selectedObjects: items.filter(i => selected.some(s => s.objectType === i.objectType && s.objectId === i.objectId)).map(({ objectType, objectId, version, ownership, whySelected, truncated }) => ({ objectType, objectId, version, ownership, whySelected, truncated })),
      methodVersions: methods.map(m => ({ assetId: m.methodAssetId, versionId: m.methodVersionId, version: m.version })), creatorProfile: null, confirmedInformationRefs: [],
      sourceRefs: items.filter(i => i.source).map(i => i.objectId), externalRefs: items.filter(i => i.source).map(i => i.objectId), conversationMessageRefs: recent.items.map(i => i.objectId), items,
      truncation: { any: truncated, categories: Object.fromEntries(items.filter(i => i.truncated).map(i => [i.objectType, true])) },
      budget: { maximumBytes: 32_000, usedBytes: fitted.budget.usedBytes + recent.budget.usedBytes, omitted: [...fitted.budget.omitted, ...recent.budget.omitted] }, warnings,
      toolResults: [
        ...items.filter(i => i.source).map(i => ({ tool: `read_${i.source!.sourceType.toLowerCase()}`, status: "COMPLETED" as const, sourceId: i.objectId, result: { characters: i.content.length, truncated: i.truncated } })),
        ...resolved.warnings.map(error => ({ tool: "resolve_reference", status: "SKIPPED" as const, error })),
      ],
    };
    const manifest: ContextManifest = { ...core, manifestId: createHash("sha256").update(JSON.stringify(core)).digest("hex").slice(0, 24) };
    const context = { items, warnings };
    return { context, manifest, snapshot: null, ownFacts: [], hasOwnEvidence: false, hasOwnCaseOrData: false, ownContribution: resolveOwnContribution({}), hasOwnBackground: false, contextTruncated: truncated, selectedMethods: methods, defaultMethod: null, skillResolution,
      inputSummary: { action: input.action, sourceCount: core.sourceRefs.length, evidenceCount: 0, materialAnalysisCount: 0, materialDistillationCount: 0, hasUnifiedCreativeAnalysis: false, hasCreativeBrief: false, contextChars: JSON.stringify(context).length, hasCreatorProfile: false, confirmedOwnFactCount: 0, creatorUnderstandingCount: 0, pendingCreatorInformationCount: 0, hasCurrentDraft: false, hasOwnEvidence: false, hasOwnCaseOrData: false, ownContribution: resolveOwnContribution({}), hasOwnBackground: false, contextTruncated: truncated, resolver: skillResolution } };
  }
}

export type ContextBuilderV2Result = NonNullable<Awaited<ReturnType<ContextBuilderV2["build"]>>>;
