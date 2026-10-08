import "server-only";

import { db, type Prisma, type PlatformVariantStatus } from "@content-center/db";
import type { LLMRuntime } from "../ai/llm-runtime";
import { loadLLMRuntime } from "../ai/llm-runtime";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { ProjectServiceError } from "../project-service";
import { SUPPORTED_PLATFORMS, type PlatformParameters, type PlatformVariantView, type SupportedPlatform } from "../../lib/platforms";
import { buildPlatformContext } from "./platform-context";
import { getPlatformAdapter } from "./adapters";
import { selectPlatformTemplate } from "./platform-template-service";

const operations: Record<SupportedPlatform, string> = {
  DOUYIN: "ADAPT_DOUYIN",
  XIAOHONGSHU: "ADAPT_XIAOHONGSHU",
  WECHAT_MOMENTS: "ADAPT_WECHAT_MOMENTS",
  WECHAT_CHANNELS: "ADAPT_WECHAT_CHANNELS",
  WECHAT_OFFICIAL: "ADAPT_WECHAT_OFFICIAL",
};

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function isPlatform(value: unknown): value is SupportedPlatform { return typeof value === "string" && SUPPORTED_PLATFORMS.includes(value as SupportedPlatform); }
function runMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlatformVariantError("PLATFORM_RUN_INVALID", "平台生成记录缺少必要元数据。");
  const data = value as Record<string, unknown>;
  if (!isPlatform(data.platform) || typeof data.sourceMotherVersion !== "number" || typeof data.templateVersion !== "number") throw new PlatformVariantError("PLATFORM_RUN_INVALID", "平台生成记录缺少必要元数据。");
  return { platform: data.platform, sourceMotherVersion: data.sourceMotherVersion, templateVersion: data.templateVersion, parameters: (data.parameters && typeof data.parameters === "object" ? data.parameters : {}) as PlatformParameters };
}

function view(row: { id: string; platform: SupportedPlatform; version: number; title: string | null; body: string; hook: string | null; summary: string | null; hashtags: unknown; mediaPlan: unknown; metadata: unknown; status: PlatformVariantStatus; sourceMotherVersion: number }, motherVersion: number): PlatformVariantView {
  return { ...row, hashtags: strings(row.hashtags), isStale: row.sourceMotherVersion < motherVersion };
}

async function scopedProject(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: input.workspaceId, workspace: { members: { some: { userId: input.userId } } } }, include: { motherContent: true } });
  if (!project) throw new ProjectServiceError("PROJECT_NOT_FOUND");
  return project;
}

export async function listPlatformVariants(input: { workspaceId: string; userId: string; projectId: string }) {
  const project = await scopedProject(input);
  const rows = await db.platformVariant.findMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId }, orderBy: { platform: "asc" } });
  const motherVersion = project.motherContent?.version ?? 0;
  return { motherVersion, staleCount: rows.filter(({ sourceMotherVersion }) => sourceMotherVersion < motherVersion).length, variants: rows.map((row) => view({ ...row, platform: row.platform as SupportedPlatform }, motherVersion)) };
}

export async function getPlatformVariant(input: { workspaceId: string; userId: string; projectId: string; platform: SupportedPlatform }) {
  const project = await scopedProject(input);
  const row = await db.platformVariant.findFirst({ where: { workspaceId: input.workspaceId, projectId: input.projectId, platform: input.platform } });
  return row ? view({ ...row, platform: row.platform as SupportedPlatform }, project.motherContent?.version ?? 0) : null;
}

