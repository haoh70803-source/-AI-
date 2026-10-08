import "server-only";
import {ensureFeishuSource,FeishuError} from "@content-center/integrations";

import { resolveSourceContent } from "@content-center/core";
import { db } from "@content-center/db";

/** Material's read boundary for callers that need usable source text. */
export async function getMaterialReadableContent(input: { workspaceId: string; userId: string; sourceItemId: string }) {
  try {await ensureFeishuSource(input,input.sourceItemId);} catch(error) {if(error instanceof FeishuError && error.status===403) return null; throw error;}
  const source = await db.sourceItem.findFirst({
    where: {
      id: input.sourceItemId,
      workspaceId: input.workspaceId,
      workspace: { disabledAt: null, members: { some: { userId: input.userId, disabledAt: null, user: { disabledAt: null } } } },
    },
    select: {
      id: true, title: true, sourceType: true, rawText: true, updatedAt: true,
      transcript: { select: { id: true, fullText: true, segments: true, updatedAt: true } },
      sourceUnderstanding: { select: { id: true, workspaceId: true, assetId: true, status: true, text: true, pages: true, provider: true, model: true, updatedAt: true } },
    },
  });
  if (!source) return null;

  const native = resolveSourceContent({
    sourceType: source.sourceType,
    rawText: source.rawText,
    sourceUpdatedAt: source.updatedAt,
    transcript: source.transcript,
  });
  const understanding = source.sourceUnderstanding;
  const useUnderstanding = (source.sourceType === "IMAGE" || !native)
    && understanding?.workspaceId === input.workspaceId
    && Boolean(understanding.text?.trim());

  if (useUnderstanding && understanding) {
    const pageNumbers = Array.isArray(understanding.pages)
      ? understanding.pages.flatMap((page) => {
        if (!page || typeof page !== "object" || Array.isArray(page)) return [];
        const number = (page as { page?: unknown }).page;
        return typeof number === "number" && Number.isInteger(number) && number > 0 ? [number] : [];
      }) : [];
    return {
      sourceItemId: source.id, title: source.title, sourceType: source.sourceType,
      contentText: understanding.text!.trim(), contentSource: "SOURCE_UNDERSTANDING" as const,
      updatedAt: understanding.updatedAt, version: `SOURCE_UNDERSTANDING:${understanding.id}:${understanding.updatedAt.toISOString()}`,
      transcriptId: null, segments: [], assetId: understanding.assetId, pageNumbers,
      provider: understanding.provider, model: understanding.model, understandingStatus: understanding.status,
    };
  }
  if (!native) return null;
  return {
    sourceItemId: source.id, title: source.title, sourceType: source.sourceType,
    ...native, assetId: null, pageNumbers: [], provider: null, model: null, understandingStatus: null,
  };
}
