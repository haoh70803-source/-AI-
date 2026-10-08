import "server-only";

import { db, type Prisma } from "@content-center/db";
import type { LLMRuntime } from "../ai/llm-runtime";
import { executeStructuredAIRun } from "../ai/ai-run-service";
import { renderPrompt, selectPromptTemplate } from "../ai/prompt-service";
import type { SupportedPlatform } from "../../lib/platforms";
import { QualityGate, isPlatformVariantReadyToPublish } from "./quality-gate";
import { aiReviewOutputInstruction, aiReviewOutputSchema, qualityIssuesSchema, type QualityIssue } from "./schemas";

type ReviewInput = { workspaceId: string; userId: string; projectId: string; platform: SupportedPlatform };
type Decision = "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function scoped(input: ReviewInput) {
  const [membership, variant] = await Promise.all([
    db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } } }),
    db.platformVariant.findFirst({
      where: { workspaceId: input.workspaceId, projectId: input.projectId, platform: input.platform },
      include: {
        project: {
          include: {
            motherContent: true,
            creativeBrief: true,
            creatorProfile: true,
            evidenceItems: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
            deepContentPackages: { where: { status: { not: "ARCHIVED" } }, orderBy: { version: "desc" }, take: 1 },
          },
        },
      },
    }),
  ]);
  if (!membership || !variant || !variant.project.motherContent) throw new ReviewServiceError("REVIEW_TARGET_NOT_FOUND", "审核目标不存在或不属于当前 Workspace。");
  return { membership, variant, project: variant.project, motherContent: variant.project.motherContent, deepContentPackage: variant.project.deepContentPackages[0] ?? null };
}

function gateFor(context: Awaited<ReturnType<typeof scoped>>) {
  return new QualityGate().check({
    project: context.project,
    motherContent: context.motherContent,
    platformVariant: context.variant,
    creatorProfile: context.project.creatorProfile,
    evidence: context.project.evidenceItems,
    deepContentPackage: context.deepContentPackage,
  });
}

function requireEditor(role: string) {
  if (role === "VIEWER") throw new ReviewServiceError("REVIEW_FORBIDDEN", "当前角色不能提交或修改审核。");
}

function requireReviewer(role: string) {
  if (role !== "OWNER" && role !== "ADMIN") throw new ReviewServiceError("REVIEW_FORBIDDEN", "只有 OWNER / ADMIN 可以执行人工审核。");
}

function reviewAudit(input: ReviewInput, variantId: string, issueCount: number, result: string) {
  return { projectId: input.projectId, variantId, platform: input.platform, issueCount, result };
}

function parseIssues(value: unknown): QualityIssue[] {
  const parsed = qualityIssuesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

async function latestPending(input: ReviewInput, variantId: string) {
  const pending = await db.reviewRecord.findFirst({ where: { workspaceId: input.workspaceId, projectId: input.projectId, platformVariantId: variantId, result: "PENDING" }, orderBy: { createdAt: "desc" }, include: { aiRun: true } });
  if (!pending) throw new ReviewServiceError("REVIEW_NOT_PENDING", "当前平台内容尚未提交审核。");
  return pending;
}

export async function submitPlatformReview(input: ReviewInput & { expectedVersion: number }) {
  const context = await scoped(input);
  requireEditor(context.membership.role);
  if (context.variant.status !== "READY" && context.variant.status !== "DRAFT") throw new ReviewServiceError("REVIEW_INVALID_STATE", "只有草稿或已就绪的平台内容可以提交审核。");
  const needsTitle = context.variant.platform === "XIAOHONGSHU" || context.variant.platform === "WECHAT_CHANNELS" || context.variant.platform === "WECHAT_OFFICIAL";
  if (!context.variant.body.trim() || (needsTitle && !context.variant.title?.trim())) throw new ReviewServiceError("REVIEW_SUBMISSION_INCOMPLETE", "请先补齐正文和该平台必需的标题。");
  const quality = gateFor(context);
  const record = await db.$transaction(async (tx) => {
    const changed = await tx.platformVariant.updateMany({ where: { id: context.variant.id, version: input.expectedVersion, status: context.variant.status }, data: { status: "IN_REVIEW", version: { increment: 1 } } });
    if (changed.count !== 1) throw new ReviewServiceError("REVIEW_VERSION_CONFLICT", "平台内容已变化，请刷新后重新提交。");
    const created = await tx.reviewRecord.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, platformVariantId: context.variant.id, reviewerId: input.userId, result: "PENDING", issues: json(quality.issues), aiReviewed: false } });
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "review.submitted", resourceType: "review_record", resourceId: created.id, metadata: reviewAudit(input, context.variant.id, quality.issues.length, "PENDING") } });
    return created;
  });
  return { review: record, quality, variant: { id: context.variant.id, status: "IN_REVIEW" as const, version: context.variant.version + 1 } };
}

