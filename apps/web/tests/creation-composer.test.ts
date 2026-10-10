import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { createProject } from "../server/project-service";
import { getCreationModels, validateCreationModel } from "../server/creation/models";
import { loadCreationSources } from "../server/creation/sources";
import { loadLLMRuntime } from "../server/ai/llm-runtime";
import { AIControlService } from "../server/ai/control/ai-control-service";
import { ModelRouter } from "../server/ai/control/model-router";
import { runProjectAssistant } from "../server/assistant/service";
import { IntegrationService } from "@content-center/integrations";
import { ContextBuilderV2 } from "../server/ai/control/context-builder-v2";
import { setProjectMethodSelections } from "../server/project-methods/service";

describe("creation composer selections", () => {
  const userId = `composer-${randomUUID()}`;
  let workspaceId = ""; let sourceId = ""; let methodVersionId = ""; let folderId = "";
  beforeAll(async () => {
    if (process.env.ENVIRONMENT_ID !== "LOCAL_TEST") throw new Error("LOCAL_TEST required");
    await db.user.create({ data: { id: userId, name: "Composer", email: `${userId}@example.test` } });
    workspaceId = (await db.workspace.create({ data: { name: "Composer", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
    await db.integrationConfig.create({ data: { workspaceId, provider: "LLM", configured: true, status: "CONFIGURED", publicConfig: { provider: "DEEPSEEK", modelId: "deepseek-flash", baseUrl: "https://api.deepseek.com" } } });
    sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: "真实附件", sourceType: "TEXT", sourcePlatform: "GENERIC", status: "PENDING", rawText: "附件正文：课程反馈应当记录可核验的学习过程。" } })).id;
    const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "SAVED" } });
    methodVersionId = (await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title: "自然表达", steps: ["使用短句，保留真实资料依据。"], applicableScenarios: ["文案"], boundaries: ["不编造数据"], evidence: [], editedById: userId } })).id;
    folderId = (await db.projectFolder.create({ data: { workspaceId, userId, name: "课程项目" } })).id;
  });
  afterAll(async () => { await db.workspace.delete({ where: { id: workspaceId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });
  it("creates, edits and executes zero or multiple authorized Skills without dropping selections", async () => {
    const second = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "SAVED" } });
    const version = await db.methodVersion.create({ data: { assetId: second.id, version: 1, title: "结构检查", steps: ["保留依据，检查段落衔接。"], applicableScenarios: ["文案"], boundaries: ["不增加事实"], evidence: [], editedById: userId } });
    const ids = [methodVersionId, version.id];
    const project = await createProject({ workspaceId, userId, title: "可组合技能", methodVersionIds: ids });
    const actor = { workspaceId, userId, projectId: project.id };
    const build = (skillVersionIds?: string[]) => new ContextBuilderV2().build({ ...actor, taskType: "GENERAL_QUERY", action: "PROJECT_ASSISTANT", userInput: "整理现有内容", skillVersionIds });
    const selected = await build();
    expect(selected?.manifest.methodVersions.map(item => item.versionId).sort()).toEqual([...ids].sort());
    expect(selected?.manifest.items.filter(item => item.objectType === "METHOD_VERSION")).toHaveLength(2);
    const empty = await build([]);
    expect(empty?.manifest.methodVersions).toEqual([]);
    expect(empty?.defaultMethod).toBeNull();
    await setProjectMethodSelections({ ...actor, methodVersionIds: [] });
    expect((await build())?.manifest.methodVersions).toEqual([]);
    await setProjectMethodSelections({ ...actor, methodVersionIds: ids });
    expect((await build(ids))?.manifest.methodVersions).toHaveLength(2);
    await expect(build(["foreign-version"])).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(build(["one", "two", "three", "four"])).rejects.toMatchObject({ code: "NO_CONTEXT" });
  });
  it("returns only current provider models and rejects foreign models", async () => {
    const options = await getCreationModels(workspaceId);
    expect(options.models.every((item) => item.provider === "DEEPSEEK")).toBe(true);
    expect(options.defaultModelId).toBe("deepseek-flash");
    expect(JSON.stringify(options)).not.toMatch(/apiKey|encryptedConfig/u);
    await expect(validateCreationModel(workspaceId, { provider: "KIMI", modelId: "kimi-k2.6" })).rejects.toThrow("不可用");
    await expect(validateCreationModel(workspaceId, { provider: "DEEPSEEK", modelId: "unregistered" })).rejects.toThrow("不可用");
  });
  it("requires real content instead of trusting READY and isolates source status", async () => {
    expect((await loadCreationSources(workspaceId, [sourceId], userId))[0]?.state).toBe("READY");
    const video = await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: "待转写", sourceType: "VIDEO", sourcePlatform: "GENERIC", status: "READY" } });
    expect((await loadCreationSources(workspaceId, [video.id], userId))[0]?.state).toBe("FAILED");
    expect((await loadCreationSources("another-workspace", [sourceId], userId))[0]?.state).toBe("FAILED");
    await expect(createProject({ workspaceId, userId, title: "Not ready", sourceItemIds: [video.id], methodVersionIds: [] })).rejects.toThrow("尚未读好");
  });
  it("does not revive an archived Material through the readable-content adapter", async () => {
    const archived = await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: "已归档资料", sourceType: "TEXT", sourcePlatform: "GENERIC", rawText: "不应进入新的创作请求", status: "ARCHIVED" } });
    expect((await loadCreationSources(workspaceId, [archived.id], userId))[0]).toMatchObject({ state: "FAILED", text: "" });
    await expect(createProject({ workspaceId, userId, title: "Archived", sourceItemIds: [archived.id] })).rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
  });
  it("atomically carries the folder, skill version, source and selected model into the first run", async () => {
    const modelSelection = { provider: "DEEPSEEK" as const, modelId: "deepseek-v4-pro" };
    const input = { workspaceId, userId, title: "课程介绍文案", sourceItemIds: [sourceId], folderId, methodVersionIds: [methodVersionId], modelSelection, clientRequestId: randomUUID() };
    const project = await createProject(input);
    expect((await createProject(input)).id).toBe(project.id);
    await expect(createProject({ ...input, modelSelection: null })).rejects.toMatchObject({ code: "PROJECT_CONFLICT" });
    expect(await db.userProjectPreference.findFirst({ where: { projectId: project.id, userId } })).toMatchObject({ folderId });
    expect(await db.projectMethodSelection.findFirst({ where: { projectId: project.id } })).toMatchObject({ methodVersionId });
    let prompt = "";
    const provider = new MockLLMProvider((request) => { prompt = request.prompt; return "向家长介绍课程时，先讲清楚学习过程怎样被记录，再说明老师如何提供反馈。内容应基于真实资料，不应虚构成果。"; });
    const router = new ModelRouter(async (_workspace, selection) => ({ provider, providerName: "DEEPSEEK", model: selection!.modelId, requestedModel: selection!.modelId, mode: "REAL" }));
    const reply = await runProjectAssistant({ workspaceId, userId, projectId: project.id, content: "写一篇关于课程价值的文案", sourceItemIds: [sourceId], skillVersionId: methodVersionId, modelSelection }, () => undefined, { controlService: new AIControlService({ modelRouter: router }) });
    expect(reply.status).toBe("COMPLETED");
    expect(prompt).toContain("课程反馈应当记录可核验的学习过程");
    expect(prompt).toContain("自然表达");
    const saved = await db.assistantMessage.findUniqueOrThrow({ where: { id: reply.id }, include: { aiRun: true } });
    expect(saved.aiRun?.metadata).toMatchObject({ modelRoute: { selectedModel: "deepseek-v4-pro" } });
    expect((await getCreationModels(workspaceId)).defaultModelId).toBe("deepseek-flash");
  });
  it("constructs an overridden runtime without changing stored provider settings", async () => {
    // Constructs an adapter against a mocked config; no request is sent.
    vi.stubEnv("EXTERNAL_CALLS_DISABLED", "false");
    vi.stubEnv("LOCAL_REVIEW_OFFLINE", "false");
    try {
    const service = new IntegrationService();
    vi.spyOn(service, "getDecryptedIntegrationConfig").mockResolvedValue({ provider: "DEEPSEEK", model: "deepseek-flash", baseUrl: "https://api.deepseek.com", apiKey: "local-test-only" });
    const runtime = await loadLLMRuntime(workspaceId, service, { provider: "DEEPSEEK", modelId: "deepseek-v4-pro" });
    expect(runtime.model).toBe("deepseek-v4-pro");
    await expect(loadLLMRuntime(workspaceId, service, { provider: "KIMI", modelId: "kimi-k2.6" })).rejects.toThrow("不可用");
    } finally { vi.unstubAllEnvs(); }
  });
});
