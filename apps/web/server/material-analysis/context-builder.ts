import "server-only";

import { db } from "@content-center/db";
import { resolveSourceContent } from "@content-center/core";
import { readSourceMetadataEnvelope } from "@content-center/providers";

const MAX_TRANSCRIPT_CHARS = 40_000;

export class MaterialAnalysisContextError extends Error {
  constructor(readonly code: "SOURCE_NOT_FOUND" | "TRANSCRIPT_REQUIRED", message: string) {
    super(message);
    this.name = "MaterialAnalysisContextError";
  }
}

export async function buildMaterialAnalysisContext(input: { workspaceId: string; sourceItemId: string }) {
  const source = await db.sourceItem.findFirst({
    where: { id: input.sourceItemId, workspaceId: input.workspaceId },
    include: { transcript: true },
  });
  if (!source) throw new MaterialAnalysisContextError("SOURCE_NOT_FOUND", "素材不存在。");
  const sourceContent = resolveSourceContent({ sourceType: source.sourceType, rawText: source.rawText, sourceUpdatedAt: source.updatedAt, transcript: source.transcript });
  if (!sourceContent) throw new MaterialAnalysisContextError("TRANSCRIPT_REQUIRED", "请先完成资料读取，再进行智能整理。");
  const external = readSourceMetadataEnvelope(source.metadata)?.external;
  const contentText = sourceContent.contentText;
  const contextTruncated = contentText.length > MAX_TRANSCRIPT_CHARS;
  return {
    source,
    sourceContent,
    contextTruncated,
    context: {
      source: {
        title: external?.originalTitle ?? source.title,
        description: external?.description ?? source.description,
        platform: source.sourcePlatform,
        author: external?.authorName ?? source.author,
        publishedAt: external?.publishedAt ?? null,
        topics: external?.topics ?? [],
        interactionMetrics: external?.metrics ?? null,
      },
      content: contentText.slice(0, MAX_TRANSCRIPT_CHARS),
      cautions: [
        "Interaction metrics are market signals, not factual evidence.",
        "Claims in the transcript are source statements, not automatically verified facts.",
      ],
    },
    inputSummary: {
      sourceItemId: source.id,
      contentCharacters: contentText.length,
      contentSource: sourceContent.contentSource,
      hasExternalMetadata: Boolean(external),
    },
  };
}