export async function generatePlatformPreviews(input: { workspaceId: string; userId: string; projectId: string; platforms: SupportedPlatform[]; parameters?: Partial<Record<SupportedPlatform, PlatformParameters>> }, dependencies: { runtime?: LLMRuntime } = {}) {
  const project = await scopedProject(input);
  if (!project.motherContent) throw new PlatformVariantError("MOTHER_CONTENT_REQUIRED", "请先完成并确认口播稿。");
  if (project.motherContent.confirmedVersion !== project.motherContent.version) throw new PlatformVariantError("MOTHER_CONFIRMATION_REQUIRED", "请先确认当前口播稿，再生成平台版本。");
  const running = await db.aIRun.findFirst({ where: { workspaceId: input.workspaceId, projectId: input.projectId, action: "ADAPT_PLATFORM", status: "RUNNING" }, select: { id: true } });
  if (running) throw new PlatformVariantError("PLATFORM_RUN_IN_PROGRESS", "平台内容正在生成，请稍候。");
  const runtime = dependencies.runtime ?? await loadLLMRuntime(input.workspaceId);
  const results = [];
  for (const platform of input.platforms) {
    const parameters = input.parameters?.[platform] ?? {};
    const [{ built, contextTruncated, inputSummary }, template] = await Promise.all([
      buildPlatformContext({ workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, parameters }),
      selectPlatformTemplate(input.workspaceId, platform),
    ]);
    const adapter = getPlatformAdapter(platform);
    const context = adapter.buildContext(built);
    const metadata = { platform, sourceMotherVersion: built.motherContent.version, templateVersion: template.version, parameters };
    const run = await executeStructuredAIRun({ workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, action: "ADAPT_PLATFORM", operation: operations[platform], platformTemplateId: template.id, promptVersion: template.version, inputSummary: { ...inputSummary, platform }, metadata, auditMetadata: { platform, sourceMotherVersion: built.motherContent.version, templateVersion: template.version }, contextTruncated, generate: (provider) => adapter.generate(provider, template, context) }, { runtime });
    results.push({ ...run, platform, sourceMotherVersion: built.motherContent.version, templateVersion: template.version });
  }
  return { runs: results };
}

export async function applyPlatformPreview(input: { workspaceId: string; userId: string; projectId: string; platform: SupportedPlatform; runId: string; expectedVersion: number }) {
  const project = await scopedProject(input);
  if (!project.motherContent) throw new PlatformVariantError("MOTHER_CONTENT_REQUIRED", "请先完成母稿。");
  const run = await db.aIRun.findFirst({ where: { id: input.runId, workspaceId: input.workspaceId, projectId: input.projectId, userId: input.userId, action: "ADAPT_PLATFORM", status: "SUCCEEDED" } });
  if (!run?.outputJson || run.appliedAt || run.discardedAt) throw new PlatformVariantError("PLATFORM_RUN_INVALID", "平台 Preview 不存在或已经处理。");
  const metadata = runMetadata(run.metadata);
  if (metadata.platform !== input.platform) throw new PlatformVariantError("PLATFORM_RUN_INVALID", "平台 Preview 与目标平台不一致。");
  const normalized = getPlatformAdapter(input.platform).normalize(getPlatformAdapter(input.platform).validate(run.outputJson), metadata.parameters);
  const saved = await db.$transaction(async (tx) => {
    const existing = await tx.platformVariant.findUnique({ where: { projectId_platform: { projectId: input.projectId, platform: input.platform } } });
    if ((existing?.version ?? 0) !== input.expectedVersion) throw new PlatformVariantError("PLATFORM_VERSION_CONFLICT", "平台版本已更新，请刷新后重试。");
    const data = { title: normalized.title, body: normalized.body, hook: normalized.hook, summary: normalized.summary, hashtags: json(normalized.hashtags), mediaPlan: json(normalized.mediaPlan), metadata: json(normalized.metadata), status: "READY" as const, sourceMotherVersion: metadata.sourceMotherVersion };
    const variant = existing
      ? await tx.platformVariant.update({ where: { id: existing.id }, data: { ...data, motherContentId: project.motherContent!.id, version: { increment: 1 } } })
      : await tx.platformVariant.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, motherContentId: project.motherContent!.id, platform: input.platform, createdById: input.userId, ...data } });
    await tx.aIRun.update({ where: { id: run.id }, data: { appliedAt: new Date() } });
    await tx.auditLog.createMany({ data: [
      { workspaceId: input.workspaceId, userId: input.userId, action: existing ? "platform_variant.regenerated" : "platform_variant.generated", resourceType: "platform_variant", resourceId: variant.id, metadata: { projectId: input.projectId, platform: input.platform, sourceMotherVersion: metadata.sourceMotherVersion, version: variant.version } },
      { workspaceId: input.workspaceId, userId: input.userId, action: "ai.result_applied", resourceType: "ai_run", resourceId: run.id, metadata: { projectId: input.projectId, target: "platform_variant", platform: input.platform, changedFields: ["title", "body", "hook", "summary", "hashtags", "mediaPlan", "metadata"] } },
    ] });
    return variant;
  });
  return view({ ...saved, platform: saved.platform as SupportedPlatform }, project.motherContent.version);
}

