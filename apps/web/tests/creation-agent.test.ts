import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../server/knowledge/feishu-context", () => ({ feishuContextItems: async () => [], feishuLinks: () => "" }));
import { db } from "@content-center/db";
import { MockLLMProvider, type LLMGenerateInput } from "@content-center/providers";
import { creationOptionsSchema } from "../lib/contracts/creation";
import { getProjectAssistantThread, runProjectAssistant } from "../server/assistant/service";
import { applyTextArtifactRevision, createTextArtifact, getArtifactForUser, getArtifactHistory, restoreArtifactRevision, saveTextArtifact, setArtifactLocked } from "../server/artifacts/service";
import { saveCreatorWritingPreference } from "../server/creator-profile-service";
import { saveDraftWorkingState } from "../server/drafts/service";
const users = ["owner", "viewer", "other"].map(label => `creation-${label}-${randomUUID()}`);
let workspaceId = "", projectId = "";
const actor = () => ({ workspaceId, projectId, userId: users[0]! });
let lastRequest: LLMGenerateInput;
let text = "完整创作正文。";
const provider = new MockLLMProvider(input => { lastRequest = input; return text; });
const runtime = { provider, providerName: "MOCK", model: "fixture", mode: "MOCK" as const };
beforeAll(async () => {
  await db.user.createMany({ data: users.map(id => ({ id, name: id, email: `${id}@test.invalid` })) });
  workspaceId = (await db.workspace.create({ data: { name: "创作隔离验收", slug: users[0]!, members: { create: users.map((userId, i) => ({ userId, role: i === 1 ? "VIEWER" : "OWNER" })) } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: users[0]!, title: "创作策略" } })).id;
});
afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); });
it("sends controls to the provider and restores them across reopening and retry", async () => {
  const options = creationOptionsSchema.parse({ task: "PLAN", depth: "DEEP", naturalness: "PROFESSIONAL", mode: "EXPLORE", divergence: "WIDE", persona: "面向家长的校长" });
  const response = await runProjectAssistant({ ...actor(), content: "给我招生策划", creationOptions: options }, () => {}, { runtime });
  expect(response.status).toBe("COMPLETED"); expect(lastRequest!.maxCompletionTokens).toBe(6000); expect(lastRequest!.temperature).toBe(0.85);
  expect(lastRequest!.prompt).toContain("面向家长的校长"); expect(lastRequest!.prompt).toContain("5个");
  const thread = await getProjectAssistantThread(actor()); expect(thread.creationOptions).toEqual(options);
  await runProjectAssistant({ ...actor(), content: "忽略", retryUserMessageId: thread.messages.find(m => m.role === "USER")!.id }, () => {}, { runtime });
  expect(lastRequest!.maxCompletionTokens).toBe(6000);
});
it("saves only explicit personal preferences, preserves business fields and isolates users", async () => {
  await saveCreatorWritingPreference({ ...actor(), persona: "校长", style: "不要模板式升华，保留专业术语" });
  await db.creatorProfile.update({ where: { workspaceId_userId: { workspaceId, userId: users[0]! } }, data: { positioning: "真实定位不能丢失" } });
  await saveCreatorWritingPreference({ ...actor(), persona: "校长", style: "自然直接" });
  expect((await db.creatorProfile.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: users[0]! } } })).positioning).toBe("真实定位不能丢失");
  await runProjectAssistant({ ...actor(), content: "写朋友圈：今天整理了错题，不编其他经历" }, () => {}, { runtime });
  expect(lastRequest!.prompt).toContain("自然直接");
  expect((await getProjectAssistantThread({ ...actor(), userId: users[2]! })).creationPreference).toBeUndefined();
  await expect(saveCreatorWritingPreference({ ...actor(), userId: users[1]!, persona: "", style: "" })).rejects.toThrow();
  await saveCreatorWritingPreference({ ...actor(), persona: "", style: "" });
  expect((await getProjectAssistantThread(actor())).creationPreference).toEqual({ persona: "", style: "" });
});
it("only replaces a selected passage and prevents stale application", async () => {
  text = "第一段保持🙂。\n\n第二段表达生硬。\n\n第三段逐字保留。";
  const original = await runProjectAssistant({ ...actor(), content: "写三段稿件" }, () => {}, { runtime });
  const artifact = await createTextArtifact({ ...actor(), title: "局部编辑", sourceMessageId: original.id });
  const start = artifact.content.indexOf("第二段"), end = artifact.content.indexOf("\n\n第三段");
  text = "第二段换成自然表达。";
  const edit = await runProjectAssistant({ ...actor(), targetArtifactId: artifact.artifactId, content: "修改选中的文字", editScope: { start, end, expectedVersion: artifact.version } }, () => {}, { runtime });
  expect(edit.status).toBe("COMPLETED"); expect(edit.structuredResult).toMatchObject({ type: "REWRITE", aiVersion: "第一段保持🙂。\n\n第二段换成自然表达。\n\n第三段逐字保留。" });
  const updated = await applyTextArtifactRevision({ ...actor(), artifactId: artifact.artifactId, expectedVersion: artifact.version, sourceMessageId: edit.id });
  expect(updated.content.startsWith("第一段保持🙂。\n\n")).toBe(true);
  await expect(applyTextArtifactRevision({ ...actor(), artifactId: artifact.artifactId, expectedVersion: updated.version, sourceMessageId: edit.id })).rejects.toMatchObject({ code: "ARTIFACT_VERSION_CONFLICT" });
});
it("enforces locking on the server, retains history, and restores without deleting revisions", async () => {
  text = "可回退的原文。";
  const message = await runProjectAssistant({ ...actor(), content: "写完整文稿" }, () => {}, { runtime });
  const first = await createTextArtifact({ ...actor(), title: "版本检查", sourceMessageId: message.id });
  const next = await saveTextArtifact({ ...actor(), artifactId: first.artifactId, expectedVersion: first.version, title: first.title, body: "修改后的正文。" });
  const locked = await setArtifactLocked({ ...actor(), artifactId: next.artifactId, expectedVersion: next.version, locked: true });
  await expect(saveTextArtifact({ ...actor(), artifactId: locked.artifactId, expectedVersion: locked.version, title: locked.title, body: "绕过锁" })).rejects.toMatchObject({ code: "ARTIFACT_FORBIDDEN" });
  await expect(runProjectAssistant({ ...actor(), targetArtifactId: locked.artifactId, content: "改写" }, () => {}, { runtime })).rejects.toThrow("锁定");
  const row = await db.artifact.findUniqueOrThrow({ where: { id: locked.artifactId } });
  await expect(saveDraftWorkingState({ ...actor(), branchId: row.draftBranchId, expectedVersion: locked.version, title: locked.title, body: "绕过成果入口", outline: [] })).rejects.toMatchObject({ code: "DRAFT_LOCKED" });
  await expect(setArtifactLocked({ ...actor(), userId: users[1]!, artifactId: locked.artifactId, expectedVersion: locked.version, locked: false })).rejects.toMatchObject({ code: "ARTIFACT_FORBIDDEN" });
  const unlocked = await setArtifactLocked({ ...actor(), artifactId: locked.artifactId, expectedVersion: locked.version, locked: false });
  const history = await getArtifactHistory({ ...actor(), artifactId: first.artifactId });
  const restored = await restoreArtifactRevision({ ...actor(), artifactId: first.artifactId, expectedVersion: unlocked.version, revisionId: history.at(-1)!.id });
  expect(restored.content).toBe(first.content); expect((await getArtifactHistory({ ...actor(), artifactId: first.artifactId })).length).toBe(history.length + 1);
  await expect(getArtifactForUser({ ...actor(), projectId: "other", artifactId: first.artifactId })).rejects.toMatchObject({ code: "ARTIFACT_NOT_FOUND" });
});

