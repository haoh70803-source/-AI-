import "server-only";

import { db, type Prisma } from "@content-center/db";
import { z } from "zod";
import {
  DEFAULT_CONTENT_METHOD_KIND,
  DEFAULT_CONTENT_METHOD_SCHEMA_VERSION,
  defaultContentMethodSectionCodes,
  defaultContentMethodSectionsSchema,
  emptyDefaultContentMethodSections,
  getDefaultContentMethodReadiness,
  parseDefaultContentMethodPayload,
  type DefaultContentMethodPayload,
  type DefaultContentMethodSection,
} from "./schemas";

export const DEFAULT_CONTENT_METHOD_TITLE = "鑫世界默认创作方法";
export const DEFAULT_CONTENT_METHOD_KEY = "DEFAULT_CONTENT";

export class DefaultContentMethodError extends Error {
  constructor(readonly code: "DEFAULT_METHOD_INVALID" | "DEFAULT_METHOD_NOT_FOUND" | "DEFAULT_METHOD_CONFLICT" | "DEFAULT_METHOD_FORBIDDEN" | "DEFAULT_METHOD_ACTIVE", message: string) {
    super(message);
    this.name = "DefaultContentMethodError";
  }
}

export type DefaultContentMethodVersionDTO = {
  id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED";
  origin: "HUMAN" | "AI_SUGGESTION";
  createdFromVersion: number | null;
  publishedAt: string | null;
  sections: DefaultContentMethodSection[];
  readyToPublish: boolean;
  missingSections: DefaultContentMethodSection["code"][];
  editedBy: string;
  createdAt: string;
};

export type DefaultContentMethodDTO = {
  assetId: string | null;
  title: typeof DEFAULT_CONTENT_METHOD_TITLE;
  current: DefaultContentMethodVersionDTO | null;
  draft: DefaultContentMethodVersionDTO | null;
  history: DefaultContentMethodVersionDTO[];
  updatedAt: string | null;
};

export type StudioDefaultContentMethodDTO = {
  assetId: string;
  versionId: string;
  version: number;
  title: string;
  sections: DefaultContentMethodSection[];
};

const versionSelect = { id: true, version: true, title: true, steps: true, workspaceDefaultKey: true, editedById: true, editedBy: { select: { name: true } }, createdAt: true } as const;
type VersionRow = Prisma.MethodVersionGetPayload<{ select: typeof versionSelect }>;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  try { return await db.$transaction(work, { isolationLevel: "Serializable" }); }
  catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2034") throw error;
    return db.$transaction(work, { isolationLevel: "Serializable" });
  }
}

function payload(input: { status: "DRAFT" | "PUBLISHED"; origin: "HUMAN" | "AI_SUGGESTION"; createdFromVersion: number | null; sections: DefaultContentMethodSection[]; publishedById?: string | null }): DefaultContentMethodPayload {
  return {
    kind: DEFAULT_CONTENT_METHOD_KIND,
    schemaVersion: DEFAULT_CONTENT_METHOD_SCHEMA_VERSION,
    publicationStatus: input.status,
    origin: input.origin,
    createdFromVersion: input.createdFromVersion,
    publishedAt: input.status === "PUBLISHED" ? new Date().toISOString() : null,
    publishedById: input.status === "PUBLISHED" ? input.publishedById ?? null : null,
    sections: input.sections,
  };
}

