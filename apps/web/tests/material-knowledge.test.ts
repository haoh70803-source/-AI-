import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { requestMaterialAnalysisJob } from "@content-center/worker/material-analysis-request";
import { AIControlService } from "../server/ai/control/ai-control-service";
import { ModelRouter } from "../server/ai/control/model-router";
import { ProjectContextBuilder } from "../server/ai/project-context";
import { decideMaterialCandidate, extractMaterialKnowledge, getMaterialKnowledge, materialKnowledgeExtractionSchema } from "../server/material-knowledge/service";

describe("Phase 10D-1 material knowledge", () => {
  const suffix = randomUUID(); const ownerId = `knowledge-owner-${suffix}`; const viewerId = `knowledge-viewer-${suffix}`;
  let workspaceId = ""; let projectId = ""; let otherProjectId = ""; let ownSourceId = ""; let unknownSourceId = ""; let externalSourceId = ""; let urlSourceId = "";
  let output: unknown = { candidates: [] };
  const provider = new MockLLMProvider(() => output); const runtime = { provider, providerName: "KIMI", model: "kimi-k2.6", requestedModel: "kimi-k2.6", mode: "REAL" as const };
  const controlService = new AIControlService({ modelRouter: new ModelRouter(async () => runtime) });

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Knowledge Owner", email: `${ownerId}@example.test` }, { id: viewerId, name: "Knowledge Viewer", email: `${viewerId}@example.test` }] });
    const workspace = await db.workspace.create({ data: { name: "Knowledge", slug: `knowledge-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } }); workspaceId = workspace.id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "内部资料项目" } })).id; otherProjectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "其他项目" } })).id;
    ownSourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", sourceProvider: "MANUAL", title: "内部访谈", rawText: "去年我们一共服务了12所学校。我的判断是内容要先解决真实问题。", status: "READY", projects: { create: { projectId, role: "OWN_MATERIAL" } }, transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "去年我们一共服务了12所学校。我的判断是内容要先解决真实问题。", segments: [{ startMs: 1_112_000, endMs: 1_116_000, text: "去年我们一共服务了12所学校。" }, { startMs: 1_116_000, endMs: 1_121_000, text: "我的判断是内容要先解决真实问题。" }] } } } })).id;
    unknownSourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", sourceProvider: "MANUAL", title: "归属不明文字", rawText: "这是一段没有归属说明的文字。", status: "READY", projects: { create: { projectId, role: "REFERENCE" } }, transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "这是一段没有归属说明的文字。", segments: [] } } } })).id;
    externalSourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", sourceProvider: "REDFOX", title: "外部视频", status: "READY", projects: { create: { projectId, role: "INSPIRATION" } }, transcript: { create: { workspaceId, provider: "DOUBAO_ASR", providerMode: "REAL", fullText: "这个博主说他们服务了20所学校。", segments: [{ startMs: 8_000, endMs: 12_000, text: "这个博主说他们服务了20所学校。" }] } } } })).id;
    urlSourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "URL", sourcePlatform: "GENERIC", sourceProvider: "GENERIC_URL", sourceUrl: "https://example.test/report", canonicalUrl: `https://example.test/report-${suffix}`, title: "外部报告", rawText: "公开报告认为内容需要真实证据。", status: "READY", projects: { create: { projectId, role: "REFERENCE" } }, transcript: { create: { workspaceId, provider: "GENERIC_URL", providerMode: "REAL", fullText: "公开报告认为内容需要真实证据。", segments: [] } } } })).id;
  });
  afterAll(async () => { await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } }); await db.$disconnect(); });

  it("queues only necessary analysis steps and keeps retries idempotent", async () => {
    const orchestrationSource = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", sourceProvider: "MANUAL", title: "编排文本", rawText: "真实文本", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "真实文本", segments: [] } } } });
    const enqueued: string[] = []; const first = await requestMaterialAnalysisJob({ workspaceId, sourceItemId: orchestrationSource.id, requestedById: ownerId }, { enqueue: async (payload) => { enqueued.push(payload.jobId); } }); const second = await requestMaterialAnalysisJob({ workspaceId, sourceItemId: orchestrationSource.id, requestedById: ownerId }, { enqueue: async () => undefined });
    expect(first.created).toBe(true); expect(second.created).toBe(false); expect(enqueued).toHaveLength(1);
    const video = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", sourcePlatform: "GENERIC", title: "待转录视频", status: "READY" } });
    await expect(requestMaterialAnalysisJob({ workspaceId, sourceItemId: video.id, requestedById: ownerId }, { enqueue: async () => undefined })).rejects.toMatchObject({ code: "SOURCE_NOT_READY" });
    const fallbackSource = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", sourceProvider: "MANUAL", title: "看懂失败但有原文", rawText: "仍可继续提取", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "仍可继续提取", segments: [] } } } }); const fallbackTranscript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: fallbackSource.id } }); await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: fallbackSource.id, version: 1, status: "FAILED", tags: [], keywords: [], keyPoints: [], transcriptUpdatedAtAtAnalysis: fallbackTranscript.updatedAt, createdById: ownerId } });
    expect(await getMaterialKnowledge({ workspaceId, userId: ownerId, sourceItemId: fallbackSource.id })).toMatchObject({ status: "READY_TO_EXTRACT", employeeStatus: "正在识别关键信息" });
  });

  it("extracts internal candidates with real locators and deterministic dedupe", async () => {
    output = { candidates: [{ content: "去年服务了12所学校", category: "NUMBER", excerpt: "去年我们一共服务了12所学校。", segmentIndex: 0, confidence: 0.96 }, { content: "内容要先解决真实问题", category: "VIEWPOINT", excerpt: "我的判断是内容要先解决真实问题。", segmentIndex: 1, confidence: 0.9 }] };
    const first = await extractMaterialKnowledge({ workspaceId, userId: ownerId, sourceItemId: ownSourceId }, { controlService }); const second = await extractMaterialKnowledge({ workspaceId, userId: ownerId, sourceItemId: ownSourceId }, { controlService });
    expect(first).toMatchObject({ created: 2, ownership: "OWN" }); expect(second.created).toBe(0);
    const state = await getMaterialKnowledge({ workspaceId, userId: ownerId, sourceItemId: ownSourceId }); expect(state.status).toBe("REVIEW"); expect(state.candidates).toEqual(expect.arrayContaining([expect.objectContaining({ category: "数字", ownership: "OWN", status: "PENDING", canConfirm: true, canReject: true, locator: expect.objectContaining({ kind: "TRANSCRIPT_SEGMENT", segmentIndex: 0, startMs: 1_112_000 }) })]));
  });

  it("keeps unclassified manual text UNKNOWN and never treats model ownership as authority", async () => {
    output = [{ content: "这是一段没有归属说明的文字", category: " fact ", ownership: " own ", excerpt: "这是一段没有归属说明的文字。", confidence: 0.8 }];
    const extracted = await extractMaterialKnowledge({ workspaceId, userId: ownerId, sourceItemId: unknownSourceId }, { controlService });
    expect(extracted).toMatchObject({ created: 1, ownership: "UNKNOWN" });
    const candidate = await db.evidenceItem.findFirstOrThrow({ where: { sourceItemId: unknownSourceId } });
    expect(candidate).toMatchObject({ ownership: "UNKNOWN", status: "PENDING", locator: { kind: "SOURCE_EXCERPT", excerpt: "这是一段没有归属说明的文字。" } });
    await expect(decideMaterialCandidate({ workspaceId, userId: ownerId, sourceItemId: unknownSourceId, candidateId: candidate.id, decision: "CONFIRM" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await db.evidenceItem.update({ where: { id: candidate.id }, data: { status: "CONFIRMED" } });
    const context = await new ProjectContextBuilder().build({ workspaceId, userId: ownerId, projectId, action: "PROJECT_ASSISTANT" });
    expect(context.ownFacts.map(({ sourceId }) => sourceId)).not.toContain(candidate.id);
  });

  it("accepts the explicit items wrapper but keeps URL material EXTERNAL", async () => {
    output = { items: [{ content: "公开报告认为内容需要真实证据", category: " viewpoint ", ownership: "OWN", excerpt: "公开报告认为内容需要真实证据。", confidence: 0.7 }] };
    const extracted = await extractMaterialKnowledge({ workspaceId, userId: ownerId, sourceItemId: urlSourceId }, { controlService });
    expect(extracted).toMatchObject({ created: 1, ownership: "EXTERNAL" });
    await expect(db.evidenceItem.findFirstOrThrow({ where: { sourceItemId: urlSourceId } })).resolves.toMatchObject({ ownership: "EXTERNAL", status: "CONFIRMED", locator: { kind: "WEB_EXCERPT", excerpt: "公开报告认为内容需要真实证据。" } });
  });

  it("never reconstructs missing required facts", () => {
    expect(materialKnowledgeExtractionSchema.safeParse({ candidates: [{ category: "FACT", excerpt: "真实摘录", confidence: 0.8 }] }).success).toBe(false);
    expect(materialKnowledgeExtractionSchema.safeParse({ candidates: [{ content: "", category: "FACT", excerpt: "真实摘录", confidence: 0.8 }] }).success).toBe(false);
  });

  it("requires human permission, records decisions, and only CONFIRMED own information enters project context", async () => {
    const pending = await db.evidenceItem.findFirstOrThrow({ where: { sourceItemId: ownSourceId, type: "DATA" } });
    await expect(decideMaterialCandidate({ workspaceId, userId: viewerId, sourceItemId: ownSourceId, candidateId: pending.id, decision: "CONFIRM" })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    let built = await new ProjectContextBuilder().build({ workspaceId, userId: ownerId, projectId, action: "PROJECT_ASSISTANT" }); expect(built.ownFacts.map(({ sourceId }) => sourceId)).not.toContain(pending.id);
    await decideMaterialCandidate({ workspaceId, userId: ownerId, sourceItemId: ownSourceId, candidateId: pending.id, decision: "CONFIRM", content: "去年我们服务了12所学校" });
    const reject = await db.evidenceItem.findFirstOrThrow({ where: { sourceItemId: ownSourceId, type: "VIEWPOINT" } }); await decideMaterialCandidate({ workspaceId, userId: ownerId, sourceItemId: ownSourceId, candidateId: reject.id, decision: "REJECT" });
    built = await new ProjectContextBuilder().build({ workspaceId, userId: ownerId, projectId, action: "PROJECT_ASSISTANT" }); expect(built.ownFacts).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: pending.id, text: "去年我们服务了12所学校" })])); expect(built.ownFacts.map(({ sourceId }) => sourceId)).not.toContain(reject.id);
    const other = await new ProjectContextBuilder().build({ workspaceId, userId: ownerId, projectId: otherProjectId, action: "PROJECT_ASSISTANT" }); expect(other.ownFacts.map(({ sourceId }) => sourceId)).not.toContain(pending.id);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "material_knowledge.confirmed", resourceId: pending.id } }); expect(audit.metadata).toMatchObject({ sourceItemId: ownSourceId, originalContent: "去年服务了12所学校", finalContent: "去年我们服务了12所学校", edited: true });
  });

  it("keeps external extraction external and never exposes it as confirmable own information", async () => {
    output = { candidates: [{ content: "该博主表示服务了20所学校", category: "CASE", ownership: "OWN", excerpt: "这个博主说他们服务了20所学校。", segmentIndex: 0, confidence: 0.92 }] };
    const extracted = await extractMaterialKnowledge({ workspaceId, userId: ownerId, sourceItemId: externalSourceId }, { controlService }); expect(extracted).toMatchObject({ created: 1, ownership: "EXTERNAL" });
    const candidate = await db.evidenceItem.findFirstOrThrow({ where: { sourceItemId: externalSourceId } }); expect(candidate).toMatchObject({ ownership: "EXTERNAL", status: "CONFIRMED" });
    expect(await getMaterialKnowledge({ workspaceId, userId: ownerId, sourceItemId: externalSourceId })).toMatchObject({ status: "COMPLETE", candidates: [expect.objectContaining({ ownershipLabel: "外部来源", statusLabel: "外部参考", canConfirm: false, canReject: false })] });
    const built = await new ProjectContextBuilder().build({ workspaceId, userId: ownerId, projectId, action: "PROJECT_ASSISTANT" }); expect(built.ownFacts.map(({ sourceId }) => sourceId)).not.toContain(candidate.id); expect(JSON.stringify(built.context)).toContain(candidate.id);
  });

  it("keeps historical knowledge data while requiring an explicit analysis request", async () => {
    const [migration, ingest, transcription, analysisApi, card] = await Promise.all([readFile(new URL("../../../packages/db/prisma/migrations/20260913200000_material_knowledge_candidates/migration.sql", import.meta.url), "utf8"), readFile(new URL("../../worker/src/ingest.ts", import.meta.url), "utf8"), readFile(new URL("../../worker/src/transcription.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/source-items/[id]/material-analysis/route.ts", import.meta.url), "utf8"), readFile(new URL("../components/library/material-knowledge-card.tsx", import.meta.url), "utf8")]);
    expect(migration).toContain('CREATE TYPE "EvidenceOwnership"'); expect(migration).toContain('CREATE TYPE "EvidenceStatus"'); expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN/u);
    expect(ingest).not.toContain("requestMaterialAnalysisJob"); expect(transcription).not.toContain("requestMaterialAnalysisJob"); expect(analysisApi).toContain("requestMaterialAnalysis"); expect(card).toContain("整理结果"); expect(card).toContain("编辑待确认内容"); expect(card).toContain('decide(candidate.id, "CONFIRM", edits[candidate.id])'); expect(card).not.toMatch(/INGEST|TRANSCRIBE|ANALYZE|DISTILL/u);
  });
});
