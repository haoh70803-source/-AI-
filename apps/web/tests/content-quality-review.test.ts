import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { updatePlatformVariant } from "../server/platforms/platform-variant-service";
import { getDashboardCounts } from "../server/dashboard";
import { isPlatformVariantReadyToPublish, QualityGate } from "../server/reviews/quality-gate";
import { approvePlatformVariant, getPlatformReview, rejectPlatformVariant, requestPlatformChanges, runPlatformAIReview, submitPlatformReview } from "../server/reviews/review-service";

describe("content quality review workflow", () => {
  const suffix = randomUUID();
  const ownerId = `review-owner-${suffix}`;
  const adminId = `review-admin-${suffix}`;
  const editorId = `review-editor-${suffix}`;
  const outsiderId = `review-outsider-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";
  let variantId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: ownerId, name: "Review Owner", email: `${ownerId}@example.test` },
      { id: adminId, name: "Review Admin", email: `${adminId}@example.test` },
      { id: editorId, name: "Review Editor", email: `${editorId}@example.test` },
      { id: outsiderId, name: "Review Outsider", email: `${outsiderId}@example.test` },
    ] });
    const workspace = await db.workspace.create({ data: { name: "Review Workspace", slug: `review-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: adminId, role: "ADMIN" }, { userId: editorId, role: "EDITOR" }] } } });
    const other = await db.workspace.create({ data: { name: "Other Review Workspace", slug: `other-review-${suffix}`, members: { create: { userId: outsiderId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
  });

  beforeEach(async () => {
    await db.contentProject.deleteMany({ where: { workspaceId } });
    const profile = await db.creatorProfile.upsert({
      where: { workspaceId_userId: { workspaceId, userId: ownerId } },
      update: { forbiddenTerms: ["保证成功"] },
      create: { workspaceId, userId: ownerId, displayName: "Review Creator", positioning: "可靠内容", targetAudience: "内容团队", tone: "直接", preferredStyle: "具体", forbiddenStyle: "机械 AI 腔", coreTopics: [], personalViews: ["证据优先"], brandTerms: [], forbiddenTerms: ["保证成功"], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [] },
    });
    const project = await db.contentProject.create({ data: {
      workspaceId, createdById: ownerId, creatorProfileId: profile.id, title: "Quality Review Project",
      motherContent: { create: { workspaceId, createdById: ownerId, title: "可靠创作", body: "可靠创作需要证据支持。", outline: [], origin: "GPT_WEB" } },
      creativeBrief: { create: { workspaceId, createdById: ownerId, topic: "可靠创作", angle: "证据优先", audience: "内容团队", coreMessage: "证据支持表达", keyPoints: [], structure: [], tone: "直接", risks: [] } },
      evidenceItems: { create: { workspaceId, createdById: ownerId, type: "DATA", claim: "转化率为 20%", excerpt: "正式数据 20%" } },
    } });
    projectId = project.id;
    const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    const variant = await db.platformVariant.create({ data: { workspaceId, projectId, motherContentId: mother.id, platform: "DOUYIN", title: "可靠创作方法", hook: "先看证据", body: "可靠创作需要证据支持。", hashtags: ["内容方法"], mediaPlan: {}, metadata: {}, status: "READY", sourceMotherVersion: 1, createdById: ownerId } });
    variantId = variant.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, adminId, editorId, outsiderId] } } });
    await db.$disconnect();
  });

  it("runs deterministic platform, placeholder, hashtag, risk, fact, Deep Package, and Creator rules", () => {
    const result = new QualityGate().check({
      project: { id: "project" },
      motherContent: { title: "母稿", body: "母稿正文", origin: "GPT_WEB" },
      platformVariant: { platform: "DOUYIN", title: "第一方法", hook: "", body: "TODO 保证成功，2027 年达到 99%。[待确认] 未核实案例", hashtags: ["AI", "#ai", ""], metadata: {} },
      creatorProfile: { forbiddenTerms: ["保证成功"] },
      evidence: [],
      deepContentPackage: { evidencePackage: { items: [{ classification: "NEEDS_VERIFICATION", content: "未核实案例" }, { classification: "AI_SUGGESTION", content: "2027 年达到 99%" }] } },
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["MISSING_HOOK", "TODO_PLACEHOLDER", "CONFIRMATION_PLACEHOLDER", "DUPLICATE_HASHTAG", "EMPTY_HASHTAG", "HIGH_RISK_PROMISE", "POSSIBLE_NEW_FACT", "UNVERIFIED_FACT", "USES_UNVERIFIED_MATERIAL", "CREATOR_FORBIDDEN_TERM"]));
    expect(result.issues.find(({ code }) => code === "CONFIRMATION_PLACEHOLDER")?.severity).toBe("WARNING");
  });

  it("blocks approval on ERROR and leaves AI out of submission", async () => {
    await db.platformVariant.update({ where: { id: variantId }, data: { hook: null } });
    const submitted = await submitPlatformReview({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN", expectedVersion: 1 });
    expect(submitted.quality.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_HOOK", severity: "ERROR" })]));
    expect(submitted.review.aiReviewed).toBe(false);
    await expect(getDashboardCounts(workspaceId)).resolves.toMatchObject({ pendingReview: 1 });
    await expect(approvePlatformVariant({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" })).rejects.toMatchObject({ code: "REVIEW_ERRORS_BLOCK_APPROVAL" });
    await expect(db.aIRun.count({ where: { projectId, action: "REVIEW_PLATFORM_CONTENT" } })).resolves.toBe(0);
  });

  it("allows OWNER and ADMIN to approve warnings only after explicit confirmation", async () => {
    await db.platformVariant.update({ where: { id: variantId }, data: { body: "可靠创作保证结果。" } });
    await submitPlatformReview({ workspaceId, userId: editorId, projectId, platform: "DOUYIN", expectedVersion: 1 });
    await expect(approvePlatformVariant({ workspaceId, userId: editorId, projectId, platform: "DOUYIN", confirmWarnings: true })).rejects.toMatchObject({ code: "REVIEW_FORBIDDEN" });
    await expect(approvePlatformVariant({ workspaceId, userId: adminId, projectId, platform: "DOUYIN" })).rejects.toMatchObject({ code: "REVIEW_WARNING_CONFIRMATION_REQUIRED" });
    const approved = await approvePlatformVariant({ workspaceId, userId: adminId, projectId, platform: "DOUYIN", confirmWarnings: true, comment: "已人工核对" });
    expect(approved.variant.status).toBe("APPROVED");
    await expect(db.reviewRecord.findMany({ where: { platformVariantId: variantId }, orderBy: { createdAt: "asc" } })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ result: "PENDING" }), expect.objectContaining({ result: "APPROVED", reviewerId: adminId })]));
  });

  it("validates structured Workspace LLM review without allowing AI to approve", async () => {
    const secretSource = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", rawText: "SECRET_TRANSCRIPT_MUST_NOT_BE_SENT" } });
    await db.projectSource.create({ data: { projectId, sourceItemId: secretSource.id } });
    await submitPlatformReview({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN", expectedVersion: 1 });
    const runtime = { provider: new MockLLMProvider(({ prompt }) => {
      expect(prompt).toContain("Action: REVIEW_PLATFORM_CONTENT");
      expect(prompt).not.toContain("SECRET_TRANSCRIPT_MUST_NOT_BE_SENT");
      return { summary: "整体可读，建议减少模板感。", issues: [{ code: "TONE_TOO_GENERIC", severity: "WARNING", message: "表达偏模板化。", field: "body", suggestion: "增加个人判断。" }], suggestions: ["强化第二段观点"] };
    }), providerName: "DEEPSEEK", model: "deepseek-v4-pro", requestedModel: "deepseek-v4-pro", mode: "REAL" as const };
    const reviewed = await runPlatformAIReview({ workspaceId, userId: adminId, projectId, platform: "DOUYIN" }, { runtime });
    expect(reviewed.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "TONE_TOO_GENERIC", source: "AI" })]));
    await expect(db.platformVariant.findUniqueOrThrow({ where: { id: variantId } })).resolves.toMatchObject({ status: "IN_REVIEW" });
    await expect(db.aIRun.findUniqueOrThrow({ where: { id: reviewed.runId } })).resolves.toMatchObject({
      provider: "DEEPSEEK",
      model: "deepseek-v4-pro",
      metadata: expect.objectContaining({ provider: "DEEPSEEK", requestedModel: "deepseek-v4-pro", actualModel: "mock-llm", providerMode: "REAL" }),
    });
    await expect(db.apiUsage.findFirst({ where: { workspaceId, operation: "REVIEW_PLATFORM_CONTENT" } })).resolves.toMatchObject({
      provider: "DEEPSEEK",
      cost: null,
      metadata: expect.objectContaining({ provider: "DEEPSEEK", requestedModel: "deepseek-v4-pro", actualModel: "mock-llm", providerMode: "REAL" }),
    });
    const review = await getPlatformReview({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" });
    expect(review.records[0]).toMatchObject({ result: "PENDING", aiReviewed: true, aiRunId: reviewed.runId });
  });

  it("records request changes and rejection history", async () => {
    await submitPlatformReview({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN", expectedVersion: 1 });
    await expect(requestPlatformChanges({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN", comment: "x" })).rejects.toMatchObject({ code: "REVIEW_COMMENT_REQUIRED" });
    await requestPlatformChanges({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN", comment: "请加强开头" });
    await db.platformVariant.update({ where: { id: variantId }, data: { status: "READY" } });
    const current = await db.platformVariant.findUniqueOrThrow({ where: { id: variantId } });
    await submitPlatformReview({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN", expectedVersion: current.version });
    await rejectPlatformVariant({ workspaceId, userId: adminId, projectId, platform: "DOUYIN", comment: "方向不符" });
    const history = await getPlatformReview({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" });
    expect(history.records.map(({ result }) => result).filter((result) => result !== "PENDING")).toEqual(["REJECTED", "CHANGES_REQUESTED"]);
  });

  it("resets approved content to DRAFT when edited and blocks stale approval from ready-to-publish", async () => {
    await submitPlatformReview({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN", expectedVersion: 1 });
    const approved = await approvePlatformVariant({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" });
    const edited = await updatePlatformVariant({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN", expectedVersion: approved.variant.version, data: { title: "可靠创作方法", hook: "先看证据", body: "修改后的正式正文。", hashtags: ["内容方法"], metadata: {} } });
    expect(edited.status).toBe("DRAFT");
    expect(isPlatformVariantReadyToPublish({ status: "APPROVED", sourceMotherVersion: 1, motherVersion: 2 })).toBe(false);
    expect(isPlatformVariantReadyToPublish({ status: "APPROVED", sourceMotherVersion: 2, motherVersion: 2 })).toBe(true);
  });

  it("enforces Workspace and project isolation", async () => {
    await expect(getPlatformReview({ workspaceId: otherWorkspaceId, userId: outsiderId, projectId, platform: "DOUYIN" })).rejects.toMatchObject({ code: "REVIEW_TARGET_NOT_FOUND" });
    await expect(getPlatformReview({ workspaceId, userId: outsiderId, projectId, platform: "DOUYIN" })).rejects.toMatchObject({ code: "REVIEW_TARGET_NOT_FOUND" });
  });
});
