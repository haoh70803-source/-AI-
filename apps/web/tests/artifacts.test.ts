import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { ArtifactContextAdapter } from "../server/artifacts/context-adapter";
import { applyTextArtifactRevision, createTextArtifact, getArtifact, listArtifacts, saveTextArtifact } from "../server/artifacts/service";
import { runProjectAssistant } from "../server/assistant/service";

describe("generic text artifacts", () => {
  const suffix = randomUUID();
  const ownerId = `artifact-owner-${suffix}`;
  const viewerId = `artifact-viewer-${suffix}`;
  const outsiderId = `artifact-outsider-${suffix}`;
  const otherOwnerId = `artifact-other-owner-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";
  let otherProjectId = "";
  let otherWorkspaceProjectId = "";
  let threadId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [
      { id: ownerId, name: "Artifact Owner", email: `${ownerId}@example.test` },
      { id: viewerId, name: "Artifact Viewer", email: `${viewerId}@example.test` },
      { id: outsiderId, name: "Artifact Outsider", email: `${outsiderId}@example.test` },
      { id: otherOwnerId, name: "Artifact Other", email: `${otherOwnerId}@example.test` },
    ] });
    const workspace = await db.workspace.create({ data: { name: "Artifact Workspace", slug: `artifact-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } });
    const otherWorkspace = await db.workspace.create({ data: { name: "Other Artifact Workspace", slug: `artifact-other-${suffix}`, members: { create: { userId: otherOwnerId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Artifact Project" } })).id;
    otherProjectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Other Project" } })).id;
    otherWorkspaceProjectId = (await db.contentProject.create({ data: { workspaceId: otherWorkspaceId, createdById: otherOwnerId, title: "Foreign Project" } })).id;
    threadId = (await db.assistantThread.create({ data: { workspaceId, projectId, createdById: ownerId } })).id;
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (otherWorkspaceId) await db.workspace.delete({ where: { id: otherWorkspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId, outsiderId, otherOwnerId] } } });
    await db.$disconnect();
  });

  async function completedMessage(content: string, input: { project?: string; artifactId?: string; metadata?: unknown } = {}) {
    const selectedProjectId = input.project ?? projectId;
    const selectedThread = selectedProjectId === projectId ? threadId : (await db.assistantThread.create({ data: { workspaceId, projectId: selectedProjectId, createdById: ownerId } })).id;
    return db.assistantMessage.create({ data: { threadId: selectedThread, role: "ASSISTANT", status: "COMPLETED", content, artifactId: input.artifactId, metadata: input.metadata as never } });
  }

  it("keeps A isolated while applying a new revision to B-independent Artifact A", async () => {
    const sourceA = await completedMessage("第一段：项目已经完成资料整理。\n第二段：这里是一段需要明显缩短的详细执行说明。\n第三段：下一步进入交付。");
    const sourceB = await completedMessage("执行计划第一步。\n执行计划第二步。\n执行计划第三步。");
    const artifactA = await createTextArtifact({ workspaceId, userId: ownerId, projectId, title: "项目总结", sourceMessageId: sourceA.id });
    const repeatedA = await createTextArtifact({ workspaceId, userId: ownerId, projectId, title: "不会重复创建", sourceMessageId: sourceA.id });
    const artifactB = await createTextArtifact({ workspaceId, userId: ownerId, projectId, title: "执行计划", sourceMessageId: sourceB.id });
    expect(repeatedA.artifactId).toBe(artifactA.artifactId);

    const [rowABefore, rowBBefore] = await Promise.all([
      db.artifact.findUniqueOrThrow({ where: { id: artifactA.artifactId }, include: { draftBranch: { include: { revisions: { orderBy: { revision: "asc" } } } } } }),
      db.artifact.findUniqueOrThrow({ where: { id: artifactB.artifactId }, include: { draftBranch: { include: { revisions: { orderBy: { revision: "asc" } } } } } }),
    ]);
    const rewrite = await completedMessage("新版本：第一段：项目已经完成资料整理。\n第二段：执行说明已缩短。\n第三段：下一步进入交付。", { artifactId: artifactA.artifactId, metadata: { resultType: "REWRITE", structuredResult: { type: "REWRITE", original: rowABefore.draftBranch.workingBody, aiVersion: "第一段：项目已经完成资料整理。\n第二段：执行说明已缩短。\n第三段：下一步进入交付。" } } });
    const updatedA = await applyTextArtifactRevision({ workspaceId, userId: ownerId, projectId, artifactId: artifactA.artifactId, sourceMessageId: rewrite.id, expectedVersion: artifactA.version });
    const [rowAAfter, rowBAfter] = await Promise.all([
      db.artifact.findUniqueOrThrow({ where: { id: artifactA.artifactId }, include: { draftBranch: { include: { revisions: { orderBy: { revision: "asc" } } } } } }),
      db.artifact.findUniqueOrThrow({ where: { id: artifactB.artifactId }, include: { draftBranch: { include: { revisions: { orderBy: { revision: "asc" } } } } } }),
    ]);

    expect(updatedA).toMatchObject({ artifactId: artifactA.artifactId, version: artifactA.version + 1, content: expect.stringContaining("执行说明已缩短") });
    expect(rowAAfter.draftBranchId).toBe(rowABefore.draftBranchId);
    expect(rowAAfter.draftBranch.revisions).toHaveLength(rowABefore.draftBranch.revisions.length + 1);
    expect(rowAAfter.draftBranch.revisions[0]!.body).toBe(rowABefore.draftBranch.revisions[0]!.body);
    expect(rowBAfter.id).toBe(rowBBefore.id);
    expect(rowBAfter.draftBranch.version).toBe(rowBBefore.draftBranch.version);
    expect(rowBAfter.draftBranch.workingBody).toBe(rowBBefore.draftBranch.workingBody);
    expect(rowBAfter.draftBranch.revisions).toHaveLength(rowBBefore.draftBranch.revisions.length);
    expect((await db.contentProject.findUniqueOrThrow({ where: { id: projectId } })).primaryDraftBranchId).toBeNull();
    expect(await db.motherContent.findUnique({ where: { projectId } })).toBeNull();
    expect((await listArtifacts({ workspaceId, userId: ownerId, projectId })).map(({ artifactId }) => artifactId)).toEqual(expect.arrayContaining([artifactA.artifactId, artifactB.artifactId]));
    expect(await getArtifact({ workspaceId, userId: ownerId, projectId, artifactId: artifactA.artifactId })).toMatchObject({ content: updatedA.content });

    await expect(applyTextArtifactRevision({ workspaceId, userId: ownerId, projectId, artifactId: artifactA.artifactId, sourceMessageId: rewrite.id, expectedVersion: artifactA.version })).rejects.toMatchObject({ code: "ARTIFACT_VERSION_CONFLICT" });
    await expect(getArtifact({ workspaceId, userId: ownerId, projectId: otherProjectId, artifactId: artifactA.artifactId })).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
    await expect(getArtifact({ workspaceId: otherWorkspaceId, userId: otherOwnerId, projectId: otherWorkspaceProjectId, artifactId: artifactA.artifactId })).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
    await expect(getArtifact({ workspaceId, userId: outsiderId, projectId, artifactId: artifactA.artifactId })).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
    await expect(getArtifact({ workspaceId, userId: viewerId, projectId, artifactId: artifactA.artifactId })).resolves.toMatchObject({ artifactId: artifactA.artifactId });
    await expect(createTextArtifact({ workspaceId, userId: viewerId, projectId, title: "Viewer", sourceMessageId: sourceB.id })).rejects.toMatchObject({ code: "ARTIFACT_FORBIDDEN" });
    await expect(applyTextArtifactRevision({ workspaceId, userId: viewerId, projectId, artifactId: artifactA.artifactId, sourceMessageId: rewrite.id, expectedVersion: updatedA.version })).rejects.toMatchObject({ code: "ARTIFACT_FORBIDDEN" });

    const mismatch = await completedMessage("新版本：错误目标", { artifactId: artifactB.artifactId, metadata: { resultType: "REWRITE", structuredResult: { type: "REWRITE", original: artifactB.content, aiVersion: "错误目标" } } });
    await expect(applyTextArtifactRevision({ workspaceId, userId: ownerId, projectId, artifactId: artifactA.artifactId, sourceMessageId: mismatch.id, expectedVersion: updatedA.version })).rejects.toMatchObject({ code: "ARTIFACT_MESSAGE_MISMATCH" });
    const foreignMessage = await completedMessage("其他项目回复", { project: otherProjectId });
    await expect(createTextArtifact({ workspaceId, userId: ownerId, projectId, title: "错误来源", sourceMessageId: foreignMessage.id })).rejects.toMatchObject({ code: "ARTIFACT_INVALID_INPUT" });
  });

  it("saves a manual revision, reopens it and rejects stale or foreign edits", async () => {
    const source = await completedMessage("原始可持续修改的成果。");
    const original = await createTextArtifact({ workspaceId, userId: ownerId, projectId, title: "手动成果", sourceMessageId: source.id });
    const edited = await saveTextArtifact({ workspaceId, userId: ownerId, projectId, artifactId: original.artifactId, expectedVersion: original.version, title: "我的新版成果", body: "加入我自己的真实观点。" });
    expect(edited).toMatchObject({ title: "我的新版成果", content: "加入我自己的真实观点。", version: original.version + 1 });
    expect(await getArtifact({ workspaceId, userId: ownerId, projectId, artifactId: original.artifactId })).toMatchObject(edited);
    const row = await db.artifact.findUniqueOrThrow({ where: { id: original.artifactId }, include: { draftBranch: { include: { revisions: { orderBy: { revision: "asc" } } } } } });
    expect(row.draftBranch.revisions[0]!.body).toBe(original.content);
    expect(row.draftBranch.revisions.at(-1)!.origin).toBe("HUMAN");
    const input = { workspaceId, userId: ownerId, projectId, artifactId: original.artifactId, expectedVersion: original.version, title: "不应覆盖", body: "不应覆盖" };
    await expect(saveTextArtifact(input)).rejects.toMatchObject({ code: "ARTIFACT_VERSION_CONFLICT" });
    await expect(saveTextArtifact({ ...input, userId: viewerId, expectedVersion: edited.version })).rejects.toMatchObject({ code: "ARTIFACT_FORBIDDEN" });
    await expect(saveTextArtifact({ ...input, workspaceId: otherWorkspaceId, userId: otherOwnerId, projectId: otherWorkspaceProjectId })).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
    expect((await getArtifact({ workspaceId, userId: ownerId, projectId, artifactId: original.artifactId })).content).toBe(edited.content);
  });

  it("targets one Artifact through a server-resolved context item and persists both turn messages", async () => {
    const source = await completedMessage("第一段保持。\n第二段需要缩短一半。\n第三段保持。");
    const artifact = await createTextArtifact({ workspaceId, userId: ownerId, projectId, title: "定向修改", sourceMessageId: source.id });
    const adapter = new ArtifactContextAdapter();
    const resolved = await adapter.resolve({ workspaceId, userId: ownerId, projectId, artifactId: artifact.artifactId });
    expect(resolved.item).toMatchObject({ objectType: "ARTIFACT", objectId: artifact.artifactId, version: artifact.version, ownership: "PENDING", provenance: "artifact:text" });
    expect(resolved.item.content).toContain("第二段需要缩短一半");

    const provider = new MockLLMProvider(() => "新版本：第一段保持。\n第二段缩短。\n第三段保持。");
    const runtime = { provider, providerName: "KIMI", model: "kimi-k2.6", requestedModel: "kimi-k2.6", mode: "REAL" as const };
    const result = await runProjectAssistant({ workspaceId, userId: ownerId, projectId, content: "把第二段缩短一半", targetArtifactId: artifact.artifactId }, () => undefined, { runtime });
    expect(result).toMatchObject({ artifactId: artifact.artifactId, resultType: "REWRITE", actions: ["APPLY_ARTIFACT"] });
    const messages = await db.assistantMessage.findMany({ where: { threadId, artifactId: artifact.artifactId }, orderBy: { createdAt: "desc" }, take: 2 });
    expect(messages).toHaveLength(2);
    expect(messages.map(({ artifactId }) => artifactId)).toEqual([artifact.artifactId, artifact.artifactId]);
    const run = await db.aIRun.findUniqueOrThrow({ where: { id: messages.find(({ role }) => role === "ASSISTANT")!.aiRunId! } });
    expect(run.metadata).toMatchObject({ contextManifest: { selectedObjects: expect.arrayContaining([expect.objectContaining({ objectType: "ARTIFACT", objectId: artifact.artifactId, ownership: "PENDING" })]) } });

    const contextBuilder = await readFile(new URL("../server/ai/control/context-builder-v2.ts", import.meta.url), "utf8");
    expect(contextBuilder).toContain("resolvedContextItems");
    expect(contextBuilder).not.toContain("db.artifact");
  });

});
