import { db } from "@content-center/db";
import { resolveSourceContent, type SourceContent } from "@content-center/core";

export async function getSourceContent(input: { workspaceId: string; sourceItemId: string }): Promise<SourceContent | null> {
  const source = await db.sourceItem.findFirst({
    where: { id: input.sourceItemId, workspaceId: input.workspaceId },
    include: { transcript: true },
  });
  if (!source) return null;
  return resolveSourceContent({
    sourceType: source.sourceType,
    rawText: source.rawText,
    sourceUpdatedAt: source.updatedAt,
    transcript: source.transcript,
  });
}
