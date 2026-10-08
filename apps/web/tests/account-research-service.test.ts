import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider, LLMError } from "@content-center/providers";
import { startAccountResearch } from "../server/research/account-research-service";
import { executeResearchRun, saveResearchResult } from "../server/research/service";
import { getResearchResult, getResearchReadableContent } from "../server/research/read-model";
import { parseAccountResearchState } from "../server/research/account-research-contract";
import { accountResearchFixture } from "./account-research-fixture";
import { shareResearchRunToProject } from "../server/research/sharing";

describe("living account research versions", () => {
  const suffix = randomUUID(); const owner = `living-owner-${suffix}`; const viewer = `living-viewer-${suffix}`;
  let workspaceId = ""; let accountId = ""; let firstRunId = ""; let sessionId = ""; let originalCoverage: unknown; let calls = 0;
  const workIds: string[] = []; const actor = () => ({ workspaceId, userId: owner });
  const prompts: Array<Parameters<typeof accountResearchFixture>[0]> = [];
  const runtime = { provider: new MockLLMProvider(({ prompt }) => { calls++; const input = JSON.parse(prompt); prompts.push(input); return accountResearchFixture(input); }), providerName: "FIXTURE", model: "account-research-fixture", mode: "FIXTURE" as const };
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Living research test", slug: suffix, members: { create: [{ userId: owner, role: "OWNER" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    accountId = (await db.benchmarkAccount.create({ data: { workspaceId, createdById: owner, name: "证据更新测试账号", platform: "DOUYIN", externalAccountId: suffix } })).id;
    for (let i = 0; i < 20; i++) {
      const externalId = `${suffix}-${i}`;
      workIds.push((await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: accountId, platform: "DOUYIN", externalId, title: `怎样核对真实问题${i}`, url: "https://example.test/work", publishedAt: new Date(Date.UTC(2026, 8, 25 - i)), metadata: { metrics: { likes: i * 10, comments: null } } } })).id);
      if (i < 5) await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourcePlatform: "DOUYIN", externalId, sourceType: "TEXT", rawText: "先记录真实问题，再用自己的案例解释，最后邀请读者检查证据。", status: "READY" } });
    }
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [owner, viewer] } } }); await db.$disconnect(); });
  it("accepts 20 records / 5 bodies, reserves once concurrently, and persists exact evidence", async () => {
    const requestKey = randomUUID();
    const reservations = await Promise.all([startAccountResearch(actor(), accountId, { requestKey }), startAccountResearch(actor(), accountId, { requestKey })]);
    expect(new Set(reservations.map(item => item.runId)).size).toBe(1); expect(reservations.filter(item => item.created)).toHaveLength(1);
    const reservation = reservations[0]!; sessionId = reservation.sessionId; firstRunId = reservation.runId;
    await Promise.all([executeResearchRun(actor(), sessionId, firstRunId, { runtime }), executeResearchRun(actor(), sessionId, firstRunId, { runtime })]);
    expect(calls).toBe(1);
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: firstRunId } });
    expect(run.status, run.errorMessage || undefined).toBe("COMPLETED");
    const state = parseAccountResearchState(run.coverage)!;
    expect(state.evidence.works).toHaveLength(20); expect(state.workAnalyses.filter(item => item.basis === "TEXT")).toHaveLength(5); expect(state.workAnalyses.filter(item => item.basis === "TITLE")).toHaveLength(15);
    expect(state.answer?.templates.length).toBeGreaterThan(0); expect(state.answer?.commentInsights).toEqual([]);
    originalCoverage = run.coverage;
    await saveResearchResult(actor(), sessionId, firstRunId);
  });
  it("does not pay for unchanged evidence even with a new request id", async () => {
    const reservation = await startAccountResearch(actor(), accountId, { requestKey: randomUUID() });
    expect(reservation).toMatchObject({ runId: firstRunId, created: false, unchanged: true });
    expect(calls).toBe(1); expect(await db.researchRun.count({ where: { sessionId } })).toBe(1);
  });
  it("reuses the same evidence when the page makes the historical range explicit", async () => {
    const reservation = await startAccountResearch(actor(), accountId, { requestKey: randomUUID(), collectionRunId: "history" });
    expect(reservation).toMatchObject({ runId: firstRunId, created: false, unchanged: true });
    expect(calls).toBe(1);
    expect(await db.researchRun.count({ where: { sessionId } })).toBe(1);
  });
  it("updates 5 to 13 bodies by analyzing only the 8 changed works and keeps history immutable", async () => {
    for (let i = 5; i < 13; i++) await db.sourceItem.create({ data: { workspaceId, createdById: owner, sourcePlatform: "DOUYIN", externalId: `${suffix}-${i}`, sourceType: "TEXT", rawText: "先记录真实问题，再用自己的案例解释，最后邀请读者检查证据。", status: "READY" } });
    const next = await startAccountResearch(actor(), accountId, { requestKey: randomUUID() });
    await executeResearchRun(actor(), sessionId, next.runId, { runtime });
    const run = await db.researchRun.findUniqueOrThrow({ where: { id: next.runId } });
    expect(run.status, run.errorMessage || undefined).toBe("COMPLETED"); expect(next.version).toBe(2); expect(calls).toBe(2);
    const state = parseAccountResearchState(run.coverage)!;
    expect(state.delta).toMatchObject({ previousTextCount: 5, currentTextCount: 13 }); expect(state.analyzedRefs).toHaveLength(8); expect(state.reusedRefs).toHaveLength(12); expect(prompts.at(-1)?.analyzeWorks).toHaveLength(8);
    expect(state.workAnalyses.filter(item => item.basis === "TEXT")).toHaveLength(13);
    expect((await getResearchResult(actor(), firstRunId)).coverage).toEqual(originalCoverage);
    await saveResearchResult(actor(), sessionId, next.runId);
  });
  it("keeps missing comments and metrics honest, and a saved result becomes a Project Artifact", async () => {
    const run = await db.researchRun.findFirstOrThrow({ where: { sessionId, status: "COMPLETED" }, orderBy: { version: "desc" } });
    const state = parseAccountResearchState(run.coverage)!; expect(state.evidence.comments).toEqual([]);
    expect(state.evidence.works.every(work => work.metrics.views === null && work.metrics.comments === null)).toBe(true);
    const project = await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "研究成果交接" } });
    const artifact = await shareResearchRunToProject(actor(), run.id, project.id);
    const readable = await getResearchReadableContent(actor(), run.id);
    expect(readable.text).toContain("可复用内容模板"); expect(readable.evidenceFingerprint).toBe(state.evidence.fingerprint);
    await expect(getResearchReadableContent({ workspaceId, userId: viewer }, run.id)).rejects.toMatchObject({ status: 404 });
    expect(artifact.content).toContain("可复用内容模板"); expect(artifact.content).toContain("自己的证据");
    await expect(startAccountResearch({ workspaceId, userId: viewer }, accountId, { requestKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(startAccountResearch(actor(), "another-account", { requestKey: randomUUID() })).rejects.toMatchObject({ status: 404 });
    await expect(getResearchResult({ workspaceId, userId: viewer }, run.id)).rejects.toMatchObject({ status: 404 });
  });
  it("retries one rejected model response with validation feedback and keeps evidence checks", async () => {
    await db.benchmarkContentSnapshot.update({ where: { id: workIds[1]! }, data: { title: "结构修复测试标题" } });
    const reservation = await startAccountResearch(actor(), accountId, { requestKey: randomUUID() });
    let attempts = 0;
    const correcting = { ...runtime, provider: new MockLLMProvider(({ prompt }) => {
      attempts++;
      if (attempts === 1) throw new LLMError("LLM_INVALID_RESPONSE", "schema mismatch", false, { validationIssues: [{ path: "workAnalyses.0.progression", code: "too_big", receivedType: "array" }] });
      const input = JSON.parse(prompt); expect(input.correction[0].path).toBe("workAnalyses.0.progression");
      return accountResearchFixture(input);
    }) };
    await executeResearchRun(actor(), sessionId, reservation.runId, { runtime: correcting });
    expect(attempts).toBe(2);
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: reservation.runId } })).status).toBe("COMPLETED");
    expect((await getResearchResult(actor(), firstRunId)).coverage).toEqual(originalCoverage);
  });
  it("preserves saved history after provider failure and allows a fresh retry", async () => {
    await db.benchmarkContentSnapshot.update({ where: { id: workIds[0]! }, data: { title: "更新后的真实标题" } });
    const failed = await startAccountResearch(actor(), accountId, { requestKey: randomUUID() });
    const failing = { ...runtime, provider: new MockLLMProvider(() => { throw new Error("provider unavailable"); }) };
    await executeResearchRun(actor(), sessionId, failed.runId, { runtime: failing });
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: failed.runId } })).status).toBe("FAILED");
    expect((await getResearchResult(actor(), firstRunId)).coverage).toEqual(originalCoverage);
    const retry = await startAccountResearch(actor(), accountId, { requestKey: randomUUID() });
    expect(retry.created).toBe(true); expect(retry.runId).not.toBe(failed.runId);
    await executeResearchRun(actor(), sessionId, retry.runId, { runtime });
    expect((await db.researchRun.findUniqueOrThrow({ where: { id: retry.runId } })).status).toBe("COMPLETED");
  });

});
