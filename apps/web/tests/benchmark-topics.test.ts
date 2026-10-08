import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { materialDistillationGenerationSchema, MockLLMProvider } from "@content-center/providers";
import { defaultContentMethodMinimumItems, defaultContentMethodSectionCodes } from "../server/default-content-method/schemas";
import { generateBenchmarkTopics, selectBenchmarkTopic } from "../server/benchmark-topics/service";
import { benchmarkTopicsProviderSchema } from "../server/benchmark-topics/schemas";
import type { BenchmarkCreatorDetailDTO } from "../server/discovery/benchmark-creator-read-model";

describe("M11 benchmark-inspired topics", () => {
  const suffix = randomUUID();
  const userId = `benchmark-topics-${suffix}`;
  const otherUserId = `benchmark-topics-other-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let videoId = "";
  let m1OnlyVideoId = "";
  let unreadyVideoId = "";
  let emptyBenchmarkId = "";
  let videoRunId = "";
  let videoProjectId = "";
  let providerCalls = 0;
  const prompts: string[] = [];

  const providerOutput = {
    summary: "已形成多个不同切入角度。",
    topics: [
      { title: "我以前做校区运营时，最容易忽略的招生问题", angle: "人物经验", why: "用真实角色经历承接经营问题。", ourTake: "我以前做校区运营时，会先检查家长是否看懂差异。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "假设一家机构每天发内容，为什么客户还是不来问", angle: "假设场景", why: "用明确假设呈现执行与结果之间的落差。", ourTake: "假设一家机构连续发了 20 条内容，可以先检查吸引来的是同行还是客户。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "客户说贵，第一反应为什么不该是降价", angle: "客户认知", why: "从价格异议进入差异表达。", ourTake: "我们客户成交率提高了 30%，说明先讲差异更有效。", evidenceNeed: "REQUIRED" as const, evidenceHint: "需要真实客户案例和数据" },
      { title: "教培内容最容易犯的错：把报价当成回答", angle: "经营判断", why: "把常见动作重新定义为经营判断。", ourTake: "可以先讲为什么报价不等于回答，不依赖客户案例。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "同行先讲工具，我们为什么先讲经营问题", angle: "观点冲突", why: "外部观点与我方方法不同，可以形成对比。", ourTake: "先讨论经营问题，再决定工具是否值得使用。", evidenceNeed: "OPTIONAL" as const, evidenceHint: "有真实咨询记录会更有说服力" },
      { title: "报价为什么不是回答", angle: "经营判断", why: "同一个判断的重复版本。", ourTake: "报价不等于回答。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "保证招生增长的一个选题", angle: "结果承诺", why: "用承诺吸引员工。", ourTake: "保证招生增长。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "价格异议视频", angle: "照搬标题", why: "直接复用外部标题。", ourTake: "把外部标题换几个字。", evidenceNeed: "NONE" as const, evidenceHint: null },
    ],
  };
  const runtime = { provider: new MockLLMProvider((input) => { providerCalls += 1; prompts.push(input.prompt); return providerOutput; }), providerName: "FIXTURE", model: "fixture", requestedModel: "fixture", mode: "FIXTURE" as const };

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userId, name: "M11 Owner", email: `${userId}@example.test` }, { id: otherUserId, name: "Other", email: `${otherUserId}@example.test` }] });
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: "M11", slug: `m11-${suffix}`, members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "M11 Other", slug: `m11-other-${suffix}`, members: { create: { userId: otherUserId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id; otherWorkspaceId = other.id;
    await db.creatorProfile.create({ data: { workspaceId, userId, displayName: "M11 Owner", positioning: "曾负责校区运营", targetAudience: "教培老板", tone: "直接", preferredStyle: "具体", forbiddenStyle: "夸张", coreTopics: [], personalViews: ["先看经营问题"], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [] } });
    const sections = defaultContentMethodSectionCodes.map((code) => ({ code, items: Array.from({ length: defaultContentMethodMinimumItems[code] }, (_, index) => ({ text: `${code} 指南 ${index + 1}`, sourceRefs: [{ type: "OWN_EXPERIENCE" as const, referenceId: `${code}-${index}`, label: "内部依据" }] })) }));
    const defaultAsset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "CORE" } });
    await db.methodVersion.create({ data: { assetId: defaultAsset.id, version: 1, title: "鑫世界默认创作方法", workspaceDefaultKey: "DEFAULT_CONTENT", steps: { kind: "WORKSPACE_DEFAULT_CONTENT_METHOD", schemaVersion: "workspace-default-content-method-v1", publicationStatus: "PUBLISHED", origin: "HUMAN", createdFromVersion: null, publishedAt: new Date().toISOString(), publishedById: userId, sections }, applicableScenarios: [], boundaries: [], evidence: [], editedById: userId } });
    const createVideo = async (title: string) => {
      const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title, status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "家长先问价格时，可以先确认他是否理解课程差异。", segments: [] } } } });
      return { source, transcript: await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } }) };
    };
    const video = await createVideo("价格异议视频"); videoId = video.source.id;
    const m7 = materialDistillationGenerationSchema.parse({ mode: "COMPREHENSIVE", hasLongTermValue: true, message: "已整理。", highlights: [{ type: "method", quality: "WORTH_KEEPING", title: "先理解差异再报价", essence: "家长没有理解差异时，直接报价可能走早了。", whyWorthAttention: "可以迁移。", howTo: ["先问问题"], applicable: ["价格异议"], boundaries: ["不要照搬客户"], evidence: [{ quote: "家长先问价格时，可以先确认他是否理解课程差异。", sourceRef: "T001", kind: "TEXT_BLOCK", index: 0 }] }], copywriting: null });
    await db.materialDistillation.create({ data: { workspaceId, sourceItemId: videoId, createdById: userId, version: 1, mode: "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v2", output: m7, transcriptUpdatedAtAtDistillation: video.transcript.updatedAt } });
    const m1Only = await createVideo("只有 M1 的视频"); m1OnlyVideoId = m1Only.source.id;
    await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: m1OnlyVideoId, createdById: userId, version: 1, status: "COMPLETED", summary: "家长问价格后需要先理解差异。", tags: [], keywords: [], keyPoints: ["价格异议"], transcriptUpdatedAtAtAnalysis: m1Only.transcript.updatedAt } });
    unreadyVideoId = (await createVideo("还没有研究结果的视频")).source.id;
    emptyBenchmarkId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, platform: "DOUYIN", externalAccountId: `empty-${suffix}`, name: "还没有画像的博主" } })).id;
  });

  afterAll(async () => {
    await db.methodAsset.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await db.$disconnect();
  });

  it("turns one M7 video into distinct safe topics and records provenance, context, methods, and counts", async () => {
    const result = await generateBenchmarkTopics({ workspaceId, userId, source: { sourceType: "VIDEO", sourceId: videoId } }, { runtime });
    videoRunId = result.id; videoProjectId = result.projectId;
    expect(result.output.source).toMatchObject({ type: "VIDEO", id: videoId, basis: "M7", materialDistillationId: expect.any(String) });
    expect(result.output.source.sourceOwnership).toBe("EXTERNAL");
    expect(result.output.topics.every(({ sourceOwnership }) => sourceOwnership === "EXTERNAL")).toBe(true);
    expect(result.output.topics).toHaveLength(5);
    expect(result.output.metrics).toEqual({ candidateCount: 8, validCount: 5, filteredCount: 3 });
    expect(result.output.topics.map(({ angle }) => angle)).toEqual(expect.arrayContaining(["人物经验", "假设场景", "客户认知", "经营判断", "观点冲突"]));
    expect(result.output.topics.find(({ angle }) => angle === "人物经验")).toMatchObject({ ourTake: expect.stringContaining("我以前做校区运营"), evidenceStatus: "DIRECT", factState: "CONFIRMED_OWN_FACT" });
    expect(result.output.topics.find(({ angle }) => angle === "假设场景")?.evidenceStatus).toBe("HYPOTHETICAL");
    expect(JSON.stringify(result.output.topics)).not.toContain("我们客户");
    expect(JSON.stringify(result.output.topics)).not.toContain("保证招生增长");
    const stored = await db.aIRun.findUniqueOrThrow({ where: { id: result.id }, include: { methodUsages: true } });
    expect(stored.metadata).toMatchObject({ kind: "M11_BENCHMARK_TOPICS", inputSourceType: "VIDEO", inputSourceId: videoId, inputBasis: "M7", candidateCount: 8, validCount: 5, filteredCount: 3 });
    expect(stored.inputSummary).toMatchObject({ contextVersion: "creation-context-v1", defaultMethodSections: ["AUDIENCE", "TOPIC", "BOUNDARY"] });
    expect(stored.methodUsages).toHaveLength(1);
    expect((await db.apiUsage.findFirstOrThrow({ where: { requestId: result.id } })).metadata).toMatchObject({ contextVersion: "creation-context-v1", inputSourceType: "VIDEO", inputSourceId: videoId, candidateCount: 8, validCount: 5, filteredCount: 3 });
    expect(prompts.at(-1)).toContain("externalReferences");
    expect(prompts.at(-1)).not.toContain("BODY 指南");
  });

  it("falls back to current M1 without rerunning M7", async () => {
    const result = await generateBenchmarkTopics({ workspaceId, userId, source: { sourceType: "VIDEO", sourceId: m1OnlyVideoId } }, { runtime });
    expect(result.output.source).toMatchObject({ basis: "M1", materialAnalysisId: expect.any(String) });
    const calls = providerCalls;
    await expect(generateBenchmarkTopics({ workspaceId, userId, source: { sourceType: "VIDEO", sourceId: unreadyVideoId } }, { runtime })).rejects.toMatchObject({ code: "SOURCE_NOT_READY" });
    expect(providerCalls).toBe(calls);
  });

  it("uses an existing M9 profile and never generates a missing profile", async () => {
    const detail: BenchmarkCreatorDetailDTO = { account: { id: "benchmark-with-profile", name: "真实博主", platform: "DOUYIN", avatarUrl: null, bio: "讨论教培经营", lastSyncedAt: null, tags: [] }, stats: { discovered: 5, collected: 5, studied: 5, distilled: 5, copywriting: 0 }, representativeSources: [], highlights: [], copywriting: [], accountResearch: null, playbooks: [], creatorProfile: { studyId: "m9-study-v4", version: 4, schemaVersion: "benchmark-creator-profile-v4", createdAt: new Date().toISOString(), message: "已有画像", sections: [{ code: "TOPIC_STYLE", status: "CLEAR", text: "多次从价格问题切入。", sources: [] }] }, savedMethods: [] };
    const m9Output = { summary: "从 M9 稳定特征形成多个角度。", topics: [
      { title: "我们客户为什么总在报价后消失", angle: "客户案例", why: "从客户问题切入。", ourTake: "我们客户都遇到过这个问题。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "我们研究过的账号有什么共同点", angle: "研究观察", why: "使用外部稳定观察。", ourTake: "我们研究过 30 个账号后发现开头必须直接。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "我以前做直播投放时最常犯的错", angle: "对方经历", why: "使用经历建立可信度。", ourTake: "我以前做过直播投放。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "我们服务过 30 家机构后发现的定价规律", angle: "稳定数字", why: "从具体数字进入。", ourTake: "我们服务过 30 家机构。", evidenceNeed: "NONE" as const, evidenceHint: null },
      { title: "我以前做校区运营时，最容易忽略的招生问题", angle: "真实人物事实", why: "用我方已确认经历承接。", ourTake: "我以前做校区运营时，会先检查家长是否看懂差异。", evidenceNeed: "NONE" as const, evidenceHint: null },
    ] };
    const m9Runtime = { ...runtime, provider: new MockLLMProvider((input) => { providerCalls += 1; prompts.push(input.prompt); return m9Output; }) };
    const result = await generateBenchmarkTopics({ workspaceId, userId, source: { sourceType: "CREATOR_PROFILE", sourceId: detail.account.id } }, { runtime: m9Runtime, creatorLoader: async () => detail });
    expect(result.output.source).toMatchObject({ type: "CREATOR_PROFILE", basis: "M9", creatorProfileStudyId: "m9-study-v4" });
    expect(result.output.topics).toHaveLength(5);
    expect(result.output.topics.every(({ sourceOwnership }) => sourceOwnership === "EXTERNAL")).toBe(true);
    expect(JSON.stringify(result.output.topics)).not.toMatch(/我们客户|我们研究过|我以前做过直播|我们服务过 30 家/u);
    expect(result.output.topics.filter(({ evidenceNeed }) => evidenceNeed === "REQUIRED")).toHaveLength(4);
    expect(result.output.topics.find(({ angle }) => angle === "真实人物事实")).toMatchObject({ factState: "CONFIRMED_OWN_FACT", evidenceStatus: "DIRECT", ourTake: expect.stringContaining("我以前做校区运营") });
    expect(prompts.at(-1)).toContain("M9 中的 CLEAR");
    const calls = providerCalls;
    await expect(generateBenchmarkTopics({ workspaceId, userId, source: { sourceType: "CREATOR_PROFILE", sourceId: emptyBenchmarkId } }, { runtime })).rejects.toMatchObject({ code: "CREATOR_PROFILE_NOT_READY" });
    expect(providerCalls).toBe(calls);
  });

  it("takes only the selected topic and necessary source into Studio", async () => {
    const selected = await selectBenchmarkTopic({ workspaceId, userId, runId: videoRunId, topicIndex: 0 });
    expect(selected.projectId).toBe(videoProjectId);
    const project = await db.contentProject.findUniqueOrThrow({ where: { id: videoProjectId }, include: { creativeBrief: true, sources: true } });
    expect(project.title).toBe(selected.topic.title);
    expect(project.sources).toHaveLength(1);
    expect(project.sources[0]).toMatchObject({ sourceItemId: videoId, role: "INSPIRATION" });
    expect(project.creativeBrief?.metadata).toMatchObject({ handoff: "BENCHMARK_TOPIC", aiRunId: videoRunId, topicIndex: 0, source: { type: "VIDEO", id: videoId, basis: "M7" } });
    expect(JSON.stringify(project.creativeBrief?.metadata)).not.toContain("报价为什么不是回答");
    await expect(selectBenchmarkTopic({ workspaceId: otherWorkspaceId, userId: otherUserId, runId: videoRunId, topicIndex: 0 })).rejects.toMatchObject({ code: "TOPICS_NOT_FOUND" });
  });

  it("keeps both employee entries lightweight", async () => {
    const [sourceActions, researchHome, benchmarkDetail, panel] = await Promise.all([
      readFile(new URL("../components/library/source-actions.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(app)/research/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(app)/research/benchmarks/[id]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/discovery/benchmark-topic-generator.tsx", import.meta.url), "utf8"),
    ]);
    expect(sourceActions).toContain("用这条找选题");
    expect(researchHome).toContain("开始一次研究");
    expect(benchmarkDetail).toContain("研究这个账号");
    for (const label of ["为什么值得做", "我们自己的切入", "可以直接讲", "可以用假设场景", "建议补真实案例", "建议补真实数据", "选这个题去创作"]) expect(panel).toContain(label);
    for (const forbidden of ["factState", "source ownership", "MethodUsage", "AIRun", "Schema"]) expect(panel).not.toContain(forbidden);
  });

  it("keeps the M11 provider contract small and strict", () => {
    expect(benchmarkTopicsProviderSchema.safeParse(providerOutput).success).toBe(true);
    expect(benchmarkTopicsProviderSchema.safeParse({ ...providerOutput, factState: "EXTERNAL_FACT" }).success).toBe(false);
    expect(benchmarkTopicsProviderSchema.safeParse({ summary: "少一条", topics: providerOutput.topics.slice(0, 3) }).success).toBe(false);
    expect(benchmarkTopicsProviderSchema.safeParse({ ...providerOutput, topics: [{ ...providerOutput.topics[0], sourceOwnership: "EXTERNAL" }, ...providerOutput.topics.slice(1)] }).success).toBe(false);
  });
});