export async function runPlatformAIReview(input: ReviewInput, dependencies: { runtime?: LLMRuntime } = {}) {
  const context = await scoped(input);
  requireReviewer(context.membership.role);
  if (context.variant.status !== "IN_REVIEW") throw new ReviewServiceError("REVIEW_INVALID_STATE", "只有待审核内容可以运行 AI 检查。");
  const pending = await latestPending(input, context.variant.id);
  const template = await selectPromptTemplate(input.workspaceId, "REVIEW_PLATFORM_CONTENT");
  const evidencePackage = object(context.deepContentPackage?.evidencePackage);
  const deepItems = Array.isArray(evidencePackage?.items) ? evidencePackage.items.map(object).filter(Boolean).filter((item) => item?.classification === "NEEDS_VERIFICATION").map((item) => ({ classification: item?.classification, content: item?.content })) : [];
  const reviewContext = {
    platformVariant: { platform: context.variant.platform, title: context.variant.title, hook: context.variant.hook, body: context.variant.body, summary: context.variant.summary, hashtags: strings(context.variant.hashtags), metadata: context.variant.metadata },
    motherContent: { title: context.motherContent.title, body: context.motherContent.body, version: context.motherContent.version, origin: context.motherContent.origin },
    creativeBrief: context.project.creativeBrief ? { topic: context.project.creativeBrief.topic, angle: context.project.creativeBrief.angle, audience: context.project.creativeBrief.audience, coreMessage: context.project.creativeBrief.coreMessage, tone: context.project.creativeBrief.tone, risks: context.project.creativeBrief.risks } : null,
    creatorProfile: context.project.creatorProfile ? { displayName: context.project.creatorProfile.displayName, positioning: context.project.creatorProfile.positioning, targetAudience: context.project.creatorProfile.targetAudience, tone: context.project.creatorProfile.tone, preferredStyle: context.project.creatorProfile.preferredStyle, forbiddenStyle: context.project.creatorProfile.forbiddenStyle, forbiddenTerms: context.project.creatorProfile.forbiddenTerms, personalViews: context.project.creatorProfile.personalViews } : null,
    evidence: context.project.evidenceItems.map((item) => ({ type: item.type, claim: item.claim, excerpt: item.excerpt, note: item.note })),
    deepContentRisk: context.deepContentPackage ? { risks: context.deepContentPackage.risks, needsConfirmation: context.deepContentPackage.needsConfirmation, needsVerification: deepItems } : null,
  };
  const prompt = `${renderPrompt(template.template, reviewContext)}${aiReviewOutputInstruction}`;
  const run = await executeStructuredAIRun({
    workspaceId: input.workspaceId,
    userId: input.userId,
    projectId: input.projectId,
    action: "REVIEW_PLATFORM_CONTENT",
    operation: "REVIEW_PLATFORM_CONTENT",
    promptTemplateId: template.id,
    promptVersion: template.version,
    inputSummary: { platform: input.platform, evidenceCount: context.project.evidenceItems.length, hasCreatorProfile: Boolean(context.project.creatorProfile), hasDeepContentPackage: Boolean(context.deepContentPackage) },
    auditMetadata: { variantId: context.variant.id, platform: input.platform },
    contextTruncated: false,
    generate: (provider) => provider.generateStructured({ systemPrompt: template.systemPrompt, prompt }, aiReviewOutputSchema),
  }, dependencies);
  const ruleIssues = gateFor(context).issues;
  const aiIssues: QualityIssue[] = run.output.issues.map((item) => ({ ...item, source: "AI" }));
  const combined = [...ruleIssues, ...aiIssues];
  await db.$transaction([
    db.reviewRecord.update({ where: { id: pending.id }, data: { issues: json(combined), aiReviewed: true, aiRunId: run.id } }),
    db.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "review.ai_checked", resourceType: "review_record", resourceId: pending.id, metadata: reviewAudit(input, context.variant.id, combined.length, "PENDING") } }),
  ]);
  return { runId: run.id, summary: run.output.summary, suggestions: run.output.suggestions, issues: combined, status: context.variant.status };
}

