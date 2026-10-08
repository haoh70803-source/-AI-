import "server-only";

import { db } from "@content-center/db";
import { saveMotherContent } from "../mother-content-service";
import { ProjectServiceError } from "../project-service";

export async function importGPTWebDraft(input: { workspaceId: string; userId: string; projectId: string; title: string; body: string; note?: string; confirmReplace: boolean }) {
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } }, include: { motherContent: true } });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  if (project.motherContent?.body.trim() && !input.confirmReplace) throw new GPTDraftImportError("GPT_IMPORT_CONFIRMATION_REQUIRED", "导入 GPT 成稿将创建新的母稿版本，请先确认。");
  const content = await saveMotherContent({ workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, auditAction: "mother_content.imported_from_gpt_web", preservePreviousVersion: Boolean(project.motherContent), data: { title: input.title, body: input.body, outline: [], expectedVersion: project.motherContent?.version ?? 0, origin: "GPT_WEB", originNote: input.note?.trim() || null } });
  return { id: content.id, title: content.title, body: content.body, outline: content.outline, version: content.version, origin: content.origin, originNote: content.originNote, updatedAt: content.updatedAt };
}

export class GPTDraftImportError extends Error {
  constructor(readonly code: "GPT_IMPORT_CONFIRMATION_REQUIRED", message: string) { super(message); this.name = "GPTDraftImportError"; }
}
