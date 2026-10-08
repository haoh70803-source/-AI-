import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import {
  buildDefaultContentMethodPrompt,
  buildDefaultContentMethodSourceIndex,
  generateDefaultContentMethodCandidate,
  sanitizeDefaultContentMethodGeneration,
} from "../server/default-content-method/generation";
import { getInternalKnowledgeV1DryRun } from "../server/default-content-method/internal-knowledge-v1";
import { getDefaultContentMethod, publishDefaultContentMethod, saveDefaultContentMethodDraft } from "../server/default-content-method/service";
import { defaultContentMethodSectionCodes } from "../server/default-content-method/schemas";

describe("default content method V1 candidate generation", () => {
  const suffix = randomUUID();
  const userId = `m10-owner-${suffix}`;
  const otherUserId = `m10-other-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let providerCalls = 0;

  const validItems: Record<string, string[]> = {
    AUDIENCE: ["优先服务已有真实业务并愿意参与判断的教培经营负责人。"],
    TOPIC: ["优先从正在发生的真实经营问题里找选题。", "一条内容先讲清一个最重要的业务问题。"],
    OPENING: ["可以从具体问题、真实场景、结果或明确判断直接进入。"],
    BODY: ["先把问题讲具体，再解释原因和可以执行的做法。", "复杂问题先给一个最可能执行并容易验证的动作。"],
    EVIDENCE: ["有自己的真实材料时，优先用脱敏案例和数据把观点讲具体。", "使用案例时要区分起点、动作、过程和阶段结果。"],
    ENDING: ["优先用明确判断、一个动作或下一步收尾。"],
    BOUNDARY: ["不得编造客户、成绩、收入、成交结果或第一人称经历。", "不要把未完成的计划和测试写成已经取得的成果。"],
  };
  const validRefs: Record<string, string[]> = {
    AUDIENCE: ["R002"],
    TOPIC: ["R005", "R006"],
    OPENING: ["R017"],
    BODY: ["R019", "R020"],
    EVIDENCE: ["R022", "R028"],
    ENDING: ["R021"],
    BOUNDARY: ["R029", "R030"],
  };

  function fixture() {
    return {
      sections: defaultContentMethodSectionCodes.map((code) => ({ code, items: validItems[code]!.map((text, index) => ({ text, sourceRefs: [validRefs[code]![index]!] })) })).concat([
        { code: "TOPIC", items: [
          { text: "优先从正在发生的真实经营问题里找选题。", sourceRefs: ["R001"] },
          { text: "建议使用一个模型没有收到的来源。", sourceRefs: ["R999"] },
          { text: "我们已经帮助100个客户实现成交增长。", sourceRefs: ["R033"] },
          { text: "所有视频必须统一使用这套开头。", sourceRefs: ["R033"] },
          { text: "持续提升内容质量和用户信任。", sourceRefs: ["R001"] },
        ] },
      ]),
    };
  }

  const runtime = () => ({
    provider: new MockLLMProvider(() => { providerCalls += 1; return fixture(); }),
    providerName: "FIXTURE",
    model: "fixture-kimi-k2.6",
    requestedModel: "kimi-k2.6",
    mode: "FIXTURE" as const,
  });

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userId, name: "M10 Owner", email: `${userId}@example.test` }, { id: otherUserId, name: "M10 Other", email: `${otherUserId}@example.test` }] });
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: "鑫世界", slug: `m10-${suffix}`, members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "M10 Other", slug: `m10-other-${suffix}`, members: { create: { userId: otherUserId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id; otherWorkspaceId = other.id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "私人方法来源", rawText: "私人方法真实来源", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "私人方法真实来源", segments: [] } } } });
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
    const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: userId, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
    const privateAsset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "CORE" } });
    await db.methodVersion.create({ data: { assetId: privateAsset.id, version: 1, title: "私人常用方法", steps: ["私人步骤"], applicableScenarios: [], boundaries: [], sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [], editedById: userId } });
    const account = await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, platform: "DOUYIN", externalAccountId: `benchmark-${suffix}`, name: "单一对标账号" } });
    const inputs = Array.from({ length: 5 }, (_, index) => ({ sampleId: `sample-${index}`, sourceItemId: `source-${index}`, materialDistillationId: `distillation-${index}`, materialDistillationVersion: 1 }));
    const evidence = { evidenceRef: "E001", sampleId: "sample-0", sourceItemId: "source-0", materialDistillationId: "distillation-0", materialDistillationVersion: 1, itemKind: "HIGHLIGHT" as const, itemKey: "highlight-0", sourceRefs: ["T001"] };
    await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: account.id, createdById: userId, version: 1, status: "COMPLETED", sampleCount: 5, insufficientSamples: false, output: { kind: "CREATOR_PROFILE", schemaVersion: "benchmark-creator-profile-v4", message: "", account: { name: account.name, platform: "DOUYIN", bio: null, tags: [] }, inputs, accountResearch: null, priorProfileVersion: null, videoSignals: inputs.map((input, index) => ({ sampleRef: `V00${index + 1}`, sampleId: input.sampleId, sourceItemId: input.sourceItemId, primaryTopic: "招生问题", topicSignals: [], styleSignals: [] })), aggregatedSignals: [], cards: [{ code: "LEARN", status: "OBSERVE", claims: [{ id: "C001", text: "当前样本多次从具体经营问题切入。", evidenceRefs: ["E001"], evidence: [evidence], derivedFrom: [] }] }] } } });
  });

  afterAll(async () => {
    await db.methodAsset.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await db.$disconnect();
  });

  it("classifies the owner-provided source without importing background, future routes, or examples", () => {
    expect(getInternalKnowledgeV1DryRun()).toMatchObject({ ready: true, highValueItems: 32, backgroundItems: 1, futureRouteItems: 1, exampleItems: 1 });
  });

  it("builds a workspace-scoped source index with internal knowledge first and a single M9 account only as auxiliary", async () => {
    const sources = await buildDefaultContentMethodSourceIndex(workspaceId);
    expect(sources.filter(({ kind }) => kind === "INTERNAL_KNOWLEDGE")).toHaveLength(32);
    expect(sources.filter(({ kind }) => kind === "PUBLISHED_METHOD")).toHaveLength(0);
    expect(sources.filter(({ kind }) => kind === "BENCHMARK_PROFILE")).toHaveLength(1);
    expect(sources.some(({ label }) => label.includes("私人常用方法"))).toBe(false);
    expect(await buildDefaultContentMethodSourceIndex(otherWorkspaceId)).toHaveLength(0);
    const prompt = buildDefaultContentMethodPrompt(sources);
    expect(prompt.indexOf("INTERNAL_KNOWLEDGE")).toBeLessThan(prompt.indexOf("BENCHMARK_PROFILE"));
    for (const excluded of ["29,800", "经营问题型短视频", "六条改造后短视频稿件"]) expect(prompt).not.toContain(excluded);
  });

  it("filters unknown sources, empty advice, duplicate guidance, unsupported own facts, and strong single-benchmark rules", async () => {
    const sources = await buildDefaultContentMethodSourceIndex(workspaceId);
    const filtered = sanitizeDefaultContentMethodGeneration(fixture(), sources);
    expect(filtered.sections.map(({ code }) => code)).toEqual(defaultContentMethodSectionCodes);
    expect(filtered.validItems).toBe(11);
    expect(filtered.droppedItems).toBe(5);
    expect(JSON.stringify(filtered.sections)).not.toMatch(/R999|100个客户|所有视频必须|提升内容质量/u);
  });

  it("requires the authorized Kimi 2.6 runtime without falling back to DeepSeek", async () => {
    await expect(generateDefaultContentMethodCandidate({ workspaceId, userId }, { runtime: { provider: new MockLLMProvider(() => fixture()), providerName: "DEEPSEEK", model: "deepseek-v4-pro", requestedModel: "deepseek-v4-pro", mode: "REAL" } })).rejects.toMatchObject({ code: "DEFAULT_METHOD_INVALID" });
    expect(providerCalls).toBe(0);
  });

  it("creates one AI draft, records the run, never publishes, and requires explicit regeneration", async () => {
    const generated = await generateDefaultContentMethodCandidate({ workspaceId, userId }, { runtime: runtime() });
    expect(generated).toMatchObject({ internalSourceCount: 32, benchmarkSourceCount: 1, validItems: 11, method: { current: null, draft: { version: 1, origin: "AI_SUGGESTION", readyToPublish: true } } });
    expect(await db.aIRun.findUnique({ where: { id: generated.aiRunId } })).toMatchObject({ action: "ANALYZE_SOURCES", status: "SUCCEEDED", provider: "FIXTURE" });
    expect(await db.apiUsage.findFirst({ where: { requestId: generated.aiRunId } })).toMatchObject({ operation: "GENERATE_DEFAULT_CONTENT_METHOD", success: true });
    await expect(publishDefaultContentMethod({ workspaceId, userId, version: 1, actor: "AI" })).rejects.toMatchObject({ code: "DEFAULT_METHOD_FORBIDDEN" });
    await expect(generateDefaultContentMethodCandidate({ workspaceId, userId }, { runtime: runtime() })).rejects.toMatchObject({ code: "DEFAULT_METHOD_CONFLICT" });
    expect(providerCalls).toBe(1);
    const replaced = await generateDefaultContentMethodCandidate({ workspaceId, userId, replaceExisting: true }, { runtime: runtime() });
    expect(replaced.method.draft?.version).toBe(1);
    expect(providerCalls).toBe(2);
  });

  it("does not overwrite a human-edited draft or expose it to another workspace", async () => {
    const state = await getDefaultContentMethod({ workspaceId });
    await saveDefaultContentMethodDraft({ workspaceId, userId, version: state.draft!.version, sections: state.draft!.sections, origin: "HUMAN" });
    await expect(generateDefaultContentMethodCandidate({ workspaceId, userId, replaceExisting: true }, { runtime: runtime() })).rejects.toMatchObject({ code: "DEFAULT_METHOD_CONFLICT" });
    await expect(getDefaultContentMethod({ workspaceId: otherWorkspaceId })).resolves.toMatchObject({ assetId: null, current: null, draft: null });
    await expect(generateDefaultContentMethodCandidate({ workspaceId: otherWorkspaceId, userId: otherUserId }, { runtime: runtime() })).rejects.toMatchObject({ code: "DEFAULT_METHOD_INVALID" });
    expect(providerCalls).toBe(2);
  });
});
