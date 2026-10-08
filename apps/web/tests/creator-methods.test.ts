import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { getCreatorMethodsOverview } from "../server/creator-methods/service";

describe("creator methods overview", () => {
  const suffix = randomUUID();
  const ownerId = `creator-methods-owner-${suffix}`;
  const otherId = `creator-methods-other-${suffix}`;
  let workspaceId = "";
  let provenance: { sourceItemId: string; sourceMaterialAnalysisId: string; sourceTranscriptId: string; sourceTranscriptUpdatedAt: Date };

  async function createMethod(status: "CORE" | "TRIAL" | "SAVED" | "DISABLED", title: string) {
    const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: ownerId, status } });
    const first = await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title, steps: ["先做这一步"], applicableScenarios: ["需要时"], boundaries: ["不要越界"], ...provenance, evidence: [], editedById: ownerId } });
    return { asset, first };
  }

  async function createRun(input: { status: "SUCCEEDED" | "FAILED"; createdAt: Date; projectId: string; userId?: string }) {
    return db.aIRun.create({ data: { workspaceId, projectId: input.projectId, userId: input.userId ?? ownerId, action: "GENERATE_MOTHER_CONTENT", provider: "TEST", model: "test", promptVersion: 1, status: input.status, inputSummary: {}, createdAt: input.createdAt } });
  }

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Creator Methods Owner", email: `${ownerId}@example.test` }, { id: otherId, name: "Creator Methods Other", email: `${otherId}@example.test` }] });
    const workspace = await db.workspace.create({ data: { name: "Creator Methods", slug: `creator-methods-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: otherId, role: "EDITOR" }] } } });
    workspaceId = workspace.id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "方法统计依据", status: "READY", transcript: { create: { workspaceId, provider: "TEST", providerMode: "REAL", fullText: "方法统计依据", segments: [] } } } });
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
    const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: ownerId, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
    provenance = { sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt };
    const project = await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "方法统计项目" } });
    const core = await createMethod("CORE", "核心方法");
    await db.methodVersion.create({ data: { assetId: core.asset.id, version: 2, title: "核心方法新版", steps: ["新版步骤"], applicableScenarios: ["新版场景"], boundaries: ["新版边界"], ...provenance, evidence: [], editedById: ownerId } });
    const trial = await createMethod("TRIAL", "试用方法");
    await createMethod("SAVED", "尚未尝试");
    const disabled = await createMethod("DISABLED", "停用方法");
    const coreRun = await createRun({ status: "SUCCEEDED", createdAt: new Date("2026-09-05T12:00:00.000Z"), projectId: project.id });
    const trialRun = await createRun({ status: "FAILED", createdAt: new Date("2026-09-04T12:00:00.000Z"), projectId: project.id });
    const disabledRun = await createRun({ status: "SUCCEEDED", createdAt: new Date("2026-09-03T12:00:00.000Z"), projectId: project.id });
    await createRun({ status: "SUCCEEDED", createdAt: new Date("2026-09-02T12:00:00.000Z"), projectId: project.id });
    const oldRun = await createRun({ status: "SUCCEEDED", createdAt: new Date("2026-07-01T12:00:00.000Z"), projectId: project.id });
    await db.methodUsage.createMany({ data: [{ projectId: project.id, methodAssetId: core.asset.id, methodVersionId: core.first.id, aiRunId: coreRun.id, userId: ownerId }, { projectId: project.id, methodAssetId: trial.asset.id, methodVersionId: trial.first.id, aiRunId: trialRun.id, userId: ownerId }, { projectId: project.id, methodAssetId: disabled.asset.id, methodVersionId: disabled.first.id, aiRunId: disabledRun.id, userId: ownerId }, { projectId: project.id, methodAssetId: core.asset.id, methodVersionId: core.first.id, aiRunId: oldRun.id, userId: ownerId }] });
  });

  afterAll(async () => {
    if (workspaceId) await db.methodAsset.deleteMany({ where: { workspaceId } });
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await db.$disconnect();
  });

  it("groups manual statuses and counts only recent successful/failed generation runs", async () => {
    const overview = await getCreatorMethodsOverview({ workspaceId, ownerUserId: ownerId, now: new Date("2026-09-07T12:00:00.000Z") });
    expect(overview.groups.CORE).toHaveLength(1);
    expect(overview.groups.TRIAL).toHaveLength(1);
    expect(overview.groups.SAVED).toHaveLength(1);
    expect(overview.groups.DISABLED).toHaveLength(1);
    expect(overview.totalGenerations).toBe(4);
    expect(overview.groups.CORE[0]).toMatchObject({ attemptCount: 1, attempts: 1, successfulCount: 1, failedCount: 0, latestUsedVersion: { version: 1 } });
    expect(overview.groups.TRIAL[0]).toMatchObject({ attempts: 1, successfulCount: 0, failedCount: 1 });
    expect(overview.groups.SAVED[0]).toMatchObject({ attempts: 0, successfulCount: 0, failedCount: 0, latestUsedAt: null });
    expect(overview.recentlyUsed.map((method) => method.status)).toEqual(expect.arrayContaining(["CORE", "TRIAL", "DISABLED"]));
  });

  it("never includes another user's methods in the same workspace", async () => {
    const otherAsset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: otherId, status: "CORE" } });
    const otherVersion = await db.methodVersion.create({ data: { assetId: otherAsset.id, version: 1, title: "他人的方法", steps: ["不应出现"], applicableScenarios: ["无"], boundaries: ["无"], ...provenance, evidence: [], editedById: otherId } });
    const project = await db.contentProject.create({ data: { workspaceId, createdById: otherId, title: "他人的项目" } });
    const run = await db.aIRun.create({ data: { workspaceId, projectId: project.id, userId: otherId, action: "GENERATE_MOTHER_CONTENT", provider: "TEST", model: "test", promptVersion: 1, status: "SUCCEEDED", inputSummary: {}, createdAt: new Date("2026-09-06T12:00:00.000Z") } });
    await db.methodUsage.create({ data: { projectId: project.id, methodAssetId: otherAsset.id, methodVersionId: otherVersion.id, aiRunId: run.id, userId: otherId } });
    const overview = await getCreatorMethodsOverview({ workspaceId, ownerUserId: ownerId, now: new Date("2026-09-07T12:00:00.000Z") });
    expect(overview.all.map((method) => method.current.title)).not.toContain("他人的方法");
  });
});
