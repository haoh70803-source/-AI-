import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { getDashboardCounts } from "../server/dashboard";
import { buildPublishPackage } from "../server/publishing/publish-package";
import { cancelPublishTask, createPublishTask, getPublishTask, listPublishTasks, markPublishTaskPublished, schedulePublishTask } from "../server/publishing/publish-task-service";

describe("publishing center", () => {
  const suffix = randomUUID();
  const ownerId = `publish-owner-${suffix}`;
  const editorId = `publish-editor-${suffix}`;
  const viewerId = `publish-viewer-${suffix}`;
  const outsiderId = `publish-outsider-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";
  let variantId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: ownerId, name: "Publish Owner", email: `${ownerId}@example.test` },
      { id: editorId, name: "Publish Editor", email: `${editorId}@example.test` },
      { id: viewerId, name: "Publish Viewer", email: `${viewerId}@example.test` },
      { id: outsiderId, name: "Publish Outsider", email: `${outsiderId}@example.test` },
    ] });
    const workspace = await db.workspace.create({ data: { name: "Publish Workspace", slug: `publish-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: editorId, role: "EDITOR" }, { userId: viewerId, role: "VIEWER" }] } } });
    const other = await db.workspace.create({ data: { name: "Other Publish Workspace", slug: `other-publish-${suffix}`, members: { create: { userId: outsiderId, role: "OWNER" } } } });
    workspaceId = workspace.id; otherWorkspaceId = other.id;
  });

  beforeEach(async () => {
    await db.contentProject.deleteMany({ where: { workspaceId } });
    const profile = await db.creatorProfile.upsert({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, update: {}, create: { workspaceId, userId: ownerId, displayName: "发布创作者", positioning: "内容方法", targetAudience: "创作者", tone: "直接", preferredStyle: "具体", forbiddenStyle: "", coreTopics: [], personalViews: [], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [] } });
    const project = await db.contentProject.create({ data: { workspaceId, createdById: ownerId, creatorProfileId: profile.id, title: "GPT 创作发布项目", motherContent: { create: { workspaceId, createdById: ownerId, title: "GPT 母稿", body: "这是一份通过人工审核的可靠母稿。", outline: ["观点", "方法"], origin: "GPT_WEB" } } } });
    projectId = project.id;
    const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    const variant = await db.platformVariant.create({ data: { workspaceId, projectId, motherContentId: mother.id, platform: "DOUYIN", title: "可靠内容方法", hook: "先看一个关键判断", body: "这是一份通过人工审核的可靠母稿。", summary: "人工审核后发布", hashtags: ["内容方法"], mediaPlan: { shots: ["正面口播"] }, metadata: { duration: "60 秒" }, status: "APPROVED", sourceMotherVersion: 1, createdById: ownerId } });
    variantId = variant.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, editorId, viewerId, outsiderId] } } });
    await db.$disconnect();
  });

  it("creates only from APPROVED, current, QualityGate-passing variants", async () => {
    await db.platformVariant.update({ where: { id: variantId }, data: { status: "READY" } });
    await expect(createPublishTask({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" })).rejects.toMatchObject({ code: "VARIANT_NOT_APPROVED" });
    await db.platformVariant.update({ where: { id: variantId }, data: { status: "APPROVED", hook: null } });
    await expect(createPublishTask({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" })).rejects.toMatchObject({ code: "QUALITY_GATE_BLOCKED" });
    await db.platformVariant.update({ where: { id: variantId }, data: { hook: "可靠开头" } });
    await db.motherContent.update({ where: { projectId }, data: { version: 2 } });
    await expect(createPublishTask({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" })).rejects.toMatchObject({ code: "VARIANT_STALE" });
  });

  it("freezes the snapshot and reports later variant changes without mutating the package", async () => {
    const now = new Date("2026-09-01T04:00:00.000Z");
    const created = await createPublishTask({ workspaceId, userId: editorId, projectId, platform: "DOUYIN" }, { now: () => now });
    const original = await getPublishTask({ workspaceId, userId: ownerId }, created.id);
    expect(original.snapshot).toMatchObject({ variantVersion: 1, motherVersion: 1, body: "这是一份通过人工审核的可靠母稿。", createdAt: now.toISOString() });
    await db.platformVariant.update({ where: { id: variantId }, data: { body: "后来修改的内容", version: { increment: 1 }, status: "DRAFT" } });
    const unchanged = await getPublishTask({ workspaceId, userId: ownerId }, created.id);
    expect(unchanged.contentChanged).toBe(true);
    expect(unchanged.snapshot.body).toBe("这是一份通过人工审核的可靠母稿。");
    expect(unchanged.package.fullText).not.toContain("后来修改的内容");
  });

  it("enforces Workspace isolation and VIEWER read-only access", async () => {
    const task = await createPublishTask({ workspaceId, userId: editorId, projectId, platform: "DOUYIN" });
    await expect(getPublishTask({ workspaceId, userId: viewerId }, task.id)).resolves.toMatchObject({ id: task.id });
    await expect(createPublishTask({ workspaceId, userId: viewerId, projectId, platform: "DOUYIN" })).rejects.toMatchObject({ code: "PUBLISH_FORBIDDEN" });
    await expect(schedulePublishTask({ workspaceId, userId: viewerId, taskId: task.id, scheduledAt: new Date("2026-09-02T02:00:00Z") })).rejects.toMatchObject({ code: "PUBLISH_FORBIDDEN" });
    await expect(getPublishTask({ workspaceId: otherWorkspaceId, userId: outsiderId }, task.id)).rejects.toMatchObject({ code: "PUBLISH_TASK_NOT_FOUND" });
    await expect(listPublishTasks({ workspaceId: otherWorkspaceId, userId: outsiderId })).resolves.toHaveLength(0);
  });

  it("schedules, reschedules, cancels, and audits deterministic task transitions", async () => {
    const created = await createPublishTask({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" });
    expect(created.status).toBe("READY_TO_PUBLISH");
    await schedulePublishTask({ workspaceId, userId: editorId, taskId: created.id, scheduledAt: new Date("2026-09-02T02:00:00Z") });
    const rescheduled = await schedulePublishTask({ workspaceId, userId: editorId, taskId: created.id, scheduledAt: new Date("2026-09-03T03:00:00Z") });
    expect(rescheduled).toMatchObject({ status: "SCHEDULED", scheduledAt: new Date("2026-09-03T03:00:00Z") });
    const cancelled = await cancelPublishTask({ workspaceId, userId: ownerId, taskId: created.id, note: "本次不发" });
    expect(cancelled).toMatchObject({ status: "CANCELLED", note: "本次不发" });
    const actions = await db.auditLog.findMany({ where: { resourceId: created.id }, select: { action: true, metadata: true } });
    expect(actions.map(({ action }) => action)).toEqual(expect.arrayContaining(["publish_task.created", "publish_task.scheduled", "publish_task.rescheduled", "publish_task.cancelled"]));
    expect(JSON.stringify(actions)).not.toContain("这是一份通过人工审核");
  });

  it("marks a task published manually and drives the real Dashboard pending count", async () => {
    const scheduledAt = new Date("2026-09-02T02:00:00Z");
    const task = await createPublishTask({ workspaceId, userId: editorId, projectId, platform: "DOUYIN", scheduledAt });
    await expect(getDashboardCounts(workspaceId)).resolves.toMatchObject({ pendingPublish: 1 });
    const published = await markPublishTaskPublished({ workspaceId, userId: editorId, taskId: task.id, publishedAt: new Date("2026-09-02T02:05:00Z"), externalUrl: "https://example.com/post/1", note: "人工发布完成" });
    expect(published).toMatchObject({ status: "PUBLISHED", publisherId: editorId, externalUrl: "https://example.com/post/1" });
    await expect(getDashboardCounts(workspaceId)).resolves.toMatchObject({ pendingPublish: 0 });
    await expect(markPublishTaskPublished({ workspaceId, userId: ownerId, taskId: task.id })).rejects.toMatchObject({ code: "PUBLISH_TASK_FINAL" });
  });

  it("builds a GPT_WEB-derived publish package without LLM or ApiUsage", async () => {
    const beforeRuns = await db.aIRun.count({ where: { projectId } });
    const beforeUsage = await db.apiUsage.count({ where: { workspaceId } });
    const task = await createPublishTask({ workspaceId, userId: ownerId, projectId, platform: "DOUYIN" });
    const detail = await getPublishTask({ workspaceId, userId: ownerId }, task.id);
    expect(detail.package.sections.map(({ label }) => label)).toEqual(expect.arrayContaining(["标题", "开场 Hook", "口播脚本", "Hashtags", "时长建议", "拍摄建议"]));
    expect(detail.package.fullText).toContain("这是一份通过人工审核的可靠母稿。");
    expect(await db.aIRun.count({ where: { projectId } })).toBe(beforeRuns);
    expect(await db.apiUsage.count({ where: { workspaceId } })).toBe(beforeUsage);
  });

  it("formats all five platform packages deterministically", () => {
    const base = { variantVersion: 1, motherVersion: 1, title: "标题", hook: "开头", body: "正文", summary: "摘要", hashtags: ["标签"], metadata: { coverTitles: ["封面一"], outline: ["第一节"] }, mediaPlan: { images: ["配图一"] }, createdAt: "2026-09-01T00:00:00.000Z" };
    expect(buildPublishPackage({ ...base, platform: "DOUYIN" }).sections.map(({ label }) => label)).toContain("口播脚本");
    expect(buildPublishPackage({ ...base, platform: "XIAOHONGSHU" }).sections.map(({ label }) => label)).toContain("封面标题候选");
    expect(buildPublishPackage({ ...base, platform: "WECHAT_MOMENTS" }).sections.map(({ label }) => label)).toContain("朋友圈成稿");
    expect(buildPublishPackage({ ...base, platform: "WECHAT_CHANNELS" }).sections.map(({ label }) => label)).toContain("视频简介");
    expect(buildPublishPackage({ ...base, platform: "WECHAT_OFFICIAL" }).sections.map(({ label }) => label)).toContain("文章大纲");
  });
});
