import { resolveLLMModelId } from "@content-center/integrations";
import "server-only";

import { classifyLLMConfig, getAIModel, IntegrationService, isAIProvider, type AIModelCapabilities, type AIProvider } from "@content-center/integrations";
import { LLMError, MockLLMProvider, OpenAICompatibleLLMProvider, openAICompatibleConfigSchema, type LLMProvider } from "@content-center/providers";

export type LLMRuntime = {
  provider: LLMProvider;
  providerName: string;
  model: string;
  requestedModel?: string;
  capabilities?: AIModelCapabilities;
  mode?: "REAL" | "FIXTURE" | "MOCK";
};

export type LLMModelSelection = { provider: AIProvider | "CUSTOM"; modelId: string };

function mockFixture(prompt: string) {
  if (prompt.includes("返回候选信息。")) { const source = prompt.match(/资料：\n([\s\S]*?)\n\n返回候选信息。/u)?.[1]?.trim() || "MOCK MODE 资料"; const excerpt = source.split(/(?<=[。！？!?])|\n/u).find((item) => item.trim())?.trim() || source.slice(0, 120); return { candidates: [{ content: excerpt.replace(/[。！？!?]$/u, ""), category: "FACT", excerpt, confidence: 0.8 }] }; }
  if (prompt.includes("【当前节点生成要求】")) return "选题一：从真实问题切入。\n选题二：拆解常见误区。\n选题三：给出下一步行动。";
  if (prompt.includes("【员工当前问题】")) return "我会基于当前项目、选中内容和已引用资料，先整理一个可以继续编辑的候选结果。";
  if (prompt.includes("Action: UNIFIED_CREATIVE_ANALYSIS")) return { creativeInterpretation: { text: "MOCK MODE：统一创作理解。", classification: "AI_INTERPRETATION", sourceItemIds: [] }, angles: [{ title: "MOCK MODE 角度", angle: "仅用于显式开发测试。", rationale: "验证统一分析流程", classification: "AI_SUGGESTION", sourceItemIds: [] }], structure: { overallApproach: "MOCK MODE 结构建议", classification: "AI_SUGGESTION", sourceItemIds: [], sections: [{ title: "验证段落", purpose: "验证展示", keyMessage: "不作为真实创作结果", supportingPoints: [], sourceItemIds: [] }] }, expressionDirection: { description: "MOCK MODE 表达方向", rationale: "显式开发测试", classification: "AI_SUGGESTION", sourceItemIds: [] }, riskNotes: [{ text: "MOCK MODE：必须人工确认。", classification: "AI_INTERPRETATION", sourceItemIds: [] }], titleReferences: [{ title: "MOCK MODE 标题参考", rationale: "仅供测试", classification: "AI_SUGGESTION", sourceItemIds: [] }] };
  if (prompt.includes("Action: GENERATE_TOPIC_CANDIDATES")) return { candidates: Array.from({ length: 3 }, (_, index) => ({ title: `MOCK MODE 候选选题 ${index + 1}`, angle: "MOCK MODE：仅用于显式开发测试。", targetAudience: "测试用户", coreConflict: "测试冲突", whyNow: "来自显式 MOCK MODE 趋势上下文", differenceFromSources: "不复述来源标题", supportingReferences: [], riskNotes: ["MOCK MODE：不得当作真实趋势结论"], recommendedFormat: null })) };
  if (prompt.includes("Action: ANALYZE_SOURCES")) return { topics: ["MOCK MODE 主题"], coreClaims: [], facts: [], cases: [], questions: [], hooks: [], structures: [], risks: [], reusableInsights: [] };
  if (prompt.includes("Action: EXTRACT_EVIDENCE")) return { items: [{ type: "FACT", excerpt: "MOCK MODE 摘录", claim: "MOCK MODE 观点", note: "仅用于显式开发模式", sourceItemId: null }] };
  if (prompt.includes("Action: GENERATE_ANGLES")) return { angles: Array.from({ length: 5 }, (_, index) => ({ title: `MOCK MODE 角度 ${index + 1}`, angle: `MOCK MODE 差异化视角 ${index + 1}`, coreMessage: "MOCK MODE 核心观点", whyItWorks: "显式开发测试", targetAudience: "测试用户", recommendedStructure: ["开头", "论证", "结尾"], risk: "MOCK MODE", evidenceIds: [], sourceItemIds: [] })) };
  if (prompt.includes("Action: GENERATE_BRIEF")) return { topic: "MOCK MODE Brief", angle: "MOCK MODE 角度", audience: "测试用户", coreMessage: "MOCK MODE 核心观点", keyPoints: ["测试要点"], structure: ["开头", "正文"], tone: "自然", risks: ["MOCK MODE"], evidenceIds: [], sourceItemIds: [] };
  if (prompt.includes("Action: GENERATE_MOTHER_CONTENT")) return { title: "MOCK MODE 母稿", outline: ["开头", "正文"], body: "MOCK MODE：这是显式开发模式生成的母稿。", evidenceIds: [], sourceItemIds: [] };
  if (prompt.includes("Action: GENERATE_DEEP_CONTENT_PACKAGE")) return {
    topicPackage: { coreTopic: "MOCK MODE 深度选题", coreQuestion: "如何先研究再创作？", candidateTopics: [{ title: "先研究再创作", angle: "研究优先", targetAudience: "内容团队", conflict: "快速生成与可靠创作", novelty: "把创作包交给最终主笔", whyWorthDoing: "减少无依据表达", differenceFromSources: "重新组织命题与观点" }] },
    viewpointPackage: { mainViewpoint: "可靠创作先整理证据和判断。", supportingViewpoints: ["研究与最终写作应分工"], counterArguments: ["直接生成更快"], commonBeliefs: ["模型越强就越不需要研究"], ourJudgement: "速度不能替代事实边界。", deeperImplications: ["创作流程需要可追溯"] },
    evidencePackage: { items: [] },
    expressionPackage: { hooks: [{ type: "CONTRARIAN", text: "最会写的模型，也不该跳过研究。" }, { type: "QUESTION", text: "为什么内容越生成越空？" }, { type: "CASE", text: "一个常见的失败流程。" }, { type: "DIRECT_JUDGEMENT", text: "先研究，再创作。" }, { type: "BOSS_VIEW", text: "内容负责人真正要管的是事实边界。" }, { type: "STORY", text: "上一次赶稿让我重新看待创作流程。" }], goldenLines: ["速度不能替代事实边界。"], questions: [], analogies: [], conflictLines: [], transitions: [], endingIdeas: [], ctaIdeas: [] },
    structurePackage: { structures: [{ type: "CONTRARIAN", name: "反常识", whySuitable: "直接建立冲突", steps: ["误区", "判断", "方法"] }, { type: "STORY", name: "故事", whySuitable: "降低理解门槛", steps: ["场景", "转折", "结论"] }, { type: "VIEWPOINT", name: "观点", whySuitable: "突出立场", steps: ["判断", "论证", "行动"] }], recommendedStructure: "反常识" },
    creatorContribution: { personalViews: [], personalExperiences: [], personalCases: [], professionalKnowledge: [], positions: [], preferredExpressions: [], brandPrinciples: [], forbiddenExpressions: [] },
    recommendedDirection: "使用反常识结构，交给高级主笔完成成稿。", risks: ["MOCK MODE"], needsConfirmation: [],
  };
  if (prompt.includes("Action: REVIEW_PLATFORM_CONTENT")) return { summary: "MOCK MODE：内容整体可读，仍需人工确认。", issues: [{ code: "MOCK_REVIEW_NOTE", severity: "INFO", message: "这是显式开发模式的审核建议。", field: "body", suggestion: "请由人工完成最终审批。" }], suggestions: ["人工核对事实与表达。"] };
  if (prompt.includes("Action: ADAPT_PLATFORM") && prompt.includes("Target: DOUYIN")) return { hook: "MOCK MODE 开场", title: "MOCK MODE 抖音标题", body: "MOCK MODE：抖音口播稿。", hashtags: ["MOCKMODE"], mediaPlan: { duration: 60, shotSuggestions: ["固定机位口播"] } };
  if (prompt.includes("Action: ADAPT_PLATFORM") && prompt.includes("Target: XIAOHONGSHU")) return { titles: ["MOCK MODE 标题一", "MOCK MODE 标题二", "MOCK MODE 标题三"], body: "MOCK MODE：小红书正文。", hashtags: ["MOCKMODE"], coverTitles: ["MOCK MODE 封面"], mediaPlan: { imageIdeas: ["文字卡片"] } };
  if (prompt.includes("Action: ADAPT_PLATFORM") && prompt.includes("Target: WECHAT_MOMENTS")) return { variants: [{ type: "SHORT", body: "MOCK MODE：短版。" }, { type: "VIEWPOINT", body: "MOCK MODE：观点版。" }, { type: "STORY", body: "MOCK MODE：故事版。" }] };
  if (prompt.includes("Action: ADAPT_PLATFORM") && prompt.includes("Target: WECHAT_CHANNELS")) return { title: "MOCK MODE 视频号标题", hook: "MOCK MODE 开场", body: "MOCK MODE：视频号口播稿。", description: "MOCK MODE 简介", hashtags: ["MOCKMODE"] };
  if (prompt.includes("Action: ADAPT_PLATFORM") && prompt.includes("Target: WECHAT_OFFICIAL")) return { title: "MOCK MODE 公众号标题", summary: "MOCK MODE 摘要", body: "MOCK MODE：公众号正文。", outline: ["导语", "正文", "结尾"] };
  const match = prompt.match(/"selectedText":\s*("(?:[^"\\]|\\.)*")/);
  const original = match ? JSON.parse(match[1]!) as string : "MOCK MODE 原文";
  return { original, aiVersion: `MOCK MODE：${original}` };
}

