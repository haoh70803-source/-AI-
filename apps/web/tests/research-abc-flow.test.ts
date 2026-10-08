import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { startWorkDeepResearch } from "../server/research/work-research-service";
import { startAccountV2Research } from "../server/research/account-v2-service";
import { createResearchSession, reserveResearchRun, executeResearchRun, saveResearchResult, getResearchSession } from "../server/research/service";
import { getResearchReadableContent } from "../server/research/read-model";
import { createTextArtifact, saveTextArtifact, getArtifactForUser } from "../server/artifacts/service";
import { sampleAnswer, sampleBody, sampleDecisionPass } from "./work-research-fixture";
import { runProjectAssistant } from "../server/assistant/service";
import { accountAnswer } from "./research-account-fixture";
import type { AccountV2State } from "../server/research/account-v2-contract";

let workspaceId = "", userId = "", accountId = "", projectId = "";
const workIds: string[] = [];
const actor = () => ({ workspaceId, userId });
const workRuntime = { provider: new MockLLMProvider(input => {
  if (JSON.parse(input.prompt).task.includes("决策层")) return sampleDecisionPass();
  const result = sampleAnswer(); result.structureBlocks.forEach(block => { block.startMs = null; block.endMs = null; }); return result;
}), providerName: "FIXTURE", model: "abc-work-fixture", mode: "FIXTURE" as const };
const accountRuntime = { provider: new MockLLMProvider(input => accountAnswer({ selected: JSON.parse(input.prompt).works } as AccountV2State)),
  providerName: "FIXTURE", model: "abc-account-fixture", mode: "FIXTURE" as const };
const topicRuntime = { provider: new MockLLMProvider(() => ({ sections: [
  { title: "从用户问题选角度", text: "先明确读者遇到的问题，再用自己的操作过程展开。", sourceRefs: ["M1"], limitation: "仅依据文字资料，未读取视频画面。" },
  { title: "可以写成什么", text: "可以写一篇解答问题的文章，也可以解释一个操作过程。", sourceRefs: ["M1"], limitation: "需补充自己的业务事实。" }
] })), providerName: "FIXTURE", model: "abc-topic-fixture", mode: "FIXTURE" as const };
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || url.port !== "55436" || url.pathname !== "/content_center_upgrade_review" || process.env.LOCAL_REVIEW_OFFLINE !== "true") throw Error("REVIEW_ONLY");
  const suffix = randomUUID();
  userId = (await db.user.create({ data: { name: "ABC fixture", email: `abc-${suffix}@example.test` } })).id;
  workspaceId = (await db.workspace.create({ data: { name: "ABC disposable", slug: suffix, members: { create: { userId, role: "OWNER" } } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "ABC自己的项目" } })).id;
  accountId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, name: "ABC对象", platform: "DOUYIN", externalAccountId: suffix } })).id;
  for (let index = 0; index < 2; index++) {
    const externalId = `${suffix}-${index}`;
    workIds.push((await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId, title: "怎样解决真实问题", url: "https://example.test/work", publishedAt: new Date(Date.UTC(2026, 8, index + 1)), metadata: {}, observations: { create: { metrics: { likes: 10 + index } } } } })).id);
    await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourcePlatform: "DOUYIN", externalId, sourceType: "TEXT", rawText: sampleBody, status: "READY", title: "ABC正文" } });
  }
});
afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  expect(await db.workspace.count({ where: { id: workspaceId } })).toBe(0);
  await db.$disconnect();
});

