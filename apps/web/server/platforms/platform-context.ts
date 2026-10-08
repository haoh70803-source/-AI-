import "server-only";

import { db } from "@content-center/db";
import type { PlatformParameters } from "../../lib/platforms";
import { ProjectServiceError } from "../project-service";
import type { PlatformBuildInput } from "./adapters";

function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

export async function buildPlatformContext(input: { workspaceId: string; userId: string; projectId: string; parameters: PlatformParameters }) {
  const project = await db.contentProject.findFirst({
    where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } },
    include: { motherContent: true, creativeBrief: true, creatorProfile: true, evidenceItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 20, select: { id: true, type: true, claim: true, excerpt: true, note: true } } },
  });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  if (!project.motherContent?.body.trim()) throw new PlatformContextError("MOTHER_CONTENT_REQUIRED", "请先完成母稿，再生成平台版本。");
  const ownProfile = project.creatorProfile ?? await db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } });
  let contextTruncated = false;
  const body = project.motherContent.body.length > 100_000 ? (contextTruncated = true, project.motherContent.body.slice(0, 100_000)) : project.motherContent.body;
  let evidenceBudget = 8_000;
  const evidence = project.evidenceItems.flatMap((item) => {
    if (evidenceBudget <= 0) { contextTruncated = true; return []; }
    const raw = [item.claim, item.excerpt, item.note].filter(Boolean).join(" — ");
    const summary = raw.slice(0, Math.min(1_000, evidenceBudget));
    if (summary.length < raw.length) contextTruncated = true;
    evidenceBudget -= summary.length;
    return summary ? [{ id: item.id, type: item.type, summary }] : [];
  });
  const built: PlatformBuildInput = {
    motherContent: { id: project.motherContent.id, title: project.motherContent.title, body, outline: strings(project.motherContent.outline), version: project.motherContent.version },
    creativeBrief: project.creativeBrief ? { topic: project.creativeBrief.topic, angle: project.creativeBrief.angle, audience: project.creativeBrief.audience, coreMessage: project.creativeBrief.coreMessage, keyPoints: strings(project.creativeBrief.keyPoints), structure: strings(project.creativeBrief.structure), tone: project.creativeBrief.tone, risks: strings(project.creativeBrief.risks) } : null,
    creatorProfile: ownProfile ? { displayName: ownProfile.displayName, positioning: ownProfile.positioning, targetAudience: ownProfile.targetAudience, tone: ownProfile.tone, preferredStyle: ownProfile.preferredStyle, forbiddenStyle: ownProfile.forbiddenStyle, personalViews: strings(ownProfile.personalViews), brandTerms: strings(ownProfile.brandTerms), forbiddenTerms: strings(ownProfile.forbiddenTerms), hookPreferences: strings(ownProfile.hookPreferences), structurePreferences: strings(ownProfile.structurePreferences), ctaPreferences: strings(ownProfile.ctaPreferences), examplePhrases: strings(ownProfile.examplePhrases) } : null,
    evidence,
    parameters: input.parameters,
  };
  return { built, contextTruncated, inputSummary: { motherContentId: project.motherContent.id, sourceMotherVersion: project.motherContent.version, motherChars: body.length, evidenceCount: evidence.length, hasBrief: Boolean(project.creativeBrief), hasCreatorProfile: Boolean(ownProfile), contextTruncated } };
}

export class PlatformContextError extends Error {
  constructor(readonly code: "MOTHER_CONTENT_REQUIRED", message: string) { super(message); this.name = "PlatformContextError"; }
}