export async function loadLLMRuntime(workspaceId: string, service = new IntegrationService(), selection?: LLMModelSelection | null): Promise<LLMRuntime> {
  if (process.env.LOCAL_REVIEW_OFFLINE === "true" || process.env.EXTERNAL_CALLS_DISABLED === "true") throw new LLMError("LOCAL_REVIEW_OFFLINE", "升级验收副本不调用模型，请在正式环境启用后使用。", false);
  const status = await service.getIntegrationStatus(workspaceId, "LLM");
  if (status.status === "DISABLED") throw new LLMError("LLM_DISABLED", "AI 模型已禁用。", false);
  if (status.status !== "CONFIGURED" && status.status !== "MOCK") {
    if (process.env.MOCK_MODE === "true") return { provider: new MockLLMProvider(({ prompt }) => mockFixture(prompt)), providerName: "MOCK", model: "mock-llm", requestedModel: "mock-llm", mode: "MOCK" };
    const policyState = classifyLLMConfig(status.publicConfig);
    if (policyState === "UNCONFIGURED" && status.publicConfig.integrationType === "KIMI") {
      throw new LLMError("KIMI_MODEL_ID_MISSING", "请为 AI 服务选择一个可用模型。", false);
    }
    throw new LLMError("KIMI_NOT_CONFIGURED", "AI 模型尚未配置，请联系管理员完成设置。", false);
  }
  const config = await service.getDecryptedIntegrationConfig(workspaceId, "LLM");
  const parsed = openAICompatibleConfigSchema.safeParse(config);
  if (!parsed.success) throw new LLMError("KIMI_NOT_CONFIGURED", "AI 模型尚未配置，请联系管理员完成设置。", false);
  const metadata = config as { requestedModel?: string; capabilities?: AIModelCapabilities; mode?: "REAL" | "FIXTURE" };
  const provider = parsed.data.provider.toUpperCase();
  const model = selection ? selection.provider === "CUSTOM" ? null : getAIModel(selection.provider, selection.modelId) : isAIProvider(provider) ? getAIModel(provider, parsed.data.model) : null;
  if (selection && (provider !== selection.provider || (!model && !(selection.provider === "CUSTOM" && selection.modelId === parsed.data.model)))) throw new LLMError("KIMI_MODEL_UNAVAILABLE", "所选模型已不可用，请重新选择。", false);
  if (model) {
    const usingConfiguredMapping = !selection || selection.modelId === metadata.requestedModel;
    if (!usingConfiguredMapping) parsed.data.model = resolveLLMModelId(provider, model.modelId);
    if (!usingConfiguredMapping) parsed.data.capabilities = model.capabilities;
    parsed.data.chatStructuredOutput = model.chatStructuredOutput;
  }
  return {
    provider: new OpenAICompatibleLLMProvider(parsed.data),
    providerName: metadata.mode === "FIXTURE" ? parsed.data.provider : parsed.data.provider.toUpperCase(),
    model: parsed.data.model,
    requestedModel: selection?.modelId ?? metadata.requestedModel ?? parsed.data.model,
    capabilities: parsed.data.capabilities ?? metadata.capabilities,
    mode: metadata.mode,
  };
}
