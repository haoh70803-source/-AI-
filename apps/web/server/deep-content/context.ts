import "server-only";

import { db } from "@content-center/db";
import { ProjectServiceError } from "../project-service";

export type DeepContextBudgetLimits = {
  totalChars: number;
  evidenceChars: number;
  briefChars: number;
  profileChars: number;
  perSourceChars: number;
  sourceChars: number;
  motherChars: number;
};

const defaults: DeepContextBudgetLimits = { totalChars: 50_000, evidenceChars: 16_000, briefChars: 8_000, profileChars: 8_000, perSourceChars: 4_000, sourceChars: 16_000, motherChars: 4_000 };

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function unique(items: string[]) { return [...new Set(items.map((item) => item.trim()).filter(Boolean))]; }

export class DeepContentContextBuilder {
  constructor(private readonly limits: DeepContextBudgetLimits = defaults) {}

  async build(input: { workspaceId: string; userId: string; projectId: string }) {
    const project = await db.contentProject.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } },
      include: {
        creatorProfile: true,
        creativeBrief: true,
        motherContent: true,
        evidenceItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, type: true, excerpt: true, claim: true, note: true, sourceItemId: true, sourceUrl: true } },
        sources: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { role: true, sourceItem: { select: { id: true, title: true, sourcePlatform: true, rawText: true, transcript: { select: { fullText: true } } } } } },
      },
    });
    if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
    const profile = project.creatorProfile ?? await db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } });
    let remaining = this.limits.totalChars;
    let contextTruncated = false;
    const take = (value: string, categoryLimit: number) => {
      const limit = Math.max(0, Math.min(categoryLimit, remaining));
      const selected = value.slice(0, limit);
      remaining -= selected.length;
      if (selected.length < value.length) contextTruncated = true;
      return selected;
    };

    let evidenceRemaining = this.limits.evidenceChars;
    const evidence = project.evidenceItems.flatMap((item) => {
      if (evidenceRemaining <= 0 || remaining <= 0) { contextTruncated = true; return []; }
      const raw = [item.claim, item.excerpt, item.note].filter(Boolean).join(" — ");
      const content = take(raw, evidenceRemaining);
      evidenceRemaining -= content.length;
      return content ? [{ id: item.id, type: item.type, sourceItemId: item.sourceItemId, sourceReference: item.sourceUrl, content }] : [];
    });

    const briefRaw = project.creativeBrief ? JSON.stringify({ topic: project.creativeBrief.topic, angle: project.creativeBrief.angle, audience: project.creativeBrief.audience, coreMessage: project.creativeBrief.coreMessage, keyPoints: strings(project.creativeBrief.keyPoints), structure: strings(project.creativeBrief.structure), tone: project.creativeBrief.tone, risks: strings(project.creativeBrief.risks) }) : "";
    const creativeBrief = briefRaw ? take(briefRaw, this.limits.briefChars) : null;
    const profileRaw = profile ? JSON.stringify({ displayName: profile.displayName, positioning: profile.positioning, targetAudience: profile.targetAudience, personalViews: strings(profile.personalViews), tone: profile.tone, preferredStyle: profile.preferredStyle, forbiddenStyle: profile.forbiddenStyle, forbiddenTerms: strings(profile.forbiddenTerms), brandTerms: strings(profile.brandTerms), examplePhrases: strings(profile.examplePhrases), coreTopics: strings(profile.coreTopics), hookPreferences: strings(profile.hookPreferences), structurePreferences: strings(profile.structurePreferences), ctaPreferences: strings(profile.ctaPreferences), notes: profile.notes }) : "";
    const creatorProfile = profileRaw ? take(profileRaw, this.limits.profileChars) : null;

    let sourceRemaining = this.limits.sourceChars;
    const sources = project.sources.flatMap(({ role, sourceItem }) => {
      if (sourceRemaining <= 0 || remaining <= 0) { contextTruncated = true; return []; }
      const raw = sourceItem.transcript?.fullText || sourceItem.rawText || "";
      const text = take(raw, Math.min(this.limits.perSourceChars, sourceRemaining));
      sourceRemaining -= text.length;
      return text ? [{ id: sourceItem.id, title: sourceItem.title, platform: sourceItem.sourcePlatform, role, text }] : [];
    });
    const motherContent = project.motherContent ? { title: project.motherContent.title, body: take(project.motherContent.body, this.limits.motherChars), outline: strings(project.motherContent.outline), version: project.motherContent.version } : null;
    const ownSourceIds = new Set(project.sources.filter(({ role }) => role === "OWN_MATERIAL").map(({ sourceItem }) => sourceItem.id));
    const ownEvidence = project.evidenceItems.filter(({ sourceItemId }) => sourceItemId && ownSourceIds.has(sourceItemId));
    const evidenceText = (types: string[]) => ownEvidence.filter(({ type }) => types.includes(type)).map((item) => item.claim || item.excerpt || item.note || "");
    const groundedCreatorContribution = {
      personalViews: unique([...strings(profile?.personalViews), ...evidenceText(["VIEWPOINT"])]),
      personalExperiences: unique(evidenceText(["EXPERIENCE"])),
      personalCases: unique(evidenceText(["CASE"])),
      professionalKnowledge: unique(strings(profile?.coreTopics)),
      positions: unique(profile?.positioning ? [profile.positioning] : []),
      preferredExpressions: unique([profile?.preferredStyle || "", ...strings(profile?.examplePhrases)]),
      brandPrinciples: unique(strings(profile?.brandTerms)),
      forbiddenExpressions: unique([profile?.forbiddenStyle || "", ...strings(profile?.forbiddenTerms)]),
    };
    const context = { project: { id: project.id, title: project.title, description: project.description, goal: project.goal, audience: project.audience }, evidence, creativeBrief, creatorProfile, sources, motherContent };
    return {
      context,
      contextTruncated,
      creatorProfileId: profile?.id ?? null,
      validEvidenceIds: new Set(project.evidenceItems.map(({ id }) => id)),
      validSourceIds: new Set(project.sources.map(({ sourceItem }) => sourceItem.id)),
      groundedCreatorContribution,
      inputSummary: { evidenceCount: evidence.length, sourceCount: sources.length, hasBrief: Boolean(creativeBrief), hasCreatorProfile: Boolean(creatorProfile), hasMotherContent: Boolean(motherContent), contextChars: JSON.stringify(context).length, contextTruncated },
    };
  }
}
