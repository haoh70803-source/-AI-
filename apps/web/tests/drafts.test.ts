import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { createProject } from "../server/project-service";
import { saveMotherContent } from "../server/mother-content-service";
import { checkpointDraftBranch, confirmDraftRevision, createDraftBranch, createDraftRevision, getDraftBranch, getDraftHistory, getPrimaryDraft, listDraftBranches, renameDraftBranch, saveDraftWorkingState, setPrimaryDraftBranch, softDeleteDraftBranch } from "../server/drafts/service";
import { listPlatformVariants } from "../server/platforms/platform-variant-service";

describe("Phase 9C-2 draft branches and immutable revisions", () => {
  const suffix = randomUUID();
  const ownerId = `draft-owner-${suffix}`;
  const editorId = `draft-editor-${suffix}`;
  const viewerId = `draft-viewer-${suffix}`;
  let workspaceId = "";
  let projectId = "";
  let primaryId = "";
  let copiedId = "";
  let emptyId = "";
  let motherId = "";
  let feedbackId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: ownerId, name: "Draft Owner", email: `${ownerId}@example.test` },
      { id: editorId, name: "Draft Editor", email: `${editorId}@example.test` },
      { id: viewerId, name: "Draft Viewer", email: `${viewerId}@example.test` },
    ] });
    const workspace = await db.workspace.create({ data: { name: "Draft Workspace", slug: `draft-${suffix}`, members: { create: [
      { userId: ownerId, role: "OWNER" },
      { userId: editorId, role: "EDITOR" },
      { userId: viewerId, role: "VIEWER" },
    ] } } });
    workspaceId = workspace.id;
    const project = await createProject({ workspaceId, userId: ownerId, title: "多稿件项目" });
    projectId = project.id;
    primaryId = project.primaryDraftBranchId;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, editorId, viewerId] } } });
    await db.$disconnect();
  });

  it("creates one primary branch for a new project without inventing a revision", async () => {
    const branches = await listDraftBranches({ workspaceId, userId: viewerId, projectId });
    expect(branches).toHaveLength(1);
    expect(branches[0]).toMatchObject({ id: primaryId, title: "主稿", isPrimary: true, version: 0, currentRevision: null });
    await expect(db.motherContent.findUnique({ where: { projectId } })).resolves.toBeNull();
  });

  it("allows an Editor to create revision 1 and projects it to MotherContent", async () => {
    const saved = await createDraftRevision({ workspaceId, userId: editorId, projectId, branchId: primaryId, expectedVersion: 0, title: "老板观点版", body: "第一版真实正文", outline: ["开场", "观点"] });
    expect(saved.revision).toMatchObject({ revision: 1, body: "第一版真实正文", current: true });
    expect(saved.branch).toMatchObject({ version: 1, isPrimary: true, currentRevisionId: saved.revision!.id });
    expect(saved.legacyContent).toMatchObject({ title: "老板观点版", body: "第一版真实正文", version: 1 });
    motherId = saved.legacyContent!.id;
  });

  it("creates immutable sequential revisions and rejects stale expectedVersion", async () => {
    const first = (await getPrimaryDraft({ workspaceId, userId: editorId, projectId })).currentRevision!;
    const saved = await createDraftRevision({ workspaceId, userId: editorId, projectId, branchId: primaryId, expectedVersion: 1, title: "老板观点版", body: "第二版真实正文", outline: ["开场", "观点", "结尾"] });
    expect(saved.revision!.revision).toBe(2);
    await expect(db.draftRevision.findUniqueOrThrow({ where: { id: first.id } })).resolves.toMatchObject({ body: "第一版真实正文", revision: 1 });
    await expect(createDraftRevision({ workspaceId, userId: editorId, projectId, branchId: primaryId, expectedVersion: 1, title: "过期写入", body: "不能覆盖", outline: [] })).rejects.toMatchObject({ code: "DRAFT_VERSION_CONFLICT" });
  });

  it("autosaves working state without creating revisions or advancing MotherContent version", async () => {
    const before = await getPrimaryDraft({ workspaceId, userId: editorId, projectId });
    const motherBefore = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    const firstSave = await saveDraftWorkingState({ workspaceId, userId: editorId, projectId, branchId: primaryId, expectedVersion: before.version, title: "老板观点版", body: "第二版真实正文（编辑中一）", outline: ["开场", "观点", "结尾"] });
    const secondSave = await saveDraftWorkingState({ workspaceId, userId: editorId, projectId, branchId: primaryId, expectedVersion: firstSave.branch.version, title: "老板观点版", body: "第二版真实正文（编辑中二）", outline: ["开场", "观点", "结尾"] });
    expect(secondSave.branch.currentRevisionId).toBe(before.currentRevisionId);
    expect(secondSave.branch.workingState.body).toBe("第二版真实正文（编辑中二）");
    expect(await db.draftRevision.count({ where: { draftBranchId: primaryId } })).toBe(2);
    await expect(db.motherContent.findUniqueOrThrow({ where: { projectId } })).resolves.toMatchObject({ body: "第二版真实正文（编辑中二）", version: motherBefore.version, confirmedVersion: null });
  });

  it("creates one checkpoint for changed working content and none for identical content", async () => {
    const working = await getPrimaryDraft({ workspaceId, userId: editorId, projectId });
    const checkpoint = await checkpointDraftBranch({ workspaceId, userId: editorId, projectId, branchId: primaryId, expectedVersion: working.version });
    expect(checkpoint).toMatchObject({ checkpointCreated: true, revision: { revision: 3, body: "第二版真实正文（编辑中二）" } });
    const duplicate = await checkpointDraftBranch({ workspaceId, userId: editorId, projectId, branchId: primaryId, expectedVersion: checkpoint.branch.version });
    expect(duplicate.checkpointCreated).toBe(false);
    expect(await db.draftRevision.count({ where: { draftBranchId: primaryId } })).toBe(3);
  });

  it("supports an empty branch and a branch copied from the current draft", async () => {
    const empty = await createDraftBranch({ workspaceId, userId: editorId, projectId, title: "故事版" });
    const copied = await createDraftBranch({ workspaceId, userId: editorId, projectId, title: "视频口播版", copyFromBranchId: primaryId });
    emptyId = empty.id;
    copiedId = copied.id;
    expect(empty).toMatchObject({ currentRevision: null, workingState: { body: "" } });
    expect(copied.currentRevision).toMatchObject({ revision: 1, body: "第二版真实正文（编辑中二）", origin: "HUMAN" });
    expect(await db.draftBranch.count({ where: { projectId, deletedAt: null } })).toBe(3);
  });

  it("keeps each branch history isolated", async () => {
    const copied = await getDraftBranch({ workspaceId, userId: editorId, projectId, branchId: copiedId });
    const working = await saveDraftWorkingState({ workspaceId, userId: editorId, projectId, branchId: copiedId, expectedVersion: copied.version, title: "视频口播版", body: "口播修改", outline: ["口播"] });
    expect(await getDraftHistory({ workspaceId, userId: viewerId, projectId, branchId: copiedId })).toHaveLength(1);
    await checkpointDraftBranch({ workspaceId, userId: editorId, projectId, branchId: copiedId, expectedVersion: working.branch.version });
    const [primaryHistory, copiedHistory] = await Promise.all([
      getDraftHistory({ workspaceId, userId: viewerId, projectId, branchId: primaryId }),
      getDraftHistory({ workspaceId, userId: viewerId, projectId, branchId: copiedId }),
    ]);
    expect(primaryHistory.map(({ body }) => body)).toEqual(["第二版真实正文（编辑中二）", "第二版真实正文", "第一版真实正文"]);
    expect(copiedHistory.map(({ body }) => body)).toEqual(["口播修改", "第二版真实正文（编辑中二）"]);
  });

  it("keeps Viewer read-only while allowing draft reads", async () => {
    await expect(getDraftBranch({ workspaceId, userId: viewerId, projectId, branchId: copiedId })).resolves.toMatchObject({ id: copiedId });
    await expect(createDraftBranch({ workspaceId, userId: viewerId, projectId, title: "不可创建" })).rejects.toMatchObject({ code: "DRAFT_FORBIDDEN" });
    const copied = await getDraftBranch({ workspaceId, userId: viewerId, projectId, branchId: copiedId });
    await expect(renameDraftBranch({ workspaceId, userId: viewerId, projectId, branchId: copiedId, expectedVersion: copied.version, title: "不可修改" })).rejects.toMatchObject({ code: "DRAFT_FORBIDDEN" });
    await expect(setPrimaryDraftBranch({ workspaceId, userId: viewerId, projectId, branchId: copiedId, expectedPrimaryDraftBranchId: primaryId })).rejects.toMatchObject({ code: "DRAFT_FORBIDDEN" });
  });

  it("switches primary transactionally while preserving PlatformVariant and CreationFeedback legacy links", async () => {
    const run = await db.aIRun.create({ data: { workspaceId, projectId, userId: ownerId, action: "GENERATE_MOTHER_CONTENT", provider: "FIXTURE", model: "fixture", promptVersion: 1, status: "SUCCEEDED", inputSummary: {}, outputJson: {}, finishedAt: new Date(), appliedAt: new Date() } });
    await db.platformVariant.create({ data: { workspaceId, projectId, motherContentId: motherId, platform: "DOUYIN", title: "旧平台稿", body: "平台正文", hashtags: [], mediaPlan: {}, metadata: {}, sourceMotherVersion: 1, createdById: ownerId } });
    const feedback = await db.creationFeedback.create({ data: { workspaceId, projectId, userId: ownerId, motherContentId: motherId, motherContentVersion: 1, sourceAiRunId: run.id, outcome: "USED_AFTER_EDIT" } });
    feedbackId = feedback.id;
    const switched = await setPrimaryDraftBranch({ workspaceId, userId: editorId, projectId, branchId: copiedId, expectedPrimaryDraftBranchId: primaryId });
    expect(switched.branch).toMatchObject({ id: copiedId, isPrimary: true, currentRevision: { body: "口播修改" } });
    expect(switched.legacyContent).toMatchObject({ id: motherId, body: "口播修改" });
    await expect(db.creationFeedback.findUnique({ where: { id: feedbackId } })).resolves.not.toBeNull();
    const platforms = await listPlatformVariants({ workspaceId, userId: viewerId, projectId });
    expect(platforms.variants[0]).toMatchObject({ body: "平台正文", isStale: true });
  });

  it("synchronizes confirmation to the selected primary revision and MotherContent", async () => {
    const branch = await getPrimaryDraft({ workspaceId, userId: editorId, projectId });
    const confirmed = await confirmDraftRevision({ workspaceId, userId: editorId, projectId, branchId: branch.id, expectedVersion: branch.version, warningKeys: ["checked"], currentWarningKeys: ["checked"] });
    expect(confirmed.branch.confirmedRevisionId).toBe(confirmed.branch.currentRevisionId);
    expect(confirmed.legacyContent?.confirmedVersion).toBe(confirmed.legacyContent?.version);
    expect(confirmed.legacyContent?.confirmedWarnings).toEqual(["checked"]);
  });

  it("soft-deletes a non-primary branch but refuses to delete the current primary", async () => {
    const empty = await getDraftBranch({ workspaceId, userId: editorId, projectId, branchId: emptyId });
    await expect(softDeleteDraftBranch({ workspaceId, userId: editorId, projectId, branchId: empty.id, expectedVersion: empty.version })).resolves.toEqual({ deleted: true });
    const primary = await getPrimaryDraft({ workspaceId, userId: editorId, projectId });
    await expect(softDeleteDraftBranch({ workspaceId, userId: editorId, projectId, branchId: primary.id, expectedVersion: primary.version })).rejects.toMatchObject({ code: "DRAFT_PRIMARY_DELETE_FORBIDDEN" });
    expect((await listDraftBranches({ workspaceId, userId: viewerId, projectId })).some(({ id }) => id === emptyId)).toBe(false);
  });

  it("routes legacy MotherContent saves into a new primary DraftRevision", async () => {
    const before = await getPrimaryDraft({ workspaceId, userId: editorId, projectId });
    const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    const saved = await saveMotherContent({ workspaceId, userId: editorId, projectId, data: { title: "兼容保存", body: "兼容投影正文", outline: ["兼容"], expectedVersion: mother.version } });
    const after = await getPrimaryDraft({ workspaceId, userId: editorId, projectId });
    expect(after.currentRevision).toMatchObject({ revision: before.currentRevision!.revision + 1, body: "兼容投影正文" });
    expect(saved).toMatchObject({ id: motherId, body: "兼容投影正文" });
  });

  it("contains a safe migration backfill for projects with and without MotherContent", async () => {
    const migration = await readFile(new URL("../../../packages/db/prisma/migrations/20260913120000_draft_branches_revisions/migration.sql", import.meta.url), "utf8");
    expect(migration).toContain("FROM \"ContentProject\" project");
    expect(migration).toContain("jsonb_typeof(audit.\"metadata\"->'snapshot'->'body') = 'string'");
    expect(migration).toContain("counts.count + 1");
    expect(migration).not.toContain("repeat('");
  });
});
