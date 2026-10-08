import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../server/local-asr", () => ({
  getLocalAsrDisplay: vi.fn(async () => ({ status: "NOT_RUNNING", hardware: null, models: [], qualityModes: {} })),
}));

import { db } from "@content-center/db";
import { createSourceExternalMetadata, createSourceMetadataEnvelope } from "@content-center/providers";
import { getMaterialDetailView } from "../server/material-detail/service";

describe("material detail view", () => {
  const suffix = randomUUID();
  const userId = `material-detail-owner-${suffix}`;
  const email = `${userId}@example.test`;
  let workspaceId = "";
  let richSourceId = "";
  let sparseSourceId = "";

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, name: "资料详情负责人", email } });
    const workspace = await db.workspace.create({ data: { name: "资料详情 rich fixture", slug: `material-detail-${suffix}`, members: { create: { userId, role: "OWNER" } } } });
    workspaceId = workspace.id;
    const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "招生内容项目", status: "WRITING" } });
    const external = createSourceExternalMetadata({
      platform: "DOUYIN",
      externalId: "rich-material-001",
      originalTitle: "招生访谈：把真实问题讲清楚",
      description: "一条包含真实访谈、可核对表达和后续创作线索的资料。",
      authorId: "author-001",
      authorName: "内容负责人",
      authorAvatarUrl: "https://cdn.example.test/avatar-001.jpg",
      publishedAt: "2026-09-12T08:30:00.000Z",
      originalUrl: "https://www.douyin.com/video/rich-material-001",
      coverUrl: "https://cdn.example.test/cover-001.jpg",
      durationMs: 92_000,
      topics: ["招生", "内容表达"],
      metrics: { views: 125_000, likes: 18_800, comments: 321, favorites: 2_400, shares: 680 },
      providerFetchedAt: "2026-09-14T09:00:00.000Z",
      providerCrawlTime: "2026-09-14T08:59:58.000Z",
    });
    const source = await db.sourceItem.create({ data: {
      workspaceId, createdById: userId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", sourceProvider: "REDFOX",
      sourceUrl: external.originalUrl, canonicalUrl: external.originalUrl, externalId: external.externalId, title: external.originalTitle,
      author: external.authorName, description: external.description, thumbnailUrl: external.coverUrl, status: "READY",
      metadata: createSourceMetadataEnvelope(external, { awemeType: "video", assetCount: 1 }),
      transcript: { create: { workspaceId, provider: "DOUBAO_ASR", providerMode: "REAL", language: "zh", durationMs: 92_000, fullText: "先回应真实问题，再组织表达。", segments: [{ startMs: 12_000, endMs: 16_000, text: "先回应真实问题，再组织表达。" }], metadata: { methodLabel: "云端转写", qualityMode: "BALANCED", processingMs: 2_150 } } },
    } });
    richSourceId = source.id;
    await db.sourceAsset.create({ data: { workspaceId, sourceItemId: source.id, assetType: "VIDEO", sourceProvider: "REDFOX", remoteUrl: "https://cdn.example.test/video-001.mp4", status: "REMOTE", mimeType: "video/mp4" } });
    await db.projectSource.create({ data: { projectId: project.id, sourceItemId: source.id, role: "OWN_MATERIAL" } });
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
    const understanding = {
      whatItSays: { summary: "这条访谈强调先回应真实问题，再组织表达。", keyPoints: ["先回应真实问题", "分开事实和观点", "最后组织表达"], evidence: [{ quote: "先回应真实问题，再组织表达。", segmentIndex: 0 }] },
      expression: {
        audience: { summary: "面向正在整理内容的团队。", evidence: [{ quote: "真实问题", segmentIndex: 0 }] },
        opening: { summary: "从真实问题进入主题。", evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] },
        progression: { summary: "由问题推进到表达动作。", steps: ["回应问题", "组织表达"], evidence: [{ quote: "再组织表达", segmentIndex: 0 }] },
        support: { summary: "用真实访谈支撑判断。", evidence: [{ quote: "真实问题", segmentIndex: 0 }] },
        emotionalOrRhetoricalShift: { summary: "从信息混乱转向清晰行动。", evidence: [{ quote: "组织表达", segmentIndex: 0 }] },
        ending: { summary: "以可执行动作收束。", evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] },
      },
      methods: { evidenceStatus: "SINGLE_SOURCE_DRAFT", reason: "只有一条资料依据。", items: [{ title: "先回应问题，再组织表达", howTo: ["写清问题", "再组织表达"], applicable: ["整理访谈时"], boundaries: ["不要把外部经历写成我方事实"], evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] }] },
      reusable: [{ content: "先回应真实问题，再组织表达。", whyUseful: "帮助团队减少资料堆叠。" }], doNotCopy: [], uncertain: [{ content: "访谈中的规模性结论", reason: "还需要更多资料核对。" }],
    };
    const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: userId, version: 1, status: "COMPLETED", summary: understanding.whatItSays.summary, tags: [], keywords: ["招生"], keyPoints: understanding.whatItSays.keyPoints, understanding, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
    await db.evidenceItem.createMany({ data: [
      { workspaceId, projectId: project.id, sourceItemId: source.id, type: "VIEWPOINT", excerpt: "先回应真实问题，再组织表达。", claim: "先回应真实问题，再组织表达。", ownership: "OWN", status: "PENDING", locator: { kind: "TRANSCRIPT_SEGMENT", segmentIndex: 0, startMs: 12_000 }, createdById: userId },
      { workspaceId, projectId: project.id, sourceItemId: source.id, type: "CASE", excerpt: "访谈中的规模性结论。", claim: "访谈中的规模性结论。", ownership: "EXTERNAL", status: "CONFIRMED", locator: { kind: "TRANSCRIPT_SEGMENT", segmentIndex: 0, startMs: 12_000 }, createdById: userId },
    ] });
    const methodAsset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "TRIAL" } });
    await db.methodVersion.create({ data: { assetId: methodAsset.id, version: 1, title: "先回应问题，再组织表达", steps: ["写清问题", "组织表达"], applicableScenarios: ["整理访谈时"], boundaries: ["不要把外部经历写成我方事实"], sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [], editedById: userId } });
    await db.contentIdea.create({ data: { workspaceId, createdById: userId, title: "关联选题：把问题讲清楚", status: "READY", references: { create: { platform: "DOUYIN", externalId: external.externalId!, title: external.originalTitle!, url: external.originalUrl, authorName: external.authorName, coverUrl: external.coverUrl, sourceItemId: source.id, metadataSnapshot: { metrics: external.metrics } } } } });

    const sparse = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", sourceProvider: "REDFOX", sourceUrl: "https://www.douyin.com/video/sparse-material-001", canonicalUrl: "https://www.douyin.com/video/sparse-material-001", externalId: "sparse-material-001", title: "待补全的资料", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "一条已有文字稿的资料。", segments: [] } } } });
    sparseSourceId = sparse.id;
  });

  afterAll(async () => {
    if (richSourceId || sparseSourceId) await db.methodVersion.deleteMany({ where: { sourceItemId: { in: [richSourceId, sparseSourceId] } } });
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("aggregates rich source, workflow, evidence and method data", async () => {
    const view = await getMaterialDetailView({ workspaceId, userId, sourceItemId: richSourceId, role: "OWNER" });
    expect(view).not.toBeNull();
    expect(view!.source).toMatchObject({ title: "招生访谈：把真实问题讲清楚", author: "内容负责人", authorId: "author-001", authorAvatar: "https://cdn.example.test/avatar-001.jpg", publishedAt: "2026-09-12T08:30:00.000Z", durationMs: 92_000, originalUrl: "https://www.douyin.com/video/rich-material-001" });
    expect(view!.source.engagement).toEqual({ views: 125_000, likes: 18_800, comments: 321, favorites: 2_400, shares: 680 });
    expect(view!.source.metadataCompleteness.complete).toBe(true);
    expect(view!.source.refresh).toEqual({ available: false, state: "COMPLETE" });
    expect(view!.understanding.summary).toContain("先回应真实问题");
    expect(view!.understanding.keyPoints).toHaveLength(3);
    expect(view!.distillation.highlights).toEqual([]);
    expect(view!.evidence.externalReferences).toHaveLength(1);
    expect(view!.evidence.confirmableItems).toHaveLength(1);
    expect(view!.evidence.canConfirm).toBe(true);
    expect(view!.workflow.currentProjects[0]).toMatchObject({ title: "招生内容项目" });
    expect(view!.workflow.relatedTopics[0]).toMatchObject({ title: "关联选题：把问题讲清楚" });
    expect(view!.workflow.methodState.saved[0]).toMatchObject({ title: "先回应问题，再组织表达", status: "TRIAL", source: "analysis" });
    expect(view!.workflow.recommendedAction).toMatchObject({ key: "confirm", target: "confirm" });
    expect(view!.workflow.assistantHandoffAvailable).toBe(true);
    expect(view!.transcript).toMatchObject({ wordCount: 14, durationMs: 92_000, quality: "均衡", processingTime: "2 秒", updatedAt: expect.any(String), editable: true, transcriptionState: "COMPLETED" });
    expect(view!.processing.adminDetails).toMatchObject({ transcript: { provider: "DOUBAO_ASR" } });
    const viewerView = await getMaterialDetailView({ workspaceId, userId, sourceItemId: richSourceId, role: "VIEWER" });
    expect(viewerView!.processing.adminDetails).toBeNull();
  });

  it("marks incomplete metadata as refreshable without inventing values", async () => {
    const view = await getMaterialDetailView({ workspaceId, userId, sourceItemId: sparseSourceId, role: "OWNER" });
    expect(view!.source).toMatchObject({ title: "待补全的资料", author: null, authorAvatar: null, publishedAt: null, durationMs: null, description: null, cover: null, originalUrl: "https://www.douyin.com/video/sparse-material-001" });
    expect(view!.source.metadataCompleteness.complete).toBe(false);
    expect(view!.source.refresh).toMatchObject({ available: true, state: "PARTIAL" });
    expect(view!.source.engagement).toEqual({ views: null, likes: null, comments: null, favorites: null, shares: null });
  });
});
