import "server-only";
import {ensureFeishuSource} from "@content-center/integrations";
import { factState } from "../content-governance/policy";

import { db } from "@content-center/db";
import { ProjectServiceError } from "../project-service";
import { studioQuickActionSections, type AIAction, type StudioQuickAction } from "./schemas";
import { materialAnalysisOutputSchema } from "../material-analysis/schemas";
import type { MaterialAnalysisOutput } from "../material-analysis/schemas";
import { resolveOwnContribution } from "../../lib/content-production";
import { getSelectedGenerationMethods } from "../project-methods/service";
import { getPublishedDefaultContentMethodForStudio } from "../default-content-method/service";
import { classifyCreatorContext, extractExplicitOwnFacts, uniqueConfirmedFacts, type ConfirmedOwnFact } from "./creation-context";
import { defaultMethodMetadata, resolveSkillPoolDryRun, selectedMethodMetadata, type SkillResolution } from "./skill-resolver";

export type ProjectContextAction = AIAction | "PROJECT_ASSISTANT" | "MATERIAL_KNOWLEDGE_EXTRACTION" | "METHOD_SUGGESTION_FROM_RESEARCH" | "CREATOR_PROFILE_SUGGESTION";

export type ContextBudgetLimits = { perSourceChars: number; totalSourceChars: number; totalEvidenceChars: number };
export type AdditionalExternalReference = { id: string; title: string; content: string };
const defaults: ContextBudgetLimits = { perSourceChars: 8_000, totalSourceChars: 24_000, totalEvidenceChars: 12_000 };

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function take(value: string, maximum: number) { return value.length <= maximum ? { value, truncated: false } : { value: value.slice(0, maximum), truncated: true }; }

export class ProjectContextBuilder {
  constructor(private readonly limits: ContextBudgetLimits = defaults) {}