async function decide(input: ReviewInput & { result: Decision; comment?: string; confirmWarnings?: boolean }) {
  const context = await scoped(input);
  requireReviewer(context.membership.role);
  if (context.variant.status !== "IN_REVIEW") throw new ReviewServiceError("REVIEW_INVALID_STATE", "当前平台内容不在待审核状态。");
  if (input.result === "CHANGES_REQUESTED" && (input.comment?.trim().length ?? 0) < 2) throw new ReviewServiceError("REVIEW_COMMENT_REQUIRED", "退回修改必须填写至少 2 个字符的备注。");
  const pending = await latestPending(input, context.variant.id);
  const quality = gateFor(context);
  const aiIssues = parseIssues(pending.issues).filter(({ source }) => source === "AI");
  const issues = [...quality.issues, ...aiIssues];
  if (input.result === "APPROVED") {
    if (issues.some(({ severity }) => severity === "ERROR")) throw new ReviewServiceError("REVIEW_ERRORS_BLOCK_APPROVAL", "存在 ERROR，不能批准。");
    if (issues.some(({ severity }) => severity === "WARNING") && !input.confirmWarnings) throw new ReviewServiceError("REVIEW_WARNING_CONFIRMATION_REQUIRED", "请确认已知风险后再批准。");
  }
  const nextStatus = input.result === "APPROVED" ? "APPROVED" : "DRAFT";
  const record = await db.$transaction(async (tx) => {
    const changed = await tx.platformVariant.updateMany({ where: { id: context.variant.id, status: "IN_REVIEW" }, data: { status: nextStatus, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ReviewServiceError("REVIEW_INVALID_STATE", "审核状态已变化，请刷新后重试。");
    const created = await tx.reviewRecord.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, platformVariantId: context.variant.id, reviewerId: input.userId, result: input.result, issues: json(issues), comment: input.comment?.trim() || null, aiReviewed: pending.aiReviewed, aiRunId: pending.aiRunId } });
    const action = input.result === "APPROVED" ? "review.approved" : input.result === "REJECTED" ? "review.rejected" : "review.changes_requested";
    await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action, resourceType: "review_record", resourceId: created.id, metadata: reviewAudit(input, context.variant.id, issues.length, input.result) } });
    return created;
  });
  return { review: record, quality: { passed: !issues.some(({ severity }) => severity === "ERROR"), issues }, variant: { id: context.variant.id, status: nextStatus, version: context.variant.version + 1 } };
}

export function approvePlatformVariant(input: ReviewInput & { comment?: string; confirmWarnings?: boolean }) {
  return decide({ ...input, result: "APPROVED" });
}

export function requestPlatformChanges(input: ReviewInput & { comment: string }) {
  return decide({ ...input, result: "CHANGES_REQUESTED" });
}

export function rejectPlatformVariant(input: ReviewInput & { comment?: string }) {
  return decide({ ...input, result: "REJECTED" });
}

export async function getPlatformReview(input: ReviewInput) {
  const context = await scoped(input);
  const [records, quality] = await Promise.all([
    db.reviewRecord.findMany({ where: { workspaceId: input.workspaceId, projectId: input.projectId, platformVariantId: context.variant.id }, orderBy: { createdAt: "desc" }, include: { reviewer: { select: { id: true, name: true } }, aiRun: { select: { id: true, outputJson: true } } } }),
    Promise.resolve(gateFor(context)),
  ]);
  return {
    project: { id: context.project.id, title: context.project.title },
    variant: { id: context.variant.id, platform: context.variant.platform as SupportedPlatform, version: context.variant.version, title: context.variant.title, hook: context.variant.hook, body: context.variant.body, summary: context.variant.summary, hashtags: strings(context.variant.hashtags), metadata: context.variant.metadata, status: context.variant.status, sourceMotherVersion: context.variant.sourceMotherVersion },
    motherContent: { title: context.motherContent.title, version: context.motherContent.version, origin: context.motherContent.origin },
    deepContentPackage: context.deepContentPackage ? { version: context.deepContentPackage.version, status: context.deepContentPackage.status } : null,
    evidenceCount: context.project.evidenceItems.length,
    quality,
    records: records.map((record) => ({ id: record.id, result: record.result, issues: parseIssues(record.issues), comment: record.comment, aiReviewed: record.aiReviewed, aiRunId: record.aiRunId, aiOutput: record.aiRun?.outputJson ?? null, reviewer: record.reviewer, createdAt: record.createdAt, updatedAt: record.updatedAt })),
    canReview: context.membership.role === "OWNER" || context.membership.role === "ADMIN",
    canPublish: context.membership.role !== "VIEWER",
    readyToPublish: isPlatformVariantReadyToPublish({ status: context.variant.status, sourceMotherVersion: context.variant.sourceMotherVersion, motherVersion: context.motherContent.version }),
    isStale: context.variant.sourceMotherVersion < context.motherContent.version,
  };
}

export class ReviewServiceError extends Error {
  constructor(readonly code: "REVIEW_TARGET_NOT_FOUND" | "REVIEW_FORBIDDEN" | "REVIEW_NOT_PENDING" | "REVIEW_INVALID_STATE" | "REVIEW_VERSION_CONFLICT" | "REVIEW_SUBMISSION_INCOMPLETE" | "REVIEW_COMMENT_REQUIRED" | "REVIEW_ERRORS_BLOCK_APPROVAL" | "REVIEW_WARNING_CONFIRMATION_REQUIRED", message: string) {
    super(message);
    this.name = "ReviewServiceError";
  }
}
