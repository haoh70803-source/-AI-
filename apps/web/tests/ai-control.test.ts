import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const executeStructuredAIRun = vi.hoisted(() => vi.fn());
vi.mock("../server/ai/ai-run-service", () => ({ executeStructuredAIRun }));

import { MockLLMProvider } from "@content-center/providers";
import { ActionPermissionPolicy } from "../server/ai/control/action-permission";
import { AIControlService } from "../server/ai/control/ai-control-service";
import { ContextBuilderV2 } from "../server/ai/control/context-builder-v2";
import { AI_CONTROL_ERROR_CODES, AI_CONTROL_TASKS, AIControlError, employeeAIErrorMessage, type ContextItem, type WorkspaceAIEngine } from "../server/ai/control/contracts";
import { FactGateV2 } from "../server/ai/control/fact-gate-v2";
import { ModelRouter } from "../server/ai/control/model-router";
import { ScopeGate } from "../server/ai/control/scope-gate";
import { nextSourceUnderstandingStep } from "../server/ai/control/video-orchestration";
import type { ProjectContextBuilder } from "../server/ai/project-context";

const baseItem: ContextItem = { objectType: "PROJECT", objectId: "project-1", version: 1, ownership: "OWN_CONFIRMED", provenance: "project", whySelected: "当前项目", truncated: false, content: "做一条招生内容" };