export async function updatePlatformVariant(input: { workspaceId: string; userId: string; projectId: string; platform: SupportedPlatform; expectedVersion: number; data: { title?: string | null; body: string; hook?: string | null; summary?: string | null; hashtags: string[]; mediaPlan?: unknown; metadata?: unknown; status?: "DRAFT" | "READY" | "ARCHIVED" } }) {
  const project = await scopedProject(input);
  const existing = await db.platformVariant.findFirst({ where: { workspaceId: input.workspaceId, projectId: input.projectId, platform: input.platform } });
  if (!existing) throw new PlatformVariantError("PLATFORM_VARIANT_NOT_FOUND", "平台版本尚未生成。");
  if (!input.data.body.trim()) throw new PlatformVariantError("PLATFORM_OUTPUT_INVALID", "平台正文不能为空。");
  if (input.platform !== "WECHAT_MOMENTS" && !input.data.title?.trim()) throw new PlatformVariantError("PLATFORM_OUTPUT_INVALID", "该平台标题不能为空。");
  const changedContent = (input.data.title?.trim() || null) !== existing.title
    || input.data.body !== existing.body
    || (input.data.hook?.trim() || null) !== existing.hook
    || (input.data.summary?.trim() || null) !== existing.summary
    || JSON.stringify(input.data.hashtags) !== JSON.stringify(strings(existing.hashtags))
    || (input.data.mediaPlan !== undefined && JSON.stringify(input.data.mediaPlan) !== JSON.stringify(existing.mediaPlan))
    || (input.data.metadata !== undefined && JSON.stringify(input.data.metadata) !== JSON.stringify(existing.metadata));
  const status = changedContent && (existing.status === "APPROVED" || existing.status === "IN_REVIEW") ? "DRAFT" : input.data.status ?? existing.status;
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.platformVariant.updateMany({ where: { id: existing.id, version: input.expectedVersion }, data: { title: input.data.title?.trim() || null, body: input.data.body, hook: input.data.hook?.trim() || null, summary: input.data.summary?.trim() || null, hashtags: json(input.data.hashtags), ...(input.data.mediaPlan === undefined ? {} : { mediaPlan: json(input.data.mediaPlan) }), ...(input.data.metadata === undefined ? {} : { metadata: json(input.data.metadata) }), status, version: { increment: 1 } } });
    if (updated.count !== 1) throw new PlatformVariantError("PLATFORM_VERSION_CONFLICT", "平台版本已更新，请刷新后重试。");
    const variant = await tx.platformVariant.findUniqueOrThrow({ where: { id: existing.id } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: status === "ARCHIVED" && existing.status !== "ARCHIVED" ? "platform_variant.archived" : "platform_variant.updated", resourceType: "platform_variant", resourceId: existing.id, metadata: { projectId: input.projectId, platform: input.platform, version: variant.version, changedFields: ["title", "body", "hook", "summary", "hashtags", "mediaPlan", "metadata", "status"] } } });
    return variant;
  });
  return view({ ...result, platform: result.platform as SupportedPlatform }, project.motherContent?.version ?? 0);
}

export class PlatformVariantError extends Error {
  constructor(readonly code: "MOTHER_CONTENT_REQUIRED" | "MOTHER_CONFIRMATION_REQUIRED" | "PLATFORM_RUN_IN_PROGRESS" | "PLATFORM_RUN_INVALID" | "PLATFORM_VERSION_CONFLICT" | "PLATFORM_VARIANT_NOT_FOUND" | "PLATFORM_OUTPUT_INVALID", message: string) { super(message); this.name = "PlatformVariantError"; }
}
