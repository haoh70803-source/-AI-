import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const enqueueMaterialDistillation = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "queued" }));
vi.mock("@content-center/worker/queue-producer", () => ({ enqueueMaterialDistillation }));

import { db } from "@content-center/db";
import { createMethodFromDistillation, getMethod } from "../server/methods/service";
import { getMaterialDistillation, requestMaterialDistillation } from "../server/material-distillation/service";

function output(type = "method", quality = "WORTH_KEEPING") {
  return { mode: "COMPREHENSIVE", hasLongTermValue: true, message: "有一项值得留下。", highlights: [{ type, quality, title: "先判断再行动", essence: "先给判断标准。", whyWorthAttention: "可以迁移。", howTo: ["先给判断"], applicable: ["解释问题"], boundaries: ["不要照搬案例"], evidence: [{ quote: "真实依据" }] }], copywriting: null };
}

describe("material distillation service", () => {
  const suffix = randomUUID();
  const ownerId = `distillation-owner-${suffix}`;
  const colleagueId = `distillation-colleague-${suffix}`;
  let workspaceId = "";
  let sourceId = "";
  const runtime = { provider: {} as never, providerName: "FIXTURE", model: "fixture", productModel: "FIXTURE" as const, apiModelId: "fixture", mode: "FIXTURE" as const };

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Distillation Owner", email: `${ownerId}@example.test` }, { id: colleagueId, name: "Distillation Colleague", email: `${colleagueId}@example.test` }] });
    const workspace = await db.workspace.create({ data: { name: "Distillation", slug: `distillation-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: colleagueId, role: "EDITOR" }] } } });
    workspaceId = workspace.id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "待提炼视频", status: "READY", transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: "真实依据", segments: [{ text: "真实依据", startMs: 1_000, endMs: 3_000 }] } } } });
    sourceId = source.id;
  });

  afterAll(async () => {
    await db.methodAsset.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, colleagueId] } } });
    await db.$disconnect();
  });

  it("creates one processing version, preserves the last success, and marks transcript changes", async () => {
    const first = await requestMaterialDistillation({ workspaceId, sourceItemId: sourceId, userId: ownerId, mode: "COMPREHENSIVE" }, { runtime });
    expect(first).toMatchObject({ version: 1, status: "QUEUED", mode: "COMPREHENSIVE" });
    await expect(requestMaterialDistillation({ workspaceId, sourceItemId: sourceId, userId: ownerId, mode: "COPYWRITING" }, { runtime })).rejects.toMatchObject({ code: "DISTILLATION_ALREADY_PROCESSING" });
    await db.$transaction([
      db.materialDistillation.update({ where: { id: first.id }, data: { status: "COMPLETED", output: output() } }),
      db.ingestJob.updateMany({ where: { sourceItemId: sourceId, jobType: "DISTILL_MATERIAL" }, data: { status: "SUCCEEDED" } }),
    ]);
    const second = await requestMaterialDistillation({ workspaceId, sourceItemId: sourceId, userId: ownerId, mode: "COPYWRITING" }, { runtime });
    await db.$transaction([
      db.materialDistillation.update({ where: { id: second.id }, data: { status: "FAILED", errorCode: "FIXTURE_FAILURE", errorMessage: "这次没有完成。" } }),
      db.ingestJob.updateMany({ where: { sourceItemId: sourceId, jobType: "DISTILL_MATERIAL", status: "QUEUED" }, data: { status: "FAILED" } }),
    ]);
    let state = await getMaterialDistillation({ workspaceId, sourceItemId: sourceId });
    expect(state).toMatchObject({ current: { id: first.id, version: 1 }, latestAttempt: { id: second.id, status: "FAILED" } });
    expect(state.history).toHaveLength(2);
    await db.transcript.update({ where: { sourceItemId: sourceId }, data: { fullText: "真实依据，后来更新。" } });
    state = await getMaterialDistillation({ workspaceId, sourceItemId: sourceId });
    expect(state.current?.stale).toBe(true);
    expect(enqueueMaterialDistillation).toHaveBeenCalledTimes(2);
  });

  it("saves only a grounded method-like highlight with exact M7 provenance", async () => {
    const distillation = await db.materialDistillation.findFirstOrThrow({ where: { sourceItemId: sourceId, status: "COMPLETED" } });
    const method = await createMethodFromDistillation({ workspaceId, ownerUserId: ownerId, materialDistillationId: distillation.id, methodIndex: 0 });
    expect(method).toMatchObject({ status: "SAVED", current: { source: { sourceMaterialDistillationId: distillation.id, sourceItemId: sourceId } } });
    const stored = await db.methodVersion.findUniqueOrThrow({ where: { id: method.current.id } });
    expect(stored).toMatchObject({ sourceMaterialDistillationId: distillation.id, sourceItemId: null, sourceMaterialAnalysisId: null, sourceBenchmarkStudyId: null });
    await expect(getMethod({ workspaceId, ownerUserId: colleagueId, methodId: method.id })).resolves.toBeNull();
    const caseOnly = await db.materialDistillation.create({ data: { workspaceId, sourceItemId: sourceId, createdById: ownerId, version: 3, mode: "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v1", output: output("case_reference", "CASE_ONLY"), transcriptUpdatedAtAtDistillation: new Date() } });
    await expect(createMethodFromDistillation({ workspaceId, ownerUserId: ownerId, materialDistillationId: caseOnly.id, methodIndex: 0 })).rejects.toMatchObject({ code: "METHOD_INVALID" });
  });

  it("enforces workspace and Viewer write boundaries", async () => {
    await expect(getMaterialDistillation({ workspaceId: "missing-workspace", sourceItemId: sourceId })).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, data: { role: "VIEWER" } });
    await expect(requestMaterialDistillation({ workspaceId, sourceItemId: sourceId, userId: ownerId, mode: "COMPREHENSIVE" }, { runtime })).rejects.toMatchObject({ code: "DISTILLATION_FORBIDDEN" });
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, data: { role: "OWNER" } });
  });
});
