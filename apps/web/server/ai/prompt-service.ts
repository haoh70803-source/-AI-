import "server-only";

import { db, type PromptType } from "@content-center/db";

export async function selectPromptTemplate(workspaceId: string, type: PromptType) {
  const workspace = await db.promptTemplate.findFirst({ where: { workspaceId, type, isActive: true }, orderBy: { version: "desc" } });
  if (workspace) return workspace;
  return db.promptTemplate.findFirstOrThrow({ where: { workspaceId: null, type, isActive: true }, orderBy: { version: "desc" } });
}

export function renderPrompt(template: string, context: unknown, input?: unknown) {
  return template.replaceAll("{{context}}", JSON.stringify(context, null, 2)).replaceAll("{{input}}", JSON.stringify(input ?? {}, null, 2));
}