  async build(input: { workspaceId: string; userId: string; projectId: string; action: ProjectContextAction; studioAction?: StudioQuickAction; externalReferences?: AdditionalExternalReference[] }) {
    const project = await db.contentProject.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } },
      select: { id: true, title: true, description: true, ipContextSnapshot:true, goal: true, audience: true, creatorProfileId: true, motherContent: { select: { title: true, body: true, version: true, confirmedVersion: true } } },
    });
    if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
    const cloudSources=await db.projectSource.findMany({where:{projectId:project.id,sourceItem:{workspaceId:input.workspaceId,sourceProvider:"FEISHU",status:{not:"ARCHIVED"}}},select:{sourceItemId:true}});
    for(const source of cloudSources) await ensureFeishuSource(input,source.sourceItemId).catch(()=>undefined);
    const creatorProfile = project.creatorProfileId
      ? await db.creatorProfile.findFirst({ where: { id: project.creatorProfileId, workspaceId: input.workspaceId } })
      : await db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } });
    const needsSources = Boolean(input.studioAction) || ["ANALYZE_SOURCES", "EXTRACT_EVIDENCE", "GENERATE_ANGLES", "GENERATE_MOTHER_CONTENT", "PROJECT_ASSISTANT"].includes(input.action);
    const needsEvidence = Boolean(input.studioAction) || ["GENERATE_ANGLES", "GENERATE_BRIEF", "GENERATE_MOTHER_CONTENT", "PROJECT_ASSISTANT"].includes(input.action);
    const needsBrief = Boolean(input.studioAction) || ["GENERATE_BRIEF", "GENERATE_MOTHER_CONTENT", "REWRITE_SELECTION", "SHORTEN", "EXPAND", "ADD_PERSONAL_VIEW", "HUMANIZE", "PROJECT_ASSISTANT"].includes(input.action);
    const [sourceRows, evidenceRows, brief] = await Promise.all([
      needsSources ? db.projectSource.findMany({ where: { projectId: project.id, sourceItem:{status:{not:"ARCHIVED"}} }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { role: true, sourceItem: { select: { id: true, title: true, sourcePlatform: true, rawText: true, transcript: { select: { fullText: true } }, materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1, select: { version: true, suggestedTitle: true, summary: true, topic: true, targetAudience: true, coreViewpoint: true, keyPoints: true, coreQuestion: true, understanding: true } }, materialDistillations: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, schemaVersion: true, output: true } } } } } }) : [],
      needsEvidence ? db.evidenceItem.findMany({ where: { projectId: project.id, workspaceId: input.workspaceId, status: "CONFIRMED" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 12, select: { id: true, type: true, excerpt: true, claim: true, note: true, sourceItemId: true, ownership: true, status: true, locator:true, dedupeKey: true } }) : [],
      needsBrief ? db.creativeBrief.findFirst({ where: { projectId: project.id, workspaceId: input.workspaceId } }) : null,
    ]);
    const useMethods = input.action === "GENERATE_MOTHER_CONTENT" || input.action === "PROJECT_ASSISTANT" || Boolean(input.studioAction);
    const useDefaultFallback = input.action === "GENERATE_MOTHER_CONTENT" || Boolean(input.studioAction);
    const defaultSections = input.studioAction ? studioQuickActionSections[input.studioAction] : input.action === "GENERATE_MOTHER_CONTENT" ? ["BODY", "EVIDENCE", "ENDING", "BOUNDARY"] as const : input.action === "PROJECT_ASSISTANT" ? ["TOPIC", "BODY", "EVIDENCE", "BOUNDARY"] as const : [];
    const [selectedMethods, defaultMethodCandidate] = await Promise.all([
      useMethods ? getSelectedGenerationMethods({ workspaceId: input.workspaceId, userId: input.userId, projectId: project.id }) : [],
      useDefaultFallback ? getPublishedDefaultContentMethodForStudio({ workspaceId: input.workspaceId, sectionCodes: [...defaultSections] }) : null,
    ]);
    const skillResolution: SkillResolution = resolveSkillPoolDryRun({
      taskType: input.studioAction ?? input.action,
      userTask: brief?.angle || brief?.coreMessage || input.action,
      workspaceId: input.workspaceId,
      contextSummary: JSON.stringify({ action: input.action, studioAction: input.studioAction ?? null, sourceCount: sourceRows.length, evidenceCount: evidenceRows.length, hasBrief: Boolean(brief) }),
      selectedSkills: selectedMethods.map((method) => selectedMethodMetadata({ ...method, id: method.methodVersionId, workspaceId: input.workspaceId })),
      defaultFallback: defaultMethodCandidate ? defaultMethodMetadata({ ...defaultMethodCandidate, id: defaultMethodCandidate.versionId, workspaceId: input.workspaceId }) : null,
    });
    const defaultMethod = selectedMethods.length ? null : defaultMethodCandidate;
    const selectedMethodContext = selectedMethods.map(({ title, steps, applicableScenarios, boundaries, workflowContract }) => ({ title, steps, applicableScenarios, boundaries, ...(workflowContract ? { workflowContract } : {}) }));
    const defaultMethodContext = defaultMethod ? { title: defaultMethod.title, version: defaultMethod.version, sections: defaultMethod.sections.map(({ code, items }) => ({ code, guidelines: items.map(({ text }) => text) })) } : null;
    const creationAction = input.action === "GENERATE_MOTHER_CONTENT" || input.action === "PROJECT_ASSISTANT" || Boolean(input.studioAction);
    let contextTruncated = false;
    let sourceBudget = this.limits.totalSourceChars;
    type BuiltSource = { id: string; title: string | null; platform: string; role?: string; text?: string; materialAnalysis?: Record<string, unknown> | null; materialDistillation?: { id: string; version: number; schemaVersion: string; output: unknown } | null; materialUnderstanding?: MaterialAnalysisOutput | { whatItSays: { summary: string; keyPoints: string[] }; reusable: never[]; doNotCopy: never[]; uncertain: never[] } | { reusable: MaterialAnalysisOutput["reusable"]; prohibitedReferenceClaims: Array<{ content: string; reason: string }> } | null };
    const sources: BuiltSource[] = sourceRows.flatMap(({ sourceItem, role }): BuiltSource[] => {
      if (sourceBudget <= 0) { contextTruncated = true; return []; }
      const raw = creationAction ? "" : sourceItem.transcript?.fullText || sourceItem.rawText || "";
      const selected = take(raw, Math.min(this.limits.perSourceChars, sourceBudget));
      sourceBudget -= selected.value.length;
      contextTruncated ||= selected.truncated || raw.length > selected.value.length;
      const analysis = sourceItem.materialAnalyses[0];
      const distillation = sourceItem.materialDistillations[0];
      const understanding = materialAnalysisOutputSchema.safeParse(analysis?.understanding);
      if (creationAction) return [{
        id: sourceItem.id,
        title: sourceItem.title,
        platform: sourceItem.sourcePlatform,
        materialDistillation: distillation ? { id: distillation.id, version: distillation.version, schemaVersion: distillation.schemaVersion, output: distillation.output } : null,
        materialUnderstanding: understanding.success
          ? { reusable: understanding.data.reusable, prohibitedReferenceClaims: [...understanding.data.doNotCopy, ...understanding.data.uncertain] }
          : analysis ? { reusable: [], prohibitedReferenceClaims: [{ content: analysis.summary || strings(analysis.keyPoints).join("；"), reason: "旧版整理只作来源背景，不得写成创作者事实" }].filter((item) => item.content) } : null,
      }];
      return [{ id: sourceItem.id, title: sourceItem.title, platform: sourceItem.sourcePlatform, role, text: selected.value, materialAnalysis: analysis ? { version: analysis.version, suggestedTitle: analysis.suggestedTitle, summary: analysis.summary, topic: analysis.topic, targetAudience: analysis.targetAudience, coreViewpoint: analysis.coreViewpoint, keyPoints: strings(analysis.keyPoints), coreQuestion: analysis.coreQuestion } : null }];
    });
    // Revalidate governed facts on each creation context, including archive and expiry.
    const governedIds=evidenceRows.flatMap(item=>{const value=item.locator as {factRecordId?:string}|null;return value?.factRecordId?[value.factRecordId]:[];});
    const governedFacts=governedIds.length?await db.factRecord.findMany({where:{id:{in:governedIds},workspaceId:input.workspaceId,knowledge:{confidentiality:"INTERNAL"}},include:{knowledge:true,confirmations:{orderBy:{createdAt:"desc"},include:{approvals:true}}}}):[];
    const validFacts=new Set(governedFacts.filter(f=>factState(f)==="CONFIRMED").map(f=>f.id));
    const usableEvidence=evidenceRows.filter(item=>{const value=item.locator as {factRecordId?:string}|null;return !value?.factRecordId||validFacts.has(value.factRecordId);});
    let evidenceBudget = this.limits.totalEvidenceChars;
    const evidence = usableEvidence.flatMap((item) => {
      if (evidenceBudget <= 0) { contextTruncated = true; return []; }
      const raw = JSON.stringify({ excerpt: item.excerpt, claim: item.claim, note: item.note });
      const selected = take(raw, evidenceBudget);
      evidenceBudget -= selected.value.length;
      contextTruncated ||= selected.truncated;
      const ownership = item.ownership === "EXTERNAL" || (item.sourceItemId && !item.dedupeKey) ? "EXTERNAL" : item.ownership;
      return [{ id: item.id, type: item.type, sourceItemId: item.sourceItemId, ownership, content: selected.value }];
    });
    const profileContext = classifyCreatorContext(creatorProfile ? { displayName: creatorProfile.displayName, positioning: creatorProfile.positioning, targetAudience: creatorProfile.targetAudience, tone: creatorProfile.tone, preferredStyle: creatorProfile.preferredStyle, forbiddenStyle: creatorProfile.forbiddenStyle, coreTopics: strings(creatorProfile.coreTopics), personalViews: strings(creatorProfile.personalViews), brandTerms: strings(creatorProfile.brandTerms), forbiddenTerms: strings(creatorProfile.forbiddenTerms), hookPreferences: strings(creatorProfile.hookPreferences), structurePreferences: strings(creatorProfile.structurePreferences), ctaPreferences: strings(creatorProfile.ctaPreferences), examplePhrases: strings(creatorProfile.examplePhrases), notes: creatorProfile.notes } : null);
    const briefData = brief ? { topic: brief.topic, angle: brief.angle, audience: brief.audience, coreMessage: brief.coreMessage, coreQuestion: brief.coreQuestion, background: brief.background, keyPoints: strings(brief.keyPoints), structure: strings(brief.structure), tone: brief.tone, risks: strings(brief.risks), metadata: brief.metadata, version: brief.version } : null;
    const ownContribution = resolveOwnContribution({ coreMessage: briefData?.coreMessage, background: briefData?.background, audience: briefData?.audience });
    const hasOwnBackground = Boolean(briefData?.background?.trim());
    const isExternalReferenceEvidence = (item: (typeof evidence)[number]) => item.ownership === "EXTERNAL";
    const profileFacts: ConfirmedOwnFact[] = profileContext.confirmedFacts.map((text) => ({ text, source: "CREATOR_PROFILE", kind: "EXPERIENCE" }));
    const supplementFacts: ConfirmedOwnFact[] = extractExplicitOwnFacts(`${briefData?.coreMessage ?? ""}\n${briefData?.background ?? ""}`).map((text) => ({ text, source: "MY_SUPPLEMENT", kind: "EXPERIENCE" }));
    const projectFacts: ConfirmedOwnFact[] = usableEvidence.filter((item) => item.ownership === "OWN" && (!item.sourceItemId || item.dedupeKey)).flatMap((item) => {
      const text = item.claim?.trim() || item.excerpt?.trim() || item.note?.trim();
      const kind = item.type === "ORGANIZATION" || item.type === "PRODUCT_SERVICE" || item.type === "COMMERCIAL_COMMITMENT" ? "FACT" as const : item.type;
      return text ? [{ text, source: "PROJECT_EVIDENCE" as const, kind, sourceId: item.id }] : [];
    });
    const baseOwnFacts = uniqueConfirmedFacts([...profileFacts, ...supplementFacts, ...projectFacts]);
    const currentDraftFacts: ConfirmedOwnFact[] = project.motherContent ? baseOwnFacts.filter((fact) => project.motherContent!.body.includes(fact.text)).map((fact) => ({ ...fact, source: "CURRENT_DRAFT" })) : [];
    const ownFacts = uniqueConfirmedFacts([...baseOwnFacts, ...currentDraftFacts]);
    const confirmedFacts = ownFacts.map(({ text }) => text);
    const externalReferenceEvidence = evidence.filter(isExternalReferenceEvidence).map(({ id, type, sourceItemId, content }) => ({ id, type, sourceItemId, content }));
    const additionalExternalReferences = (input.externalReferences ?? []).map((item) => ({ ...item, attribution: "EXTERNAL" as const }));
    const currentDraft = project.motherContent ? { title: project.motherContent.title, version: project.motherContent.version, confirmedVersion: project.motherContent.confirmedVersion, hasBody: Boolean(project.motherContent.body.trim()), trustedFacts: currentDraftFacts.map(({ text }) => text) } : { title: "", version: 0, confirmedVersion: null, hasBody: false, trustedFacts: [] as string[] };
    const context = creationAction
      ? { task: { action: input.action, studioAction: input.studioAction ?? null }, project: { ipBackground: project.ipContextSnapshot, id: project.id, title: project.title, goal: project.goal, audience: project.audience }, mySupplement: briefData ? { myCoreViewpoint: briefData.coreMessage, audience: briefData.audience, ownBusinessExperienceOrCases: briefData.background, otherRequirements: briefData.angle, inspirationSource: briefData.metadata } : null, ownContribution, creatorProfile: { ...profileContext.profile, confirmedFacts: profileContext.confirmedFacts, currentUnderstanding: profileContext.currentUnderstanding, pendingInformation: profileContext.pendingInformation }, confirmedFacts, currentDraft, ...(defaultMethodContext ? { defaultContentMethod: defaultMethodContext } : {}), ...(selectedMethodContext.length ? { selectedMethods: selectedMethodContext } : {}), externalReferences: { materials: sources, evidence: externalReferenceEvidence, additional: additionalExternalReferences }, factSafetyBoundary: { methodsAreFacts: false, externalReferencesAreOwnFacts: false, unconfirmedInformationIsUsableAsFact: false, promisesAllowed: false } }
      : { project: { ipBackground: project.ipContextSnapshot, id: project.id, title: project.title, description: project.description, goal: project.goal, audience: project.audience }, creatorProfile: profileContext.profile, sources, evidence, creativeBasis: evidence.map((item) => ({ ...item, status: "ADOPTED", verificationRequired: false })), creativeBrief: briefData, ...(defaultMethodContext ? { defaultContentMethod: defaultMethodContext } : {}), ...(selectedMethodContext.length ? { selectedMethods: selectedMethodContext } : {}) };
    const hasOwnEvidence = ownFacts.some(({ kind }) => ["FACT", "CASE", "DATA", "EXPERIENCE"].includes(kind));
    const hasOwnCaseOrData = ownFacts.some(({ kind }) => ["CASE", "DATA"].includes(kind));
    const snapshot = creationAction ? context : null;
    return { context, snapshot, ownFacts, hasOwnEvidence, hasOwnCaseOrData, ownContribution, hasOwnBackground, contextTruncated, selectedMethods, defaultMethod, skillResolution, inputSummary: { action: input.action, ...(input.studioAction ? { studioAction: input.studioAction } : {}), sourceCount: sources.length, evidenceCount: evidence.length, materialAnalysisCount: sourceRows.filter(({ sourceItem }) => sourceItem.materialAnalyses.length > 0).length, materialDistillationCount: sourceRows.filter(({ sourceItem }) => sourceItem.materialDistillations.length > 0).length, hasUnifiedCreativeAnalysis: false, hasCreativeBrief: Boolean(brief), contextChars: JSON.stringify(context).length, hasCreatorProfile: Boolean(profileContext.profile), confirmedOwnFactCount: ownFacts.length, creatorUnderstandingCount: profileContext.currentUnderstanding.length, pendingCreatorInformationCount: profileContext.pendingInformation.length, hasCurrentDraft: currentDraft.hasBody, hasOwnEvidence, hasOwnCaseOrData, ownContribution, hasOwnBackground, contextTruncated, resolver: skillResolution, ...(defaultMethod ? { defaultMethodAssetId: defaultMethod.assetId, defaultMethodVersionId: defaultMethod.versionId, defaultMethodVersion: defaultMethod.version, defaultMethodSections: defaultMethod.sections.map(({ code }) => code) } : {}), ...(selectedMethods.length ? { selectedMethodCount: selectedMethods.length, selectedMethodVersionIds: selectedMethods.map(({ methodVersionId }) => methodVersionId) } : {}) } };
  }
}

export { ProjectContextBuilder as CreationContextBuilder };
