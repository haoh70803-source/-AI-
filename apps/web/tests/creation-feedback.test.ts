import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { CreationFeedbackError, getCreationFeedbackContext, upsertCreationFeedback } from "../server/creation-feedback/service";

describe("creation feedback", () => {
  const suffix = randomUUID();
  const ownerId = `creation-feedback-owner-${suffix}`;
  const colleagueId = `creation-feedback-colleague-${suffix}`;
  const outsiderId = `creation-feedback-outsider-${suffix}`;
  let workspaceId = "";
  let outsiderWorkspaceId = "";
  let projectId = "";
  let failedProjectId = "";
  let motherContentId = "";
  let transcriptId = "";
  let analysisId = "";
  const methods: Array<{ assetId: string; versionId: string }> = [];

  async function generation(project: string, status: "SUCCEEDED" | "FAILED", appliedAt: Date | null) {
    return db.aIRun.create({ data: { workspaceId, projectId: project, userId: ownerId, action: "GENERATE_MOTHER_CONTENT", provider: "FIXTURE", model: "fixture", promptVersion: 1, status, inputSummary: {}, outputJson: {}, appliedAt } });
  }

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Creation Feedback Owner", email: `${ownerId}@example.test` }, { id: colleagueId, name: "Creation Feedback Colleague", email: `${colleagueId}@example.test` }, { id: outsiderId, name: "Creation Feedback Outsider", email: `${outsiderId}@example.test` }] });
    const workspace = await db.workspace.create({ data: { name: "Creation Feedback", slug: `creation-feedback-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: colleagueId, role: "EDITOR" }] } } });
    workspaceId = workspace.id;
    const outsiderWorkspace = await db.workspace.create({ data: { name: "Other Feedback", slug: `creation-feedback-other-${suffix}`, members: { create: { userId: outsiderId, role: "OWNER" } } } });
    outsiderWorkspaceId = outsiderWorkspace.id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "反馈依据", status: "READY", transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: "反馈依据", segments: [] } } } });
    transcriptId = (await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id }, select: { id: true } })).id;
    const transcript = await db.transcript.findUniqueOrThrow({ where: { id: transcriptId } });
    analysisId = (await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: ownerId, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } })).id;
    const project = await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "反馈项目", motherContent: { create: { workspaceId, createdById: ownerId, title: "反馈稿", body: "第一版稿件", outline: [], origin: "KIMI" } } } });
    projectId = project.id;
    motherContentId = (await db.motherContent.findUniqueOrThrow({ where: { projectId }, select: { id: true } })).id;
    failedProjectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "失败反馈项目", motherContent: { create: { workspaceId, createdById: ownerId, title: "失败稿", body: "失败稿件", outline: [], origin: "KIMI" } } } })).id;
    await generation(projectId, "SUCCEEDED", new Date("2026-09-01T01:00:00.000Z"));
    await generation(failedProjectId, "FAILED", null);
    for (let index = 0; index < 3; index += 1) {
      const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: ownerId, status: "SAVED" } });
      const version = await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title: `反馈方法 ${index + 1}`, steps: [`步骤 ${index + 1}`], applicableScenarios: ["需要时"], boundaries: ["不要虚构"], sourceItemId: source.id, sourceMaterialAnalysisId: analysisId, sourceTranscriptId: transcriptId, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [], editedById: ownerId } });
      methods.push({ assetId: asset.id, versionId: version.id });
    }
  });

  afterAll(async () => {
    if (workspaceId) await db.creationFeedback.deleteMany({ where: { workspaceId: { in: [workspaceId, outsiderWorkspaceId] } } });
    if (workspaceId) await db.methodAsset.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, outsiderWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, colleagueId, outsiderId] } } });
    await db.$disconnect();
  });

  it("covers zero-method, edited, multi-method, changed, failed, and idempotent feedback", async () => {
    const zero = await getCreationFeedbackContext({ workspaceId, userId: ownerId, projectId });
    expect(zero).toMatchObject({ available: true, methods: [], motherContentVersion: 1 });
    const first = await upsertCreationFeedback({ workspaceId, userId: ownerId, projectId, data: { motherContentVersion: 1, outcome: "DIRECTLY_USED" } });
    expect(first.feedback).toMatchObject({ outcome: "DIRECTLY_USED", methodFeedbacks: [] });

    await db.motherContent.update({ where: { id: motherContentId }, data: { body: "第二版稿件", version: 2 } });
    const secondRun = await generation(projectId, "SUCCEEDED", new Date("2026-09-03T01:00:00.000Z"));
    await db.methodUsage.create({ data: { projectId, methodAssetId: methods[0]!.assetId, methodVersionId: methods[0]!.versionId, aiRunId: secondRun.id, userId: ownerId } });
    const second = await upsertCreationFeedback({ workspaceId, userId: ownerId, projectId, data: { motherContentVersion: 2, outcome: "USED_AFTER_EDIT", methodFeedbacks: [{ methodUsageId: (await db.methodUsage.findFirstOrThrow({ where: { aiRunId: secondRun.id } })).id, rating: "HELPFUL" }] } });
    expect(second.feedback?.methodFeedbacks).toMatchObject([{ methodVersionId: methods[0]!.versionId, rating: "HELPFUL" }]);

    await db.motherContent.update({ where: { id: motherContentId }, data: { body: "第三版稿件", version: 3 } });
    const thirdRun = await generation(projectId, "SUCCEEDED", new Date("2026-09-05T01:00:00.000Z"));
    const usages = await db.methodUsage.createManyAndReturn({ data: methods.map((method) => ({ projectId, methodAssetId: method.assetId, methodVersionId: method.versionId, aiRunId: thirdRun.id, userId: ownerId })), select: { id: true, methodVersionId: true } });
    const third = await upsertCreationFeedback({ workspaceId, userId: ownerId, projectId, data: { motherContentVersion: 3, outcome: "USED_AFTER_EDIT", methodFeedbacks: usages.map((usage, index) => ({ methodUsageId: usage.id, rating: ["HELPFUL", "NEUTRAL", "NOT_SUITABLE"][index] as "HELPFUL" | "NEUTRAL" | "NOT_SUITABLE" })) } });
    expect(third.feedback?.methodFeedbacks).toHaveLength(3);
    const changed = await upsertCreationFeedback({ workspaceId, userId: ownerId, projectId, data: { motherContentVersion: 3, outcome: "NOT_USED" } });
    expect(changed.feedback?.id).toBe(third.feedback?.id);
    await expect(db.methodUsageFeedback.count({ where: { creationFeedbackId: third.feedback!.id } })).resolves.toBe(0);

    const failed = await getCreationFeedbackContext({ workspaceId, userId: ownerId, projectId: failedProjectId });
    expect(failed).toMatchObject({ available: false, feedback: null });
    await expect(upsertCreationFeedback({ workspaceId, userId: ownerId, projectId: failedProjectId, data: { motherContentVersion: 1, outcome: "NOT_USED" } })).rejects.toMatchObject({ code: "FEEDBACK_UNAVAILABLE" });
    const [left, right] = await Promise.all([upsertCreationFeedback({ workspaceId, userId: ownerId, projectId, data: { motherContentVersion: 3, outcome: "DIRECTLY_USED" } }), upsertCreationFeedback({ workspaceId, userId: ownerId, projectId, data: { motherContentVersion: 3, outcome: "DIRECTLY_USED" } })]);
    expect(left.feedback?.id).toBe(right.feedback?.id);
    await expect(db.creationFeedback.count({ where: { userId: ownerId, projectId } })).resolves.toBe(1);
  });

  it("rejects other owners, cross-workspace projects, and Viewer writes", async () => {
    const otherProject = (await db.contentProject.create({ data: { workspaceId, createdById: colleagueId, title: "他人的反馈项目", motherContent: { create: { workspaceId, createdById: colleagueId, title: "他人的稿", body: "正文", outline: [], origin: "KIMI" } } } })).id;
    await expect(getCreationFeedbackContext({ workspaceId, userId: ownerId, projectId: otherProject })).rejects.toBeInstanceOf(CreationFeedbackError);
    const outsideProject = (await db.contentProject.create({ data: { workspaceId: outsiderWorkspaceId, createdById: outsiderId, title: "跨空间项目", motherContent: { create: { workspaceId: outsiderWorkspaceId, createdById: outsiderId, title: "跨空间稿", body: "正文", outline: [], origin: "KIMI" } } } })).id;
    await expect(getCreationFeedbackContext({ workspaceId: outsiderWorkspaceId, userId: ownerId, projectId: outsideProject })).rejects.toMatchObject({ code: "FEEDBACK_PROJECT_NOT_FOUND" });
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, data: { role: "VIEWER" } });
    await expect(upsertCreationFeedback({ workspaceId, userId: ownerId, projectId, data: { motherContentVersion: 3, outcome: "DIRECTLY_USED" } })).rejects.toMatchObject({ code: "FEEDBACK_FORBIDDEN" });
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, data: { role: "OWNER" } });
  });
});