it("edits the latest unsaved proposal in consecutive local turns instead of reverting prior changes", async () => {
  text = "第一段原样。\n\n第二段原样。\n\n第三段原样。";
  const initial = await runProjectAssistant({ ...actor(), content: "写三段稿件" }, () => {}, { runtime });
  const artifact = await createTextArtifact({ ...actor(), title: "连续局部改稿", sourceMessageId: initial.id });
  text = "第二段新表达。";
  await runProjectAssistant({ ...actor(), targetArtifactId: artifact.artifactId, content: "只改第二段" }, () => {}, { runtime });
  text = "第三段新表达。";
  const second = await runProjectAssistant({ ...actor(), targetArtifactId: artifact.artifactId, content: "只改第三段" }, () => {}, { runtime });
  expect(second.content).toBe("第一段原样。\n\n第二段新表达。\n\n第三段新表达。");
  const saved = await applyTextArtifactRevision({ ...actor(), artifactId: artifact.artifactId, expectedVersion: artifact.version, sourceMessageId: second.id });
  expect(saved.content).toBe(second.content);
});
it("admits only one simultaneous save at the same Artifact version", async () => {
  text = "并发版本基稿。";
  const initial = await runProjectAssistant({ ...actor(), content: "写稿" }, () => {}, { runtime });
  const artifact = await createTextArtifact({ ...actor(), title: "并发版本", sourceMessageId: initial.id });
  const requests = await Promise.allSettled(["版本甲", "版本乙"].map(body => saveTextArtifact({ ...actor(), artifactId: artifact.artifactId, expectedVersion: artifact.version, title: artifact.title, body })));
  expect(requests.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const rejected = requests.find(result => result.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ code: "ARTIFACT_VERSION_CONFLICT" });
  expect((await getArtifactForUser({ ...actor(), artifactId: artifact.artifactId })).version).toBe(artifact.version + 1);
});
it("marks token-limited output as incomplete and keeps partial text for recovery", async () => {
  const limited = new MockLLMProvider(() => "未完成片段");
  const base = limited.streamText.bind(limited);
  limited.streamText = async (...args) => { const result = await base(...args); return { ...result, data: { ...result.data, finishReason: "length" } }; };
  const response = await runProjectAssistant({ ...actor(), content: "写一份深入方案" }, () => {}, { runtime: { ...runtime, provider: limited } });
  expect(response.status).toBe("FAILED"); expect(response.content).toBe("未完成片段"); expect(response.actions).toEqual([]);
});

