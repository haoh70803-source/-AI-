import "server-only";

import { db, type MotherContentOrigin } from "@content-center/db";
import { VersionConflictError } from "./brief-service";
import { confirmDraftRevision, DraftServiceError, getDraftHistory, getPrimaryDraft, savePrimaryDraftFromLegacy } from "./drafts/service";
import { ProjectServiceError } from "./project-service";

export type MotherContentInput = {
  title: string;
  body: string;
  outline: string[];
  expectedVersion: number;
  origin?: MotherContentOrigin;
  originNote?: string | null;
};

export type MotherContentVersion = {
  title: string;
  body: string;
  outline: string[];
  version: number;
  revision: number;
  origin: MotherContentOrigin;
  originNote: string | null;
  createdAt: string;
  current: boolean;
};

export class MotherContentConfirmationError extends Error {
  constructor(readonly code: "MOTHER_CONTENT_NOT_FOUND" | "MOTHER_VERSION_CONFLICT" | "MOTHER_WARNINGS_UNCONFIRMED", message: string) {
    super(message);
    this.name = "MotherContentConfirmationError";
  }
}

export async function saveMotherContent(input: { workspaceId: string; userId: string; projectId: string; data: MotherContentInput; generateRunId?: string | null; auditAction?: "mother_content.updated" | "mother_content.imported_from_gpt_web"; preservePreviousVersion?: boolean }) {
  try {
    const saved = await savePrimaryDraftFromLegacy({
      workspaceId: input.workspaceId,
      userId: input.userId,
      projectId: input.projectId,
      title: input.data.title,
      body: input.data.body,
      outline: input.data.outline,
      expectedMotherVersion: input.data.expectedVersion,
      origin: input.data.origin,
      originNote: input.data.originNote,
      generateRunId: input.generateRunId,
      auditAction: input.auditAction,
      preservePreviousVersion: input.preservePreviousVersion,
    });
    if (!saved.legacyContent) throw new ProjectServiceError("PROJECT_NOT_FOUND");
    return saved.legacyContent;
  } catch (error) {
    if (error instanceof DraftServiceError && error.code === "DRAFT_VERSION_CONFLICT") throw new VersionConflictError();
    if (error instanceof DraftServiceError && (error.code === "PROJECT_NOT_FOUND" || error.code === "DRAFT_NOT_FOUND")) throw new ProjectServiceError("PROJECT_NOT_FOUND");
    throw error;
  }
}

export async function saveMotherWarningConfirmations(input: { workspaceId: string; userId: string; projectId: string; version: number; warningKeys: string[] }) {
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } }, select: { motherContent: true } });
  if (!project?.motherContent) throw new MotherContentConfirmationError("MOTHER_CONTENT_NOT_FOUND", "口播稿不存在。");
  if (project.motherContent.version !== input.version) throw new MotherContentConfirmationError("MOTHER_VERSION_CONFLICT", "口播稿已更新，请重新确认当前版本。");
  return db.motherContent.update({ where: { id: project.motherContent.id }, data: { confirmedWarnings: input.warningKeys } });
}

export async function confirmMotherContent(input: { workspaceId: string; userId: string; projectId: string; version: number; warningKeys: string[]; currentWarningKeys: string[] }) {
  const [project, draft] = await Promise.all([
    db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } }, select: { motherContent: true } }),
    getPrimaryDraft(input).catch(() => null),
  ]);
  if (!project?.motherContent || !draft?.currentRevision) throw new MotherContentConfirmationError("MOTHER_CONTENT_NOT_FOUND", "口播稿不存在。");
  if (project.motherContent.version !== input.version) throw new MotherContentConfirmationError("MOTHER_VERSION_CONFLICT", "口播稿已更新，请重新确认当前版本。");
  const confirmed = new Set(input.warningKeys);
  if (input.currentWarningKeys.some((key) => !confirmed.has(key))) throw new MotherContentConfirmationError("MOTHER_WARNINGS_UNCONFIRMED", "还有内容需要确认后才能进入平台适配。");
  try {
    const result = await confirmDraftRevision({ workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, branchId: draft.id, expectedVersion: draft.version, warningKeys: input.warningKeys, currentWarningKeys: input.currentWarningKeys });
    if (!result.legacyContent) throw new MotherContentConfirmationError("MOTHER_CONTENT_NOT_FOUND", "口播稿不存在。");
    return result.legacyContent;
  } catch (error) {
    if (error instanceof DraftServiceError && error.code === "DRAFT_VERSION_CONFLICT") throw new MotherContentConfirmationError("MOTHER_VERSION_CONFLICT", "口播稿已更新，请重新确认当前版本。");
    throw error;
  }
}

export async function listMotherContentVersions(input: { workspaceId: string; userId: string; projectId: string }): Promise<MotherContentVersion[]> {
  const primary = await getPrimaryDraft(input).catch((error) => {
    if (error instanceof DraftServiceError && error.code === "PROJECT_NOT_FOUND") throw new ProjectServiceError("PROJECT_NOT_FOUND");
    throw error;
  });
  const history = await getDraftHistory({ ...input, branchId: primary.id });
  return history.map((item) => ({ ...item, version: item.revision, revision: item.revision, origin: item.origin === "AI" ? "KIMI" : item.origin }));
}
