import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { sourcePlatformLabels } from "@/lib/content-labels";
import { sourceDisplayName } from "@/lib/content-production";
import { motherContentPreviewSchema, recommendStudioQuickActions } from "@/server/ai/schemas";
import { buildDraftWarnings } from "@/server/ai/draft-warnings";
import { ProjectContextBuilder } from "@/server/ai/project-context";
import { CreationFeedbackError, getCreationFeedbackContext, type CreationFeedbackContext } from "@/server/creation-feedback/service";
import { getCreatorProfile } from "@/server/creator-profile-service";
import { getPublishedDefaultContentMethodForStudio } from "@/server/default-content-method/service";
import { materialAnalysisOutputSchema } from "@/server/material-analysis/schemas";
import { getPrimaryDraft, listDraftBranches } from "@/server/drafts/service";
import { getProjectMethodState } from "@/server/project-methods/service";
import { getProjectForUser } from "@/server/project-service";
import { CreativeBriefPrefillService } from "@/server/studio/creative-brief-prefill";
import { listCanvasObjects } from "@/server/canvas/service";
import { getArtifactForUser, listArtifacts } from "@/server/artifacts/service";

type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function loadWorkbenchPageData(input: { userId: string; workspaceId: string; role: WorkspaceRole; projectId: string; activeArtifactId?: string | null }) {
  const project = await getProjectForUser(input);
  if (!project) return null;
  // Both draft readers initialize the primary branch. Initialize once before parallel reads.
  const initializedPrimaryDraft = await getPrimaryDraft(input);

  const sourceIds = project.sources.map(({ sourceItemId }) => sourceItemId);
  const feedbackForPage: Promise<CreationFeedbackContext> = getCreationFeedbackContext(input).catch((error) => {
    if (!(error instanceof CreationFeedbackError)) throw error;
    return { available: false, projectId: project.id, motherContentId: null, motherContentVersion: null, sourceAiRunId: null, methods: [], feedback: null, unavailableReason: "MOTHER_NOT_READY" as const };
  });
  const [availableSources, llm, ownProfile, primaryDraft, draftBranches, latestAppliedMotherRun, methodState, feedbackContext, defaultMethod, creationContext, canvasObjects, artifacts, activeArtifact] = await Promise.all([
    db.sourceItem.findMany({ where: { workspaceId: input.workspaceId, status: "READY", ...(sourceIds.length ? { id: { notIn: sourceIds } } : {}) }, select: { id: true, title: true, sourcePlatform: true, sourceType: true, createdAt: true, materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1, select: { summary: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    new IntegrationService().getIntegrationStatus(input.workspaceId, "LLM"),
    getCreatorProfile(input.workspaceId, input.userId),
    Promise.resolve(initializedPrimaryDraft),
    listDraftBranches(input),
    db.aIRun.findFirst({ where: { workspaceId: input.workspaceId, projectId: project.id, userId: input.userId, action: "GENERATE_MOTHER_CONTENT", appliedAt: { not: null }, status: "SUCCEEDED" }, orderBy: { appliedAt: "desc" }, select: { outputJson: true } }),
    getProjectMethodState(input),
    feedbackForPage,
    getPublishedDefaultContentMethodForStudio({ workspaceId: input.workspaceId }),
    new ProjectContextBuilder().build({ workspaceId: input.workspaceId, userId: input.userId, projectId: project.id, action: "REWRITE_SELECTION", studioAction: "TOPIC_IDEAS" }),
    listCanvasObjects(input),
    listArtifacts(input),
    input.activeArtifactId ? getArtifactForUser({ ...input, artifactId: input.activeArtifactId }) : null,
  ]);

  const brief = project.creativeBrief;
  const mother = project.motherContent;
  const currentDraft = primaryDraft.workingState;
  const initialWarnings = currentDraft?.body.trim() ? await buildDraftWarnings({ workspaceId: input.workspaceId, projectId: project.id, body: currentDraft.body }) : [];
  const storedBrief = brief ? { topic: brief.topic, angle: brief.angle, audience: brief.audience, coreMessage: brief.coreMessage, coreQuestion: brief.coreQuestion || "", background: brief.background || "", keyPoints: stringArray(brief.keyPoints), structure: stringArray(brief.structure), tone: brief.tone, risks: stringArray(brief.risks), version: brief.version, metadata: brief.metadata } : null;
  const creativePlan = CreativeBriefPrefillService.build({ project: { title: project.title, audience: project.audience, status: project.status }, sources: project.sources, existingBrief: storedBrief, hasMotherContent: Boolean(currentDraft?.body.trim()) });
  const studioProject = {
    id: project.id, title: project.title, status: project.status, creationModel: project.creationModel, description: project.description, goal: project.goal, audience: project.audience,
    sources: project.sources.filter(({ sourceItem }) => sourceItem.status !== "ARCHIVED").map(({ role: sourceRole, createdAt: addedAt, sourceItem }) => {
      const analysis = sourceItem.materialAnalyses[0];
      const parsed = materialAnalysisOutputSchema.safeParse(analysis?.understanding);
      return { role: sourceRole, addedAt: addedAt.toISOString(), sourceItem: { id: sourceItem.id, title: sourceItem.title, author: sourceItem.author, description: sourceItem.description, displayName: sourceDisplayName({ title: sourceItem.title, summary: analysis?.summary, platformLabel: sourcePlatformLabels[sourceItem.sourcePlatform] || sourceItem.sourcePlatform, createdAt: sourceItem.createdAt }), sourcePlatform: sourceItem.sourcePlatform, sourceType: sourceItem.sourceType, status: sourceItem.status, thumbnailUrl: sourceItem.thumbnailUrl, updatedAt: sourceItem.updatedAt.toISOString(), tags: sourceItem.tags.map(({ tag }) => tag), assets: sourceItem.assets, rawText: sourceItem.rawText, transcript: sourceItem.transcript ? { fullText: sourceItem.transcript.fullText, updatedAt: sourceItem.transcript.updatedAt.toISOString() } : null, referenceUpdated: Boolean(sourceItem.transcript && analysis && sourceItem.transcript.updatedAt > analysis.transcriptUpdatedAtAtAnalysis), materialAnalysis: analysis ? { version: analysis.version, summary: analysis.summary, keyPoints: stringArray(analysis.keyPoints), understanding: parsed.success ? parsed.data : null, legacy: !parsed.success || !(parsed.success && "expression" in parsed.data) } : null } };
    }),
    creativePlan,
    motherContent: { title: currentDraft.title, body: currentDraft.body, outline: currentDraft.outline, version: mother?.version || 0, origin: currentDraft.origin === "AI" ? "KIMI" as const : currentDraft.origin, originNote: currentDraft.originNote, confirmedVersion: primaryDraft.confirmedRevisionId === primaryDraft.currentRevisionId ? mother?.version ?? null : null, confirmedWarnings: Array.isArray(mother?.confirmedWarnings) ? mother.confirmedWarnings.filter((value): value is string => typeof value === "string") : [], draftBranchId: primaryDraft.id, draftBranchTitle: primaryDraft.title, draftBranchVersion: primaryDraft.version, draftRevision: primaryDraft.currentRevision?.revision || 0, draftConfirmed: Boolean(primaryDraft.currentRevisionId && primaryDraft.confirmedRevisionId === primaryDraft.currentRevisionId), isPrimary: true },
    platformVariants: project.platformVariants.map((variant) => ({ id: variant.id, platform: variant.platform, version: variant.version, title: variant.title, body: variant.body, hook: variant.hook, summary: variant.summary, hashtags: stringArray(variant.hashtags), mediaPlan: variant.mediaPlan, metadata: variant.metadata, status: variant.status, sourceMotherVersion: variant.sourceMotherVersion, isStale: variant.sourceMotherVersion < (mother?.version ?? 0) })),
  };
  const profile = project.creatorProfile || ownProfile;
  const parsedProductionPlan = motherContentPreviewSchema.safeParse(latestAppliedMotherRun?.outputJson);
  const briefMetadata = jsonObject(brief?.metadata);

  return {
    project: { ...studioProject, productionPlan: parsedProductionPlan.success ? parsedProductionPlan.data : null },
    draftBranches,
    canvasObjects,
    methods: methodState,
    defaultMethod,
    recommendedActions: recommendStudioQuickActions({ hasTopic: Boolean(brief?.coreMessage.trim() || brief?.topic.trim()), hasDraft: Boolean(currentDraft?.body.trim()), hasOwnEvidence: creationContext.hasOwnCaseOrData }),
    availableSources: availableSources.map((source) => ({ ...source, displayName: sourceDisplayName({ title: source.title, summary: source.materialAnalyses[0]?.summary, platformLabel: sourcePlatformLabels[source.sourcePlatform] || source.sourcePlatform, createdAt: source.createdAt }) })),
    feedback: feedbackContext,
    editable: input.role !== "VIEWER",
    ai: { integrationStatus: llm.status !== "CONFIGURED" && process.env.MOCK_MODE === "true" ? "MOCK" as const : llm.status, creatorProfile: profile ? { displayName: profile.displayName, positioning: profile.positioning } : null },
    contextSummary: {
      topic: brief?.topic || project.title,
      goal: project.goal || brief?.coreMessage || "继续完善当前口播稿",
      ownFacts: creationContext.ownFacts.slice(0, 12).map((fact) => ({ text: fact.text, source: fact.source, kind: fact.kind })),
      profile: profile ? { displayName: profile.displayName, positioning: profile.positioning } : null,
      creatorUnderstandingCount: creationContext.inputSummary.creatorUnderstandingCount,
      externalSourceCount: creationContext.inputSummary.sourceCount,
      handoff: typeof briefMetadata.handoff === "string" ? briefMetadata.handoff : null,
    },
    initialWarnings,
    artifacts,
    activeArtifact,
  };
}