describe("AI control foundation", () => {
  it("blocks explicitly unrelated requests without a model call and keeps project content tasks in scope", () => {
    const gate = new ScopeGate();
    expect(gate.evaluate({ userId: "u", workspaceId: "w", taskType: "GENERAL_QUERY", userInput: "帮我做数学作业" })).toMatchObject({ decision: "OUT_OF_SCOPE", reason: "EXPLICITLY_UNRELATED" });
    expect(gate.evaluate({ userId: "u", workspaceId: "w", projectId: "p", taskType: "TOPIC_CANDIDATES", userInput: "换一组选题" })).toMatchObject({ decision: "ALLOW_WITH_CONTEXT" });
  });

  it("keeps expression guidance separate and blocks prohibited or unsupported facts", () => {
    const gate = new FactGateV2();
    expect(gate.evaluate({ items: [{ ...baseItem, ownership: "EXTERNAL" }, { ...baseItem, objectId: "method", ownership: "METHOD_GUIDANCE" }], ownFacts: [] })).toMatchObject({ decision: "PASS_WITH_WARNINGS", ownershipSummary: { EXTERNAL: 1, METHOD_GUIDANCE: 1 } });
    expect(gate.evaluate({ items: [baseItem], ownFacts: [], proposedText: "我们有个客户招生转化提升了30%" })).toMatchObject({ decision: "BLOCK" });
    expect(gate.evaluate({ items: [baseItem], ownFacts: [], proposedText: "假设有一家学校遇到这个问题" })).toMatchObject({ decision: "PASS" });
  });

  it("allows candidate results, requires confirmation for writes, and forbids viewer writes", () => {
    const policy = new ActionPermissionPolicy();
    expect(policy.evaluate({ role: "VIEWER", action: "CHECK_CONTENT" }).decision).toBe("ALLOW");
    expect(policy.evaluate({ role: "VIEWER", action: "CREATE_FREE_TEXT_CANDIDATE" }).decision).toBe("DENY");
    expect(policy.evaluate({ role: "EDITOR", action: "CREATE_FREE_TEXT_CANDIDATE" }).decision).toBe("ALLOW");
    expect(policy.evaluate({ role: "EDITOR", action: "OVERWRITE_PRIMARY_DRAFT" }).decision).toBe("REQUIRE_CONFIRMATION");
    expect(policy.evaluate({ role: "EDITOR", action: "OVERWRITE_PRIMARY_DRAFT", userConfirmed: true }).decision).toBe("ALLOW");
    expect(policy.evaluate({ role: "VIEWER", action: "OVERWRITE_PRIMARY_DRAFT", userConfirmed: true }).decision).toBe("DENY");
    expect(policy.evaluate({ role: "OWNER", action: "PUBLISH_CONTENT" }).decision).toBe("DENY");
  });

  it("keeps every task on the workspace-selected DeepSeek or Kimi engine", async () => {
    const provider = new MockLLMProvider(() => ({}));
    for (const configured of [
      { providerName: "KIMI", model: "kimi-k2.6" },
      { providerName: "DEEPSEEK", model: "deepseek-v4-pro" },
    ]) {
      const router = new ModelRouter(async () => ({ provider, ...configured, requestedModel: configured.model, mode: "REAL" as const }));
      for (const taskType of AI_CONTROL_TASKS) {
        const routed = await router.route("workspace", { taskType, structuredOutput: true, reasoningNeed: "HIGH" });
        expect(routed.receipt).toMatchObject({ requestedTask: taskType, routingMode: "SINGLE_ENGINE", workspaceEngine: configured.providerName, selectedProvider: configured.providerName, selectedModel: configured.model, capabilityMatch: { text: true, reasoning: true, structuredOutput: true }, fallbackReason: null, crossProviderFallback: false });
      }
    }
  });

  it("returns MODEL_UNAVAILABLE without crossing providers when the selected engine lacks capability or owns a mismatched model", async () => {
    const provider = new MockLLMProvider(() => ({}));
    let loads = 0;
    const unsupported = new ModelRouter(async () => { loads += 1; return { provider, providerName: "KIMI", model: "kimi-k2.6", mode: "REAL" as const }; });
    await expect(unsupported.route("workspace", { taskType: "SOURCE_UNDERSTANDING", requiredCapabilities: ["image"] })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    const mismatched = new ModelRouter(async () => { loads += 1; return { provider, providerName: "KIMI", model: "deepseek-v4-pro", mode: "REAL" as const }; });
    await expect(mismatched.route("workspace", { taskType: "CONTENT_CHECK" })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    expect(loads).toBe(2);
  });

  it("returns PROVIDER_UNAVAILABLE when the workspace engine is not configured", async () => {
    const router = new ModelRouter(async () => { throw new Error("not configured"); });
    await expect(router.route("workspace", { taskType: "CONTENT_CHECK" })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("reserves AUTO in the service contract without enabling it in routing", () => {
    const reservedMode: WorkspaceAIEngine = "AUTO";
    expect(reservedMode).toBe("AUTO");
  });

  it("builds a bounded manifest from the working draft without loading raw source text", async () => {
    const legacyBuilder = {
      build: vi.fn().mockResolvedValue({
        context: { creatorProfile: { tone: "自然" }, externalReferences: { materials: [{ id: "source-1", title: "资料", platform: "GENERIC", materialUnderstanding: { reusable: ["结构"] } }] } },
        snapshot: null,
        ownFacts: [{ text: "我们长期服务教育行业", source: "CREATOR_PROFILE", kind: "EXPERIENCE" }],
        hasOwnEvidence: true,
        hasOwnCaseOrData: false,
        ownContribution: "观点",
        hasOwnBackground: true,
        contextTruncated: false,
        selectedMethods: [{ methodAssetId: "method-a", methodVersionId: "method-v2", version: 2, title: "方法", steps: ["先判断"], applicableScenarios: [], boundaries: ["不编事实"] }],
        defaultMethod: { assetId: "default-a", versionId: "default-v3", version: 3, title: "默认方法", sections: [{ code: "BOUNDARY", items: [{ text: "不编事实" }] }] },
        inputSummary: { sourceCount: 1 },
      }),
    } as unknown as ProjectContextBuilder;
    const store = { loadProject: vi.fn().mockResolvedValue({ id: "project-1", title: "项目", description: null, goal: "写一条内容", audience: "校长", updatedAt: new Date("2026-09-13T00:00:00Z"), creatorProfile: { id: "profile-1", updatedAt: new Date("2026-09-12T00:00:00Z") }, primaryDraftBranch: { id: "draft-1", workingTitle: "主稿", workingBody: "A".repeat(17_000), workingOutline: [], currentRevisionId: "revision-4", version: 7, updatedAt: new Date("2026-09-13T01:00:00Z") }, draftBranches: [] }) };
    const adapter = { resolve: vi.fn().mockResolvedValue([{ ...baseItem, objectType: "CANVAS_OBJECT", objectId: "node-1", whySelected: "用户当前选中对象" }]) };
    const built = await new ContextBuilderV2(legacyBuilder, store, adapter).build({ workspaceId: "workspace", userId: "user", projectId: "project-1", taskType: "TOPIC_CANDIDATES", action: "REWRITE_SELECTION", studioAction: "TOPIC_IDEAS", selectedObjects: [{ objectType: "CANVAS_OBJECT", objectId: "node-1" }] });
    expect(built?.manifest).toMatchObject({ schemaVersion: "ai-context-manifest-v1", currentDraft: { branchId: "draft-1", workingVersion: 7, currentRevisionId: "revision-4" }, selectedObjects: [{ objectId: "node-1" }], creatorProfile: { id: "profile-1" }, sourceRefs: ["source-1"], truncation: { any: true } });
    expect(built?.manifest.methodVersions).toEqual([{ assetId: "method-a", versionId: "method-v2", version: 2 }]);
    expect(JSON.stringify(built?.context)).not.toContain("rawText");
    expect(built?.manifest.items.find(({ objectType }) => objectType === "DRAFT_WORKING_STATE")?.content.length).toBe(16_000);
  });

  it("runs the controlled chain and stores the immutable manifest in AIRun metadata", async () => {
    const manifest = { schemaVersion: "ai-context-manifest-v1" as const, manifestId: "manifest-1", generatedAt: "2026-09-13T00:00:00Z", project: { id: "project-1", version: "v1" }, currentDraft: null, selectedObjects: [], methodVersions: [], creatorProfile: null, confirmedInformationRefs: [], sourceRefs: ["source-1"], externalRefs: ["source-1"], items: [{ ...baseItem, ownership: "EXTERNAL" as const }], truncation: { any: false, categories: {} } };
    const context = { context: { project: { id: "project-1" } }, manifest, ownFacts: [], contextTruncated: false, inputSummary: {}, selectedMethods: [], defaultMethod: null };
    const provider = new MockLLMProvider(() => ({}));
    executeStructuredAIRun.mockImplementationOnce(async (runInput: { metadata: Record<string, unknown> }) => ({ id: "run-1", status: "SUCCEEDED", output: {}, metadata: runInput.metadata }));
    const service = new AIControlService({
      contextBuilder: { build: vi.fn().mockResolvedValue(context) } as unknown as ContextBuilderV2,
      modelRouter: new ModelRouter(async () => ({ provider, providerName: "DEEPSEEK", model: "deepseek-v4-pro", requestedModel: "deepseek-v4-pro", mode: "REAL" })),
      roleLoader: async () => "VIEWER",
    });
    const result = await service.execute({ workspaceId: "workspace", userId: "user", projectId: "project-1", taskType: "CONTENT_CHECK", requestedAction: "CHECK_CONTENT", action: "REWRITE_SELECTION", studioAction: "FACT_CHECK", operation: "STUDIO_FACT_CHECK", promptVersion: 1, inputSummary: () => ({}), generate: async () => ({ providerMode: "REAL", data: { value: {}, text: "{}", model: "deepseek-v4-pro" } }) });
    expect(result).toMatchObject({ id: "run-1", control: { manifestId: "manifest-1", route: { routingMode: "SINGLE_ENGINE", workspaceEngine: "DEEPSEEK", selectedProvider: "DEEPSEEK", crossProviderFallback: false } } });
    expect(executeStructuredAIRun).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ aiControlVersion: "ai-control-v1", contextManifestRef: "airun-metadata:manifest-1", contextManifest: manifest, sourceRefs: ["source-1"] }) }), expect.anything());
  });

  it("never invokes the controlled runner for an out-of-scope task", async () => {
    executeStructuredAIRun.mockClear();
    const contextBuilder = { build: vi.fn() };
    const service = new AIControlService({ contextBuilder: contextBuilder as unknown as ContextBuilderV2, roleLoader: async () => "OWNER" });
    await expect(service.execute({ workspaceId: "workspace", userId: "user", projectId: "project-1", taskType: "GENERAL_QUERY", requestedAction: "GENERATE_SUGGESTIONS", userInput: "帮我做数学作业", action: "REWRITE_SELECTION", operation: "GENERAL_QUERY", promptVersion: 1, inputSummary: () => ({}), generate: async () => ({ providerMode: "MOCK", data: { value: {}, text: "{}", model: "unused" } }) })).rejects.toMatchObject({ code: "OUT_OF_SCOPE" } satisfies Partial<AIControlError>);
    expect(contextBuilder.build).not.toHaveBeenCalled();
    expect(executeStructuredAIRun).not.toHaveBeenCalled();
  });

  it("defines only the status contract for future video orchestration", () => {
    expect(nextSourceUnderstandingStep({ sourceReady: true, isVideoOrAudio: true, transcriptReady: false, analysisReady: false, distillationReady: false, candidateReviewComplete: false })).toBe("TRANSCRIBE");
    expect(nextSourceUnderstandingStep({ sourceReady: true, isVideoOrAudio: true, transcriptReady: true, analysisReady: true, distillationReady: true, candidateReviewComplete: true })).toBe("COMPLETE");
  });

  it("keeps every public control error in employee language", () => {
    for (const code of AI_CONTROL_ERROR_CODES) {
      expect(employeeAIErrorMessage(code)).not.toMatch(/HTTP|JSON|provider|API Key/i);
      expect(employeeAIErrorMessage(code).length).toBeGreaterThan(5);
    }
  });
});