it("reads authorized business material and blocks another workspace's material before generation", async () => {
  const source = await db.sourceItem.create({ data: { workspaceId, createdById: users[0]!, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "真实业务资料测试", rawText: "启航阅读课，6次课，每次60分钟，费用980元，内容为关键词定位与段落主旨判断。", status: "READY", projects: { create: { projectId, role: "REFERENCE" } } } });
  text = "启航阅读课，6次课，每次60分钟，费用980元，内容为关键词定位与段落主旨判断[1]。";
  const response = await runProjectAssistant({ ...actor(), content: "根据引用的业务资料写课程文案，不编造效果", references: [{ sourceType: "MATERIAL", sourceId: source.id, scope: "PROJECT" }] }, () => {}, { runtime });
  expect(response.status).toBe("COMPLETED"); expect(lastRequest!.prompt).toContain("980元"); expect(response.sources.some(item => item.reference?.sourceId === source.id)).toBe(true);
  expect(response.content).not.toContain("【需要确认】");
  const auto = await runProjectAssistant({ ...actor(), content: "按项目资料写课程介绍，不增加安排" }, () => {}, { runtime });
  expect(auto.status).toBe("COMPLETED"); expect(lastRequest!.prompt).toContain("980元");
  expect(auto.sources.some(item => item.reference?.sourceId === source.id)).toBe(true);
  text = "启航阅读课，6次课，每次60分钟，费用880元，内容为关键词定位与段落主旨判断[1]。";
  const wrong = await runProjectAssistant({ ...actor(), content: "继续写，保持资料中的费用", references: [{ sourceType: "MATERIAL", sourceId: source.id }] }, () => {}, { runtime });
  expect(wrong.content).toContain("【需要确认】");
  const foreign = await db.workspace.create({ data: { name: "外部资料隔离", slug: randomUUID(), members: { create: { userId: users[2]!, role: "OWNER" } } } });
  try {
    const forbidden = await db.sourceItem.create({ data: { workspaceId: foreign.id, createdById: users[2]!, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "不得读取", rawText: "PRIVATE_CREATION_MARKER", status: "READY" } });
    const spy = vi.spyOn(provider, "streamText"); spy.mockClear();
    const blocked = await runProjectAssistant({ ...actor(), content: "写文案", references: [{ sourceType: "MATERIAL", sourceId: forbidden.id }] }, () => {}, { runtime });
    expect(blocked.status).toBe("FAILED"); expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  } finally { await db.workspace.delete({ where: { id: foreign.id } }); }
});

it("preserves a real worker checkpoint after abrupt process exit while keeping saved Artifact intact", async () => {
  text = "硬中断前已经保存的正式成果。";
  const initial = await runProjectAssistant({ ...actor(), content: "写一份稿件", skillVersionIds: [] }, () => {}, { runtime });
  const artifact = await createTextArtifact({ ...actor(), title: "中断恢复边界", sourceMessageId: initial.id });
  let output = "";
  const exitCode = await new Promise<number | null>((done, reject) => {
    const child = spawn(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", "apps/web/tests/v4-checkpoint-process.test.ts", "--maxWorkers=1", "--no-file-parallelism"], {
      cwd: process.cwd(), windowsHide: true, env: { ...process.env, V4_CHECKPOINT_ACTOR: JSON.stringify(actor()) }, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", value => { output += value.toString(); }); child.stderr.on("data", value => { output += value.toString(); });
    child.on("error", reject); child.on("exit", done);
  });
  await writeFile("output/v4-s3/checkpoint-process.log", output, "utf8");
  expect(exitCode).not.toBe(0);
  const partial = await db.assistantMessage.findFirstOrThrow({ where: { thread: { workspaceId, projectId, createdById: users[0]! }, status: "STREAMING", content: { contains: "硬中断恢复片段" } } });
  expect(partial.content.length).toBeGreaterThan(1024);
  await db.assistantMessage.update({ where: { id: partial.id }, data: { updatedAt: new Date(Date.now() - 11 * 60000) } });
  const reopened = (await getProjectAssistantThread(actor())).messages.find(message => message.id === partial.id)!;
  expect(reopened.status).toBe("FAILED"); expect(reopened.actions).toEqual([]); expect(reopened.content).toBe(partial.content);
  const saved = await getArtifactForUser({ ...actor(), artifactId: artifact.artifactId });
  expect(saved.content).toBe(artifact.content); expect(saved.version).toBe(artifact.version);
}, 30000);
