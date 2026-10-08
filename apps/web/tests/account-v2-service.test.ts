import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { startWorkDeepResearch } from "../server/research/work-research-service";
import { startAccountV2Research } from "../server/research/account-v2-service";
import { executeResearchRun, saveResearchResult } from "../server/research/service";
import { getResearchReadableContent } from "../server/research/read-model";
import { parseAccountV2State, type AccountV2State } from "../server/research/account-v2-contract";
import { sampleAnswer, sampleBody, sampleDecisionPass } from "./work-research-fixture";

function accountAnswer(state: AccountV2State) {
  const [first, second] = state.selected; if (!first || !second) throw new Error("FIXTURE_WORKS_MISSING");
  const earlier = [first, second].sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
  return { inOneSentence: "围绕具体问题给出可观察的解决路径。", whatItDoes: "把问题和方法相连。",
    contentMap: [{ direction: "实际问题", meaning: "让观众先识别问题", workRefs: [first.ref, second.ref] }],
    topicLogic: "从真实问题出发。", openingLogic: "先说具体问题。", structureLogic: "问题之后接方法。", proofLogic: "作品说了方法，但仍要核对实际展示。",
    expressionDNA: "动作词多于抽象形容。", ctaLogic: "当前样本没有稳定行动模式。",
    patterns: [{ id: "pattern-one", name: "问题先行", kind: "选题", howUsed: "先指出问题，再给操作。", topicContexts: ["用户问题"], continuation: "后面演示方法。",
      proofPairing: "展示操作过程。", workRefs: [first.ref, second.ref], counterRefs: [], performanceObservation: null, recentChange: null,
      transferable: "从自己的客户问题切入。", limitation: "样本仍少。",
      citations: [first, second].map(item => ({ ref: item.ref, quote: item.citations[0]!.quote })) }],
    counterExamples: [], highVsTypical: { observation: "当前公开指标只是样本内对照。", highRefs: [second.ref], typicalRefs: [first.ref], counterRefs: [], limitation: "不能用点赞证明因果。" },
    evolution: [{ dimension: "表达", earlier: "先说问题", later: "先说问题并展示操作", earlierRefs: [earlier[0]!.ref], laterRefs: [earlier[1]!.ref],
      observation: "两个样本的处理细节不同。", limitation: "不能仅凭两条作品推断长期趋势。" }],
    learn: ["找真实问题"], doNotCopy: ["不搬运具体案例"],
    skillCandidates: [{ name: "问题先行", goal: "帮助观众认出问题", whenToUse: "有真实问题时", inputs: ["问题", "过程"],
      steps: ["写出问题", "展示过程"], proofRequired: "自有操作记录", cautions: "继续验证", prohibited: "编造效果", testVariables: ["开头顺序"],
      exampleFlow: ["问题", "过程"], patternIds: ["pattern-one"] }], researchLimits: ["只综合当前完成的作品深拆。"] };
}

describe("account V2 consumes cached work analysis", () => {
  const suffix = randomUUID(); const owner = `account-v2-owner-${suffix}`; const viewer = `account-v2-viewer-${suffix}`;
  let workspaceId = ""; let accountId = ""; const workIds: string[] = [];
  const actor = () => ({ workspaceId, userId: owner });
  const workRuntime = { provider: new MockLLMProvider(input => { if (JSON.parse(input.prompt).task.includes("决策层")) return sampleDecisionPass();
    const base = sampleAnswer(); base.structureBlocks.forEach(block => { block.startMs = null; block.endMs = null; }); return base; }),
    providerName: "FIXTURE", model: "work-v2-fixture", mode: "FIXTURE" as const };
  let accountCalls = 0; let lastPrompt: Record<string, unknown> = {};
  const accountRuntime = { provider: new MockLLMProvider(input => { accountCalls++; lastPrompt = JSON.parse(input.prompt);
    const works = lastPrompt.works as AccountV2State["selected"];
    return accountAnswer({ schemaVersion: "account-research-v2", account: { id: accountId, name: "研究对象", platform: "DOUYIN" },
      capturedAt: "2026-09-29", fingerprint: "a".repeat(64), collectionRunId: null, totalWorks: 2, readableWorks: 2, selected: works, deferredWorkIds: [], answer: null }); }),
    providerName: "FIXTURE", model: "account-v2-fixture", mode: "FIXTURE" as const };
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Account V2", slug: suffix,
      members: { create: [{ userId: owner, role: "OWNER" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    accountId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: owner, name: "研究对象", platform: "DOUYIN", externalAccountId: suffix } })).id;
    for (let index = 0; index < 2; index++) {
      const externalId = `${suffix}-${index}`;
      workIds.push((await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId,
        title: `怎样解决真实问题 ${index}`, publishedAt: new Date(Date.UTC(2026, 7 + index, 1)), url: "https://example.test/work", metadata: {},
        observations: { create: { metrics: { likes: 10 + index * 5 } } } } })).id);
      await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourcePlatform: "DOUYIN", externalId,
        sourceType: "TEXT", rawText: sampleBody, status: "READY" } });
    }
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [owner, viewer] } } }); await db.$disconnect(); });
  it("requires different completed work analyses and preserves owner scope", async () => {
    await expect(startAccountV2Research(actor(), accountId, { requestKey: randomUUID() })).rejects.toMatchObject({ code: "WORK_COMPARISON_REQUIRED" });
    for (const workId of workIds) {
      const reserved = await startWorkDeepResearch(actor(), accountId, workId, { requestKey: randomUUID() });
      await executeResearchRun(actor(), reserved.sessionId, reserved.runId, { runtime: workRuntime });
      const workRun = await db.researchRun.findUniqueOrThrow({ where: { id: reserved.runId } });
      expect(workRun.status, `${workRun.errorCode}: ${workRun.errorMessage}`).toBe("COMPLETED");
    }
    await expect(startAccountV2Research({ workspaceId, userId: viewer }, accountId, { requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
  });
  it("synthesizes only cached work assets, saves patterns and exposes them to Agent consumers", async () => {
    const reserved = await startAccountV2Research(actor(), accountId, { requestKey: randomUUID() });
    expect(reserved.created).toBe(true);
    await executeResearchRun(actor(), reserved.sessionId, reserved.runId, { runtime: accountRuntime });
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: reserved.runId } });
    const ai = run.aiRunId ? await db.aIRun.findUnique({ where: { id: run.aiRunId }, select: { metadata: true } }) : null;
    expect(run.status, `${run.errorMessage} ${JSON.stringify((ai?.metadata as Record<string, unknown>)?.failureDetails)}`).toBe("COMPLETED");
    const state = parseAccountV2State(run.coverage)!;
    expect(state.selected).toHaveLength(2); expect(state.answer?.patterns).toHaveLength(1);
    expect(lastPrompt).toHaveProperty("works"); expect((lastPrompt.works as Array<Record<string, unknown>>)[0]).not.toHaveProperty("bodyText");
    await saveResearchResult(actor(), reserved.sessionId, reserved.runId);
    const readable = await getResearchReadableContent(actor(), reserved.runId);
    expect(readable.structured).toMatchObject({ kind: "ACCOUNT_V2", patterns: expect.any(Array), skillCandidates: expect.any(Array) });
    await expect(getResearchReadableContent({ workspaceId, userId: viewer }, reserved.runId)).rejects.toMatchObject({ status: 404 });
    const reused = await startAccountV2Research(actor(), accountId, { requestKey: randomUUID() });
    expect(reused).toMatchObject({ runId: reserved.runId, unchanged: true, created: false }); expect(accountCalls).toBe(1);
  });
});