function toVersion(row: VersionRow): DefaultContentMethodVersionDTO | null {
  const parsed = parseDefaultContentMethodPayload(row.steps);
  if (!parsed.success) return null;
  return {
    id: row.id,
    version: row.version,
    status: parsed.data.publicationStatus,
    origin: parsed.data.origin,
    createdFromVersion: parsed.data.createdFromVersion,
    publishedAt: parsed.data.publishedAt,
    sections: parsed.data.sections,
    ...getDefaultContentMethodReadiness(parsed.data.sections),
    editedBy: row.editedBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDTO(asset: { id: string; updatedAt: Date; versions: VersionRow[] } | null): DefaultContentMethodDTO {
  if (!asset) return { assetId: null, title: DEFAULT_CONTENT_METHOD_TITLE, current: null, draft: null, history: [], updatedAt: null };
  const versions = asset.versions.flatMap((version) => toVersion(version) ?? []);
  return {
    assetId: asset.id,
    title: DEFAULT_CONTENT_METHOD_TITLE,
    current: versions.find(({ status }) => status === "PUBLISHED") ?? null,
    draft: versions.find(({ status }) => status === "DRAFT") ?? null,
    history: versions.filter(({ status }) => status === "PUBLISHED"),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export async function assertDefaultContentMethodEditor(workspaceId: string, userId: string) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
  if (!member || member.role === "VIEWER") throw new DefaultContentMethodError("DEFAULT_METHOD_FORBIDDEN", "当前权限不能修改默认创作方法。");
}

async function defaultAssets(client: typeof db | Prisma.TransactionClient, workspaceId: string) {
  const assets = await client.methodAsset.findMany({ where: { workspaceId }, include: { versions: { orderBy: { version: "desc" }, select: versionSelect } } });
  return assets.filter((asset) => asset.versions.some((version) => version.workspaceDefaultKey === DEFAULT_CONTENT_METHOD_KEY && parseDefaultContentMethodPayload(version.steps).success));
}

export async function getDefaultContentMethod(input: { workspaceId: string }): Promise<DefaultContentMethodDTO> {
  const assets = await defaultAssets(db, input.workspaceId);
  if (assets.length > 1) throw new DefaultContentMethodError("DEFAULT_METHOD_CONFLICT", "当前空间存在多个默认创作方法，请联系管理员处理。");
  return toDTO(assets[0] ?? null);
}

export async function getPublishedDefaultContentMethodForStudio(input: { workspaceId: string; sectionCodes?: DefaultContentMethodSection["code"][] }): Promise<StudioDefaultContentMethodDTO | null> {
  const state = await getDefaultContentMethod(input);
  if (!state.assetId || !state.current) return null;
  const wanted = new Set(input.sectionCodes ?? defaultContentMethodSectionCodes);
  return { assetId: state.assetId, versionId: state.current.id, version: state.current.version, title: state.title, sections: state.current.sections.filter(({ code }) => wanted.has(code)) };
}

export async function createDefaultContentMethodDraft(input: { workspaceId: string; userId: string; origin: "HUMAN" | "AI_SUGGESTION" }) {
  await assertDefaultContentMethodEditor(input.workspaceId, input.userId);
  await serializable(async (tx) => {
    const matches = await defaultAssets(tx, input.workspaceId);
    if (matches.length > 1) throw new DefaultContentMethodError("DEFAULT_METHOD_CONFLICT", "当前空间存在多个默认创作方法，请联系管理员处理。");
    const existing = matches[0];
    const versions = existing?.versions.flatMap((version) => {
      const parsed = parseDefaultContentMethodPayload(version.steps);
      return parsed.success ? [{ row: version, payload: parsed.data }] : [];
    }) ?? [];
    if (versions.some(({ payload }) => payload.publicationStatus === "DRAFT")) return;
    const published = versions.find(({ payload }) => payload.publicationStatus === "PUBLISHED");
    const nextVersion = (existing?.versions[0]?.version ?? 0) + 1;
    const asset = existing ?? await tx.methodAsset.create({ data: { workspaceId: input.workspaceId, ownerUserId: input.userId, status: "SAVED", statusUpdatedAt: new Date() }, include: { versions: { select: versionSelect } } });
    await tx.methodVersion.create({ data: { assetId: asset.id, version: nextVersion, title: DEFAULT_CONTENT_METHOD_TITLE, steps: json(payload({ status: "DRAFT", origin: input.origin, createdFromVersion: published?.row.version ?? null, sections: published?.payload.sections ?? emptyDefaultContentMethodSections() })), applicableScenarios: [], boundaries: [], workspaceDefaultKey: DEFAULT_CONTENT_METHOD_KEY, evidence: [], editedById: input.userId } });
    await tx.methodAsset.update({ where: { id: asset.id }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "default_content_method.draft_created", resourceType: "method_asset", resourceId: asset.id, metadata: { version: nextVersion, origin: input.origin } } });
  });
  return getDefaultContentMethod({ workspaceId: input.workspaceId });
}

export async function saveDefaultContentMethodDraft(input: { workspaceId: string; userId: string; version: number; sections: unknown; origin: "HUMAN" | "AI_SUGGESTION" }) {
  await assertDefaultContentMethodEditor(input.workspaceId, input.userId);
  const sections = defaultContentMethodSectionsSchema.safeParse(input.sections);
  if (!sections.success) throw new DefaultContentMethodError("DEFAULT_METHOD_INVALID", "请检查七个创作指南部分。");
  await serializable(async (tx) => {
    const matches = await defaultAssets(tx, input.workspaceId);
    const asset = matches.length === 1 ? matches[0] : null;
    const row = asset?.versions.find((version) => version.version === input.version);
    const current = row ? parseDefaultContentMethodPayload(row.steps) : null;
    if (!asset || !row || !current?.success) throw new DefaultContentMethodError("DEFAULT_METHOD_NOT_FOUND", "默认创作方法草稿不存在。");
    if (current.data.publicationStatus !== "DRAFT" || asset.versions[0]?.version !== input.version) throw new DefaultContentMethodError("DEFAULT_METHOD_CONFLICT", "这个版本已发布或已经不是当前草稿。");
    await tx.methodVersion.update({ where: { id: row.id }, data: { steps: json({ ...current.data, origin: input.origin, sections: sections.data }), editedById: input.userId } });
    await tx.methodAsset.update({ where: { id: asset.id }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "default_content_method.draft_saved", resourceType: "method_asset", resourceId: asset.id, metadata: { version: input.version, origin: input.origin } } });
  });
  return getDefaultContentMethod({ workspaceId: input.workspaceId });
}

export async function publishDefaultContentMethod(input: { workspaceId: string; userId: string; version: number; actor: "HUMAN" | "AI" }) {
  await assertDefaultContentMethodEditor(input.workspaceId, input.userId);
  if (input.actor !== "HUMAN") throw new DefaultContentMethodError("DEFAULT_METHOD_FORBIDDEN", "AI 只能提出草稿，不能发布正式方法。");
  await serializable(async (tx) => {
    const matches = await defaultAssets(tx, input.workspaceId);
    const asset = matches.length === 1 ? matches[0] : null;
    const row = asset?.versions.find((version) => version.version === input.version);
    const current = row ? parseDefaultContentMethodPayload(row.steps) : null;
    if (!asset || !row || !current?.success) throw new DefaultContentMethodError("DEFAULT_METHOD_NOT_FOUND", "默认创作方法草稿不存在。");
    if (current.data.publicationStatus !== "DRAFT" || asset.versions[0]?.version !== input.version) throw new DefaultContentMethodError("DEFAULT_METHOD_CONFLICT", "这个版本已发布或已经不是当前草稿。");
    if (!getDefaultContentMethodReadiness(current.data.sections).readyToPublish) throw new DefaultContentMethodError("DEFAULT_METHOD_INVALID", "候选稿还有部分内容需要补充后才能发布。");
    const published = payload({ status: "PUBLISHED", origin: current.data.origin, createdFromVersion: current.data.createdFromVersion, sections: current.data.sections, publishedById: input.userId });
    await tx.methodVersion.update({ where: { id: row.id }, data: { steps: json(published), editedById: input.userId } });
    await tx.methodAsset.update({ where: { id: asset.id }, data: { status: "CORE", statusUpdatedAt: new Date(), updatedAt: new Date() } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "default_content_method.published", resourceType: "method_asset", resourceId: asset.id, metadata: { version: input.version } } });
  });
  return getDefaultContentMethod({ workspaceId: input.workspaceId });
}

export async function deleteDefaultContentMethod(input: { workspaceId: string; userId: string }) {
  await assertDefaultContentMethodEditor(input.workspaceId, input.userId);
  const current = await getDefaultContentMethod({ workspaceId: input.workspaceId });
  if (!current.assetId) throw new DefaultContentMethodError("DEFAULT_METHOD_NOT_FOUND", "默认创作方法不存在。");
  if (current.current) throw new DefaultContentMethodError("DEFAULT_METHOD_ACTIVE", "当前正式默认创作方法不能删除。");
  await db.methodAsset.delete({ where: { id: current.assetId } });
}

export const defaultContentMethodDraftRequestSchema = z.object({ action: z.literal("CREATE_DRAFT") }).strict();
export const defaultContentMethodGenerateRequestSchema = z.object({ action: z.literal("GENERATE_CANDIDATE"), replaceExisting: z.boolean().optional() }).strict();
export const defaultContentMethodSaveRequestSchema = z.object({ version: z.number().int().positive(), sections: defaultContentMethodSectionsSchema }).strict();
export const defaultContentMethodPublishRequestSchema = z.object({ action: z.literal("PUBLISH"), version: z.number().int().positive() }).strict();
