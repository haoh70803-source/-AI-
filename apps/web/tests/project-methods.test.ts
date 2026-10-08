import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { getProjectMethodState, getSelectedGenerationMethods, recordSelectedMethodUsages, setProjectMethodSelections } from "../server/project-methods/service";

describe("project method selections", () => {
  const suffix = randomUUID();
  const userAId = `selection-a-${suffix}`;
  const userBId = `selection-b-${suffix}`;
  let workspaceAId = "";
  let workspaceBId = "";
  let projectId = "";
  let sourceId = "";
  let analysisId = "";
  let transcriptId = "";
  const assetIds: string[] = [];
  const versionIds: string[] = [];
  let foreignVersionId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userAId, name: "Selection A", email: `${userAId}@example.test` }, { id: userBId, name: "Selection B", email: `${userBId}@example.test` }] });
    const [workspaceA, workspaceB] = await Promise.all([
      db.workspace.create({ data: { name: "Selection A", slug: `selection-a-${suffix}`, members: { create: { userId: userAId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Selection B", slug: `selection-b-${suffix}`, members: { create: { userId: userBId, role: "OWNER" } } } }),
    ]);
    workspaceAId = workspaceA.id; workspaceBId = workspaceB.id;
    await db.workspaceMember.create({ data: { workspaceId: workspaceAId, userId: userBId, role: "EDITOR" } });
    projectId = (await db.contentProject.create({ data: { workspaceId: workspaceAId, createdById: userAId, title: "Selection project" } })).id;
    const source = await db.sourceItem.create({ data: { workspaceId: workspaceAId, createdById: userAId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "Selection source", rawText: "可靠来源文字。", status: "READY", transcript: { create: { workspaceId: workspaceAId, provider: "MANUAL", providerMode: "REAL", fullText: "可靠来源文字。", segments: [] } } } });
    sourceId = source.id;
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: sourceId } });
    transcriptId = transcript.id;
    analysisId = (await db.materialAnalysis.create({ data: { workspaceId: workspaceAId, sourceItemId: sourceId, createdById: userAId, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], summary: "方法来源", transcriptUpdatedAtAtAnalysis: transcript.updatedAt } })).id;
    for (let index = 0; index < 4; index += 1) {
      const asset = await db.methodAsset.create({ data: { workspaceId: workspaceAId, ownerUserId: userAId, status: "SAVED" } });
      const version = await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title: `方法 ${index + 1}`, steps: [`步骤 ${index + 1}`], applicableScenarios: ["适用场景"], boundaries: ["使用边界"], sourceItemId: sourceId, sourceMaterialAnalysisId: analysisId, sourceTranscriptId: transcriptId, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [{ quote: "可靠来源文字。" }], editedById: userAId } });
      assetIds.push(asset.id); versionIds.push(version.id);
    }
    const foreignAsset = await db.methodAsset.create({ data: { workspaceId: workspaceAId, ownerUserId: userBId, status: "SAVED" } });
    const foreignVersion = await db.methodVersion.create({ data: { assetId: foreignAsset.id, version: 1, title: "他人的方法", steps: ["他人的步骤"], applicableScenarios: ["他人的场景"], boundaries: ["他人的边界"], sourceItemId: sourceId, sourceMaterialAnalysisId: analysisId, sourceTranscriptId: transcriptId, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [{ quote: "可靠来源文字。" }], editedById: userBId } });
    assetIds.push(foreignAsset.id);
    foreignVersionId = foreignVersion.id;
  });

  afterAll(async () => {
    await db.methodUsage.deleteMany({ where: { projectId } });
    await db.projectMethodSelection.deleteMany({ where: { projectId } });
    await db.methodAsset.deleteMany({ where: { workspaceId: { in: [workspaceAId, workspaceBId] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.$disconnect();
  });

  it("starts empty and only stores an explicit selection", async () => {
    await expect(getProjectMethodState({ workspaceId: workspaceAId, userId: userAId, projectId })).resolves.toMatchObject({ selected: [], available: expect.arrayContaining([expect.objectContaining({ methodVersionId: versionIds[0] })]) });
    const selected = await setProjectMethodSelections({ workspaceId: workspaceAId, userId: userAId, projectId, methodVersionIds: [versionIds[0]!] });
    expect(selected.selected).toHaveLength(1);
    expect(await db.methodUsage.count({ where: { projectId } })).toBe(0);
  });

  it("locks the selected version, supports up to three, and filters disabled methods", async () => {
    const asset = await db.methodAsset.findUniqueOrThrow({ where: { id: assetIds[0] } });
    const version = await db.methodVersion.create({ data: { assetId: asset.id, version: 2, title: "方法 1 新版", steps: ["新版步骤"], applicableScenarios: ["新版场景"], boundaries: ["新版边界"], sourceItemId: sourceId, sourceMaterialAnalysisId: analysisId, sourceTranscriptId: transcriptId, sourceTranscriptUpdatedAt: asset.createdAt, evidence: [{ quote: "可靠来源文字。" }], editedById: userAId } });
    const state = await getProjectMethodState({ workspaceId: workspaceAId, userId: userAId, projectId });
    expect(state.selected[0]).toMatchObject({ methodVersionId: versionIds[0], latestVersionId: version.id, isOutdated: true });
    expect(await getSelectedGenerationMethods({ workspaceId: workspaceAId, userId: userAId, projectId })).toMatchObject([{ methodVersionId: versionIds[0], title: "方法 1" }]);
    await setProjectMethodSelections({ workspaceId: workspaceAId, userId: userAId, projectId, methodVersionIds: [version.id, versionIds[1]!, versionIds[2]!, versionIds[2]!] });
    const threeMethods = await getSelectedGenerationMethods({ workspaceId: workspaceAId, userId: userAId, projectId });
    expect(threeMethods).toHaveLength(3);
    const threeMethodRun = await db.aIRun.create({ data: { workspaceId: workspaceAId, projectId, userId: userAId, action: "GENERATE_MOTHER_CONTENT", provider: "MOCK", model: "mock-llm", promptVersion: 1, status: "RUNNING", inputSummary: {} } });
    await recordSelectedMethodUsages({ workspaceId: workspaceAId, userId: userAId, projectId, aiRunId: threeMethodRun.id, methodVersionIds: threeMethods.map(({ methodVersionId }) => methodVersionId) });
    await expect(db.methodUsage.count({ where: { aiRunId: threeMethodRun.id } })).resolves.toBe(3);
    await db.aIRun.update({ where: { id: threeMethodRun.id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    await expect(setProjectMethodSelections({ workspaceId: workspaceAId, userId: userAId, projectId, methodVersionIds: [version.id, versionIds[1]!, versionIds[2]!, versionIds[3]!] })).rejects.toMatchObject({ code: "METHOD_SELECTION_INVALID" });
    await db.methodAsset.update({ where: { id: assetIds[1] }, data: { status: "DISABLED" } });
    const disabled = await getProjectMethodState({ workspaceId: workspaceAId, userId: userAId, projectId });
    expect(disabled.selected.find(({ methodAssetId }) => methodAssetId === assetIds[1])).toMatchObject({ isDisabled: true, status: "DISABLED" });
    const generationMethods = await getSelectedGenerationMethods({ workspaceId: workspaceAId, userId: userAId, projectId });
    expect(generationMethods.find(({ methodVersionId }) => methodVersionId === version.id)).toBeTruthy();
    expect(generationMethods.some(({ methodAssetId }) => methodAssetId === assetIds[1])).toBe(false);
  });

  it("records only active selected versions and keeps usage after a failed run", async () => {
    const selectedVersionIds = (await getSelectedGenerationMethods({ workspaceId: workspaceAId, userId: userAId, projectId })).map(({ methodVersionId }) => methodVersionId);
    expect(selectedVersionIds).toHaveLength(2);
    const run = await db.aIRun.create({ data: { workspaceId: workspaceAId, projectId, userId: userAId, action: "GENERATE_MOTHER_CONTENT", provider: "MOCK", model: "mock-llm", promptVersion: 1, status: "RUNNING", inputSummary: {} } });
    await recordSelectedMethodUsages({ workspaceId: workspaceAId, userId: userAId, projectId, aiRunId: run.id, methodVersionIds: selectedVersionIds });
    await expect(db.methodUsage.findMany({ where: { aiRunId: run.id }, orderBy: { methodVersionId: "asc" }, select: { methodAssetId: true, methodVersionId: true } })).resolves.toHaveLength(2);
    await db.aIRun.update({ where: { id: run.id }, data: { status: "FAILED", errorCode: "FIXTURE_FAILURE", finishedAt: new Date() } });
    await expect(db.methodUsage.count({ where: { aiRunId: run.id } })).resolves.toBe(2);
    await expect(recordSelectedMethodUsages({ workspaceId: workspaceAId, userId: userAId, projectId, aiRunId: run.id, methodVersionIds: [versionIds[3]!] })).rejects.toMatchObject({ code: "METHOD_SELECTION_INVALID" });
    const foreignRun = await db.aIRun.create({ data: { workspaceId: workspaceAId, projectId, userId: userBId, action: "GENERATE_MOTHER_CONTENT", provider: "MOCK", model: "mock-llm", promptVersion: 1, status: "RUNNING", inputSummary: {} } });
    await expect(recordSelectedMethodUsages({ workspaceId: workspaceAId, userId: userAId, projectId, aiRunId: foreignRun.id, methodVersionIds: [versionIds[0]!] })).rejects.toMatchObject({ code: "METHOD_SELECTION_INVALID" });
  });

  it("rejects foreign methods and Viewer writes", async () => {
    await expect(setProjectMethodSelections({ workspaceId: workspaceAId, userId: userAId, projectId, methodVersionIds: ["missing-version"] })).rejects.toMatchObject({ code: "METHOD_SELECTION_FORBIDDEN" });
    await expect(setProjectMethodSelections({ workspaceId: workspaceAId, userId: userAId, projectId, methodVersionIds: [foreignVersionId] })).rejects.toMatchObject({ code: "METHOD_SELECTION_FORBIDDEN" });
    await expect(setProjectMethodSelections({ workspaceId: workspaceBId, userId: userBId, projectId, methodVersionIds: [] })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    const membership = await db.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: workspaceAId, userId: userAId } } });
    await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } });
    await expect(setProjectMethodSelections({ workspaceId: workspaceAId, userId: userAId, projectId, methodVersionIds: [] })).rejects.toMatchObject({ code: "METHOD_SELECTION_FORBIDDEN" });
    await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "OWNER" } });
  });
});
