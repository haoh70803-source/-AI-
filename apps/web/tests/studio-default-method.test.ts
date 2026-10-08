import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { LLMError, MockLLMProvider } from "@content-center/providers";
import { applyAIResult, runAIAction } from "../server/ai/ai-run-service";
import { ProjectContextBuilder } from "../server/ai/project-context";
import { rewriteOpeningProviderSchema, STUDIO_QUICK_ACTIONS } from "../server/ai/schemas";
import { defaultContentMethodMinimumItems, defaultContentMethodSectionCodes } from "../server/default-content-method/schemas";
import { getCreatorMethodsOverview } from "../server/creator-methods/service";
import { getCreationFeedbackContext } from "../server/creation-feedback/service";
import { setProjectMethodSelections } from "../server/project-methods/service";
import { applyStudioQuickAction, runStudioQuickAction } from "../server/studio/quick-actions";

describe("published workspace default method in Studio", () => {
  const suffix = randomUUID();
  const userId = `studio-default-${suffix}`;
  const otherUserId = `studio-default-other-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";
  let otherProjectId = "";
  let privateMethodVersionId = "";
  let defaultAssetId = "";
  let defaultV1Id = "";
  const prompts: string[] = [];

  const sections = (suffixText = "V1") => defaultContentMethodSectionCodes.map((code) => ({ code, items: Array.from({ length: defaultContentMethodMinimumItems[code] }, (_, index) => ({ text: `${code} 可执行建议 ${suffixText} ${index + 1}`, sourceRefs: [{ type: "OWN_EXPERIENCE" as const, referenceId: `internal-${code}-${index}`, label: `内部依据 ${code}` }] })) }));
  const runtime = {
    provider: new MockLLMProvider((input) => {
      prompts.push(input.prompt);
      if (input.prompt.includes("Action: GENERATE_MOTHER_CONTENT")) return { recommendedAngle: "真实问题", alternativeAngles: ["另一个角度"], recommendedTitle: "默认方法生成稿", alternativeTitles: ["问题标题", "场景标题"], openingHook: "新的开头", outline: ["开头", "正文"], body: "新的开头\n\n新的正文", evidenceIds: [], sourceItemIds: [] };
      const action = STUDIO_QUICK_ACTIONS.find((value) => input.prompt.includes(`【本次任务】${value}`));
      if (action === "REWRITE_OPENING") return { summary: "已调整开头", suggestions: [{ title: "建议一", text: "建议使用这个安全表达。" }, { title: "建议二", text: "可以换成另一种安全表达。" }] };
      const replacementActions = ["REWRITE_BODY", "HUMANIZE_TEXT", "SHORTEN_TEXT", "ALTERNATIVE_EXPRESSION", "DEFAULT_METHOD_OPTIMIZE"];
      return { original: "模型不得决定原文", summary: `${action} 已形成建议`, suggestions: action === "FACT_CHECK" || replacementActions.includes(action ?? "") ? [] : [{ title: "建议一", text: "建议使用这个安全表达。" }, { title: "建议二", text: "可以换成另一种安全表达。" }], replacement: replacementActions.includes(action ?? "") ? "新的开头\n\n按默认方法优化后的正文" : null, risks: action === "FACT_CHECK" ? [{ text: "有一项事实需要确认", handling: "核对内部来源后再保留" }] : [] };
    }),
    providerName: "FIXTURE",
    model: "fixture",
    requestedModel: "fixture",
    mode: "FIXTURE" as const,
  };

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userId, name: "Studio Default", email: `${userId}@example.test` }, { id: otherUserId, name: "Studio Default Other", email: `${otherUserId}@example.test` }] });
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: "Studio Default", slug: `studio-default-${suffix}`, members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Studio Default Other", slug: `studio-default-other-${suffix}`, members: { create: { userId: otherUserId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id; otherWorkspaceId = other.id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "默认方法创作", audience: "教培老板", creativeBrief: { create: { workspaceId, topic: "真实经营问题", angle: "不要使用固定结构", audience: "教培老板", coreMessage: "先解决真实问题", keyPoints: [], structure: [], tone: "自然", risks: [], createdById: userId } }, motherContent: { create: { workspaceId, title: "原稿", body: "旧的开头\n\n旧的正文", outline: ["开头", "正文"], createdById: userId } } } })).id;
    otherProjectId = (await db.contentProject.create({ data: { workspaceId: other.id, createdById: otherUserId, title: "其他空间创作", motherContent: { create: { workspaceId: other.id, title: "其他原稿", body: "其他开头\n\n其他正文", outline: [], createdById: otherUserId } } } })).id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "私人方法来源", rawText: "私人方法依据", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "私人方法依据", segments: [] } } } });
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
    const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: userId, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
    const privateAsset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "CORE" } });
    privateMethodVersionId = (await db.methodVersion.create({ data: { assetId: privateAsset.id, version: 1, title: "我的补充方法", steps: ["优先使用个人表达"], applicableScenarios: [], boundaries: ["不能编事实"], sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [], editedById: userId } })).id;
    await setProjectMethodSelections({ workspaceId, userId, projectId, methodVersionIds: [privateMethodVersionId] });
    defaultAssetId = (await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, status: "CORE" } })).id;
    defaultV1Id = (await db.methodVersion.create({ data: { assetId: defaultAssetId, version: 1, title: "鑫世界默认创作方法", workspaceDefaultKey: "DEFAULT_CONTENT", steps: { kind: "WORKSPACE_DEFAULT_CONTENT_METHOD", schemaVersion: "workspace-default-content-method-v1", publicationStatus: "PUBLISHED", origin: "HUMAN", createdFromVersion: null, publishedAt: new Date().toISOString(), publishedById: userId, sections: sections() }, applicableScenarios: [], boundaries: [], evidence: [], editedById: userId } })).id;
  });

  afterAll(async () => {
    await db.methodAsset.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await db.$disconnect();
  });

  it("dry-runs selected methods and does not stack the default method", async () => {
    for (const studioAction of STUDIO_QUICK_ACTIONS) {
      const built = await new ProjectContextBuilder().build({ workspaceId, userId, projectId, action: "REWRITE_SELECTION", studioAction });
      expect(built.defaultMethod).toBeNull();
      expect(built.selectedMethods.map(({ methodVersionId }) => methodVersionId)).toEqual([privateMethodVersionId]);
      expect(built.skillResolution.activatedSkills.map(({ id }) => id)).toEqual([privateMethodVersionId]);
      expect(built.skillResolution.skippedSkills.map(({ id }) => id)).toEqual([defaultV1Id]);
      expect(JSON.stringify((built.context as { confirmedFacts?: string[] }).confirmedFacts ?? [])).not.toContain("可执行建议");
    }
    const mother = await new ProjectContextBuilder().build({ workspaceId, userId, projectId, action: "GENERATE_MOTHER_CONTENT" });
    expect(mother.defaultMethod).toBeNull();
    expect(mother.skillResolution.dryRun).toBe(true);
  });

  it("uses the default method as a fallback when no personal Skill is selected", async () => {
    await setProjectMethodSelections({ workspaceId, userId, projectId, methodVersionIds: [] });
    const built = await new ProjectContextBuilder().build({ workspaceId, userId, projectId, action: "GENERATE_MOTHER_CONTENT" });
    expect(built.defaultMethod?.versionId).toBe(defaultV1Id);
    expect(built.skillResolution.activatedSkills.map(({ id }) => id)).toEqual([defaultV1Id]);
    await setProjectMethodSelections({ workspaceId, userId, projectId, methodVersionIds: [privateMethodVersionId] });
  });

  it("keeps the general Project Assistant free of the default writing method", async () => {
    await setProjectMethodSelections({ workspaceId, userId, projectId, methodVersionIds: [] });
    const built = await new ProjectContextBuilder().build({ workspaceId, userId, projectId, action: "PROJECT_ASSISTANT" });
    expect(built.defaultMethod).toBeNull();
    expect(built.selectedMethods).toEqual([]);
    expect(built.skillResolution.activatedSkills).toEqual([]);
    expect(JSON.stringify(built.context)).not.toContain("鑫世界默认创作方法");
    expect(JSON.stringify(built.context)).not.toContain("ORAL_VIDEO_SCRIPT");
    expect(JSON.stringify(built.context)).not.toContain("ip-strategist");
    await setProjectMethodSelections({ workspaceId, userId, projectId, methodVersionIds: [privateMethodVersionId] });
  });

  it("automatically locks V1 usage for normal generation without polluting M5 or M6 personal methods", async () => {
    const before = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    const run = await runAIAction({ workspaceId, userId, projectId, action: "GENERATE_MOTHER_CONTENT", instruction: "今天使用故事结构" }, { runtime });
    expect(JSON.stringify(run.output)).toContain("新的正文");
    const usages = await db.methodUsage.findMany({ where: { aiRunId: run.id }, orderBy: { createdAt: "asc" }, select: { methodVersionId: true } });
    expect(usages.map(({ methodVersionId }) => methodVersionId)).toEqual([privateMethodVersionId]);
    await applyAIResult({ workspaceId, userId, projectId, runId: run.id, expectedVersion: before.version, confirmReplace: true });
    expect((await getCreatorMethodsOverview({ workspaceId, ownerUserId: userId })).all.map(({ current }) => current.title)).toEqual(["我的补充方法"]);
    expect((await getCreationFeedbackContext({ workspaceId, userId, projectId })).methods.map(({ title }) => title)).toEqual(["我的补充方法"]);
    expect(prompts.at(-1)).not.toContain("defaultContentMethod");
    expect(prompts.at(-1)).not.toContain("ip-strategist");
    expect(prompts.at(-1)).toContain("今天使用故事结构");
  });

  it("returns quick suggestions before applying and records the exact action and V1", async () => {
    const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    const run = await runStudioQuickAction({ workspaceId, userId, projectId, studioAction: "REWRITE_OPENING", instruction: "不要固定一种结构" }, { runtime });
    expect(run.canApply).toBe(true);
    expect(run.output.suggestions).toHaveLength(2);
    expect(run.output).toMatchObject({ original: mother.body.split("\n")[0], summary: "已调整开头", replacement: null, replacementFactState: null, risks: [], suggestions: expect.arrayContaining([expect.objectContaining({ factState: "CREATIVE_EXPRESSION" })]), factSafety: { removedSuggestions: 0, blockedReplacement: false } });
    expect((await db.motherContent.findUniqueOrThrow({ where: { projectId } })).body).toBe(mother.body);
    const stored = await db.aIRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.metadata).toMatchObject({ kind: "STUDIO_QUICK_ACTION", studioAction: "REWRITE_OPENING", resolver: { dryRun: true }, resolverDryRun: true });
    expect(stored.metadata).not.toHaveProperty("defaultMethodVersionId");
    expect((await db.methodUsage.findMany({ where: { aiRunId: run.id }, select: { methodVersionId: true } })).map(({ methodVersionId }) => methodVersionId)).toEqual([privateMethodVersionId]);
    const applied = await applyStudioQuickAction({ workspaceId, userId, projectId, runId: run.id, expectedVersion: mother.version, suggestionIndex: 0 });
    expect(applied.motherContent.body).toBe("建议使用这个安全表达。\n\n新的正文");
    expect(prompts.at(-1)).toContain("【用户明确要求】不要固定一种结构");
    expect(prompts.at(-1)).not.toContain("AUDIENCE 可执行建议");
    expect(prompts.at(-1)).not.toContain("TOPIC 可执行建议");
    expect(prompts.at(-1)).toContain('Return exactly {"summary":string,"suggestions":[{"title":string,"text":string}]}');
    expect(prompts.at(-1)).not.toContain('"original":string');
  });

  it("uses a strict opening-only provider contract", () => {
    expect(rewriteOpeningProviderSchema.safeParse({ summary: "已调整开头", suggestions: [{ title: "方向1", text: "开头一" }, { title: "方向2", text: "开头二" }] }).success).toBe(true);
    expect(rewriteOpeningProviderSchema.safeParse({ summary: "已调整开头", suggestions: [{ title: "方向1", text: "开头一" }] }).success).toBe(false);
    expect(rewriteOpeningProviderSchema.safeParse({ summary: "已调整开头", suggestions: [{ title: "方向1", text: "开头一", factState: "CREATIVE_EXPRESSION" }, { title: "方向2", text: "开头二" }] }).success).toBe(false);
    expect(rewriteOpeningProviderSchema.safeParse({ summary: "已调整开头", suggestions: [{ title: "", text: "开头一" }, { title: "方向2", text: "开头二" }] }).success).toBe(false);
  });

  it("keeps selected-text editing inside the Creation Context quick-action path", async () => {
    const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    const selectedText = "新的正文";
    const selectionStart = mother.body.indexOf(selectedText);
    const run = await runStudioQuickAction({ workspaceId, userId, projectId, studioAction: "ALTERNATIVE_EXPRESSION", selectedText, selectionStart, selectionEnd: selectionStart + selectedText.length }, { runtime });
    expect(run.output.original).toBe(selectedText);
    expect(prompts.at(-1)).toContain(`【当前处理文字】\n${selectedText}`);
    const stored = await db.aIRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(stored.metadata).toMatchObject({ kind: "STUDIO_QUICK_ACTION", studioAction: "ALTERNATIVE_EXPRESSION", contextVersion: "creation-context-v1", selectionStart, selectionEnd: selectionStart + selectedText.length, resolverDryRun: true });
    expect(stored.metadata).not.toHaveProperty("defaultMethodSections");
    const applied = await applyStudioQuickAction({ workspaceId, userId, projectId, runId: run.id, expectedVersion: mother.version });
    expect(applied.motherContent.body).toContain("建议使用这个安全表达。");
    expect(applied.motherContent.body).toContain("按默认方法优化后的正文");
    await expect(runStudioQuickAction({ workspaceId, userId, projectId, studioAction: "SHORTEN_TEXT", selectedText: "不存在的选区", selectionStart: 0, selectionEnd: 6 }, { runtime })).rejects.toMatchObject({ code: "QUICK_ACTION_STALE" });
  });

  it("persists only safe structured-output failure diagnostics", async () => {
    const sensitiveMarker = "RAW_MODEL_CONTENT_MUST_NOT_BE_STORED";
    const details = { providerRequestId: "fixture-failed-request", actualModel: "kimi-k2.6", finishReason: "stop", returnedRootKeys: ["openings"], returnedFirstLevelObjectKeys: { openings: ["copy", "name"] }, validationIssues: [{ path: "suggestions", code: "invalid_type", expected: "array", receivedType: "undefined" }], rawContent: sensitiveMarker };
    const failingRuntime = { ...runtime, provider: new MockLLMProvider(() => { throw new LLMError("LLM_INVALID_RESPONSE", "AI 模型返回的数据结构不符合要求。", false, details); }) };
    await expect(runStudioQuickAction({ workspaceId, userId, projectId, studioAction: "REWRITE_OPENING" }, { runtime: failingRuntime })).rejects.toMatchObject({ code: "LLM_INVALID_RESPONSE" });
    const failed = await db.aIRun.findFirstOrThrow({ where: { projectId, status: "FAILED" }, orderBy: { createdAt: "desc" } });
    const usage = await db.apiUsage.findFirstOrThrow({ where: { requestId: failed.id } });
    expect(failed.providerRequestId).toBe("fixture-failed-request");
    expect(failed.metadata).toMatchObject({ failureDetails: { providerRequestId: "fixture-failed-request", actualModel: "kimi-k2.6", finishReason: "stop", returnedRootKeys: ["openings"], returnedFirstLevelObjectKeys: { openings: ["copy", "name"] }, validationIssues: [expect.objectContaining({ path: "suggestions", receivedType: "undefined" })] } });
    expect(usage.providerRequestId).toBe("fixture-failed-request");
    expect(usage.metadata).toMatchObject({ failureDetails: { returnedRootKeys: ["openings"], validationIssues: [expect.objectContaining({ path: "suggestions" })] } });
    expect(JSON.stringify({ run: failed, usage })).not.toContain(sensitiveMarker);
  });

  it("keeps topic and fact checks as previews and does not silently overwrite the draft", async () => {
    const before = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    const topic = await runStudioQuickAction({ workspaceId, userId, projectId, studioAction: "TOPIC_IDEAS" }, { runtime });
    const fact = await runStudioQuickAction({ workspaceId, userId, projectId, studioAction: "FACT_CHECK" }, { runtime });
    expect(topic.canApply).toBe(false);
    expect(topic.output.suggestions).toHaveLength(2);
    expect(fact.canApply).toBe(false);
    expect(fact.output).toMatchObject({ summary: "当前未发现明显事实风险。", risks: [] });
    const controlledRuns = await db.aIRun.findMany({ where: { id: { in: [topic.id, fact.id] } }, select: { metadata: true } });
    expect(controlledRuns).toHaveLength(2);
    for (const controlledRun of controlledRuns) {
      expect(controlledRun.metadata).toMatchObject({ aiControlVersion: "ai-control-v1", contextVersion: "creation-context-v2", contextManifestRef: expect.stringMatching(/^airun-metadata:/), contextManifest: { schemaVersion: "ai-context-manifest-v1", project: { id: projectId } }, permissionDecision: "ALLOW" });
    }
    await expect(applyStudioQuickAction({ workspaceId, userId, projectId, runId: fact.id, expectedVersion: before.version })).rejects.toMatchObject({ code: "QUICK_ACTION_NOT_APPLICABLE" });
    expect((await db.motherContent.findUniqueOrThrow({ where: { projectId } })).body).toBe(before.body);
  });

  it("uses a later default version only when no personal Skill is selected", async () => {
    const v2Id = (await db.methodVersion.create({ data: { assetId: defaultAssetId, version: 2, title: "鑫世界默认创作方法", workspaceDefaultKey: "DEFAULT_CONTENT", steps: { kind: "WORKSPACE_DEFAULT_CONTENT_METHOD", schemaVersion: "workspace-default-content-method-v1", publicationStatus: "PUBLISHED", origin: "HUMAN", createdFromVersion: 1, publishedAt: new Date().toISOString(), publishedById: userId, sections: sections("V2") }, applicableScenarios: [], boundaries: [], evidence: [], editedById: userId } })).id;
    await setProjectMethodSelections({ workspaceId, userId, projectId, methodVersionIds: [] });
    const run = await runStudioQuickAction({ workspaceId, userId, projectId, studioAction: "SHORTEN_TEXT" }, { runtime });
    expect((await db.methodUsage.findFirstOrThrow({ where: { aiRunId: run.id, methodVersionId: v2Id } })).methodVersionId).toBe(v2Id);
    expect(await db.methodUsage.findFirst({ where: { aiRunId: run.id, methodVersionId: privateMethodVersionId } })).toBeNull();
    await setProjectMethodSelections({ workspaceId, userId, projectId, methodVersionIds: [privateMethodVersionId] });
  });

  it("does not expose a workspace default method across workspaces", async () => {
    await expect(runStudioQuickAction({ workspaceId: otherWorkspaceId, userId: otherUserId, projectId: otherProjectId, studioAction: "REWRITE_BODY" }, { runtime })).rejects.toMatchObject({ code: "QUICK_ACTION_NOT_READY" });
  });

  it("shows employee-facing project assistant actions without engineering language", async () => {
    const component = await readFile(new URL("../components/projects/studio-default-method.tsx", import.meta.url), "utf8");
    for (const label of ["继续当前创作", "添加引用", "保存为文本", "保存为选题", "创建候选稿", "需要确认", "来源", "当前 AI 服务暂时不可用，请稍后再试。"]) expect(component).toContain(label);
    for (const forbidden of ["默认方法 V", "稿件 V", "MethodVersion", "Provider", "Schema", "模型选择", "21 条 guideline"]) expect(component).not.toContain(forbidden);
  });

  it("keeps Phase 9A canvas controls business-facing and context-aware", async () => {
    const canvas = await readFile(new URL("../components/projects/content-canvas.tsx", import.meta.url), "utf8");
    const assistant = await readFile(new URL("../components/projects/studio-default-method.tsx", import.meta.url), "utf8");
    for (const label of ["添加到画布", "项目资料", "当前目标", "方法", "当前稿件", "适配画布", "小地图"]) expect(canvas).toContain(label);
    for (const label of ["基于当前内容", "生成另一种表达", "当前正在基于", "当前创作资料", "画布内容", "添加引用"]) expect(assistant).toContain(label);
    expect(canvas).toContain("edges={relationEdges}");
    expect(canvas).toContain("nodesConnectable={false}");
    expect(canvas).toContain("zoomOnDoubleClick={false}");
  });
});
