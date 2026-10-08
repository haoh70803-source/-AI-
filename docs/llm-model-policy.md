# LLM Model Policy

## Current policy

```text
CURRENT_PRODUCT_MODEL = KIMI_2_6
PRODUCT_POLICY = KIMI_2_6_ONLY
```

当前产品版本只支持 Kimi 2.6。设置页不提供模型切换、自定义模型或按业务动作选择模型的能力。普通创作者不能查看或修改模型配置。

普通 `Material Analysis` 与 `Creative Analysis` 的唯一运行时映射为：

```text
NORMAL_ANALYSIS → KIMI_2_6
```

Kimi K3 当前为 `RESERVED / DEFERRED`，预留给未来首页智能、深度二创与复杂推理能力；它不属于普通分析的候选、fallback 或自动升级路径。

## Configuration boundary

管理员配置包含：

- `integrationType = KIMI`
- `productModel = KIMI_2_6`
- `baseUrl`
- 加密保存的 `apiKey`
- `apiModelId`：管理员从 Kimi 官方控制台确认后填写的实际 Model ID

产品名称“Kimi 2.6”不等于一个可以凭经验推测的 API Model ID。代码不预置、不猜测、不自动填写该 ID。没有实际 `apiModelId` 时，Integration 状态为 `UNCONFIGURED`。

Kimi 未配置只会让用户明确触发的 AI 动作返回“AI 分析暂不可用”。它不会阻止进入 Studio、创建项目、查看素材或编辑 CreativeBrief。

## Runtime boundary

业务动作只能请求 Workspace LLM Runtime，不能从浏览器请求中传入 `modelName`、`modelLabel`、`model`或 `customModel`。运行时由 Workspace Integration 与集中的 `KimiModelPolicy` 共同解析。

`OpenAICompatibleLLMProvider` 作为 Provider Adapter 继续保留。产品策略位于 Adapter 之上，业务层不依赖第三方请求细节。

真实 Kimi 调用会在 `AIRun.metadata` 和 `ApiUsage.metadata` 记录：

- `productModel = KIMI_2_6`
- `apiModelId = <administrator-configured value>`
- `providerMode = REAL`

## Legacy configuration

旧版配置如果没有显式的 `integrationType = KIMI` 与 `productModel = KIMI_2_6`，状态为 `NEEDS_RECONFIGURATION`。系统不删除已加密的 secret，也不会把旧 Model ID 静默解释为 Kimi 2.6。管理员必须根据官方控制台重新确认配置。

## Fixture boundary

`fixture-openai-compatible` 仅能通过内部测试入口以 `FIXTURE` 模式保存。它在状态、AIRun 和 ApiUsage 中都不会冒充真实 Kimi 2.6。

## Future model changes

任何未来模型升级都必须通过新的产品版本、明确的策略修改和配置迁移完成。不允许静默切换。