async function createAndReopen(sessionId: string, runId: string, label: string) {
  await saveResearchResult(actor(), sessionId, runId);
  const research = await getResearchReadableContent(actor(), runId);
  expect(research.text.length).toBeGreaterThan(0);
  const stored = await db.researchRun.findUniqueOrThrow({ where: { id: runId } });
  const blocks = stored.blocks as Array<{ id: string; type: string; title: string; text?: string }>;
  if (label === "A") {
    expect(blocks.filter(block => block.id.startsWith("structure-")).length).toBe(sampleAnswer().structureBlocks.length);
    expect(blocks.filter(block => ["understanding", "topic", "transfer"].includes(block.id) || block.id.startsWith("structure-") || block.id.startsWith("mechanism-")).every(block => !/原文：|作品主张：|作品提供的证明：/.test(block.text ?? ""))).toBe(true);
    expect(blocks.some(block => block.id === "sources")).toBe(true);
  }
  if (label === "B") {
    expect(blocks.some(block => block.id === "account-v2-method")).toBe(false);
    expect(blocks.some(block => block.id.startsWith("account-v2-skill-") && block.title.startsWith("可以借鉴的写法"))).toBe(true);
    expect(JSON.stringify(blocks)).not.toContain("自动成为正式 Skill");
  }
  let receivedResearch = false;
  const message = await runProjectAssistant({ ...actor(), projectId, content: "借鉴这份研究，写成我的文章。业务事实留待补充。",
    references: [{ sourceType: "RESEARCH", sourceId: runId }] }, () => undefined, { runtime: {
      provider: new MockLLMProvider(input => { receivedResearch = input.prompt.includes(runId) && input.prompt.includes("blocks"); return `# ${label}自己的版本\n\n借鉴研究中的方法，业务事实待自己补充。`; }),
      providerName: "FIXTURE", model: "abc-creation-fixture", mode: "FIXTURE"
    } });
  expect(message.status).toBe("COMPLETED");
  expect(receivedResearch).toBe(true);
  expect(message.sources.some(source => source.reference?.sourceId === runId)).toBe(true);
  const created = await createTextArtifact({ ...actor(), projectId, title: label, sourceMessageId: message.id });
  const edited = `# ${label}手动确认版本

这是自己的观点，业务案例待补充。`;
  const saved = await saveTextArtifact({ ...actor(), projectId, artifactId: created.artifactId, expectedVersion: created.version, title: label, body: edited });
  const reopened = await getArtifactForUser({ ...actor(), projectId, artifactId: saved.artifactId });
  expect(reopened.content).toBe(edited); expect(reopened.version).toBe(saved.version);
  expect((await getResearchSession(actor(), sessionId)).runs.some(run => run.id === runId && run.savedAt)).toBe(true);
}

it("A input → duplicate-safe execution → saved research reference → own Artifact → reopen", async () => {
  const requests = await Promise.all([1, 2].map(() => startWorkDeepResearch(actor(), accountId, workIds[0]!, { requestKey: randomUUID() })));
  expect(new Set(requests.map(item => item.runId)).size).toBe(1);
  await Promise.all(requests.map(item => executeResearchRun(actor(), item.sessionId, item.runId, { runtime: workRuntime })));
  expect((await db.researchRun.findUniqueOrThrow({ where: { id: requests[0]!.runId } })).status).toBe("COMPLETED");
  await createAndReopen(requests[0]!.sessionId, requests[0]!.runId, "A");
});
it("B different works → account synthesis → reference → save/reopen; failure retry preserves history", async () => {
  const work = await startWorkDeepResearch(actor(), accountId, workIds[1]!, { requestKey: randomUUID() });
  await executeResearchRun(actor(), work.sessionId, work.runId, { runtime: workRuntime });
  const submissions = await Promise.all([1, 2].map(() => startAccountV2Research(actor(), accountId, { requestKey: randomUUID() })));
  expect(new Set(submissions.map(item => item.runId)).size).toBe(1);
  const first = submissions[0]!;
  await executeResearchRun(actor(), first.sessionId, first.runId, { runtime: { ...accountRuntime, provider: new MockLLMProvider(() => { throw Error("controlled fixture failure"); }) } });
  expect((await db.researchRun.findUniqueOrThrow({ where: { id: first.runId } })).status).toBe("FAILED");
  const retry = await startAccountV2Research(actor(), accountId, { requestKey: randomUUID() });
  await executeResearchRun(actor(), retry.sessionId, retry.runId, { runtime: accountRuntime });
  expect((await db.researchRun.findUniqueOrThrow({ where: { id: retry.runId } })).status).toBe("COMPLETED");
  await createAndReopen(retry.sessionId, retry.runId, "B");
});
it("C free question with material → dynamic sections → reference → save/reopen; empty material guarded", async () => {
  const material = await db.sourceItem.findFirstOrThrow({ where: { workspaceId }, select: { id: true } });
  const key = randomUUID();
  const session = await createResearchSession(actor(), { title: "怎样把自己的专业知识讲清楚？", entryTemplate: "DIRECT", requestKey: key });
  const submissions = await Promise.all([1, 2].map(() => reserveResearchRun(actor(), session.id, { question: "可以从什么问题和角度展开？", requestKey: key, scope: { materialIds: [material.id] } })));
  expect(new Set(submissions.map(item => item.run.id)).size).toBe(1);
  await executeResearchRun(actor(), session.id, submissions[0]!.run.id, { runtime: topicRuntime });
  expect((await db.researchRun.findUniqueOrThrow({ where: { id: submissions[0]!.run.id } })).status).toBe("COMPLETED");
  await createAndReopen(session.id, submissions[0]!.run.id, "C");
  const empty = await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId: randomUUID(), title: "只有标题", url: "https://example.test/empty", metadata: {} } });
  await expect(startWorkDeepResearch(actor(), accountId, empty.id, { requestKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
});
