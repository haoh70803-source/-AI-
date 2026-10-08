import "server-only";

import { db, type Prisma } from "@content-center/db";

export type CreatorProfileInput = {
  displayName: string;
  positioning: string;
  targetAudience: string;
  tone: string;
  preferredStyle: string;
  forbiddenStyle: string;
  coreTopics: string[];
  personalViews: string[];
  brandTerms: string[];
  forbiddenTerms: string[];
  hookPreferences: string[];
  structurePreferences: string[];
  ctaPreferences: string[];
  examplePhrases: string[];
  notes: string;
};

function json(value: string[]): Prisma.InputJsonValue { return value; }

export function normalizeCreatorProfileInput(input: CreatorProfileInput) {
  const text = (value: string) => value.trim();
  return {
    displayName: text(input.displayName), positioning: text(input.positioning), targetAudience: text(input.targetAudience),
    tone: text(input.tone), preferredStyle: text(input.preferredStyle), forbiddenStyle: text(input.forbiddenStyle),
    coreTopics: json(input.coreTopics), personalViews: json(input.personalViews), brandTerms: json(input.brandTerms), forbiddenTerms: json(input.forbiddenTerms),
    hookPreferences: json(input.hookPreferences), structurePreferences: json(input.structurePreferences), ctaPreferences: json(input.ctaPreferences), examplePhrases: json(input.examplePhrases),
    notes: text(input.notes),
  };
}

export function getCreatorProfile(workspaceId: string, userId: string) {
  return db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
}

export async function saveCreatorProfile(input: { workspaceId: string; userId: string; data: CreatorProfileInput }) {
  const data = normalizeCreatorProfileInput(input.data);
  return db.$transaction(async (tx) => {
    const profile = await tx.creatorProfile.upsert({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      create: { workspaceId: input.workspaceId, userId: input.userId, ...data },
      update: data,
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId, userId: input.userId, action: "creator_profile.updated", resourceType: "creator_profile", resourceId: profile.id,
        metadata: { resourceId: profile.id, changedFields: Object.keys(data) },
      },
    });
    return profile;
  });
}
