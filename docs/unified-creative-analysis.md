# Unified Creative Analysis

## 产品入口

Studio 对普通用户只暴露一个创作前分析动作：`AI 深度分析`。当 CreativeBrief、项目素材、MaterialAnalysis、Evidence 或相关输入发生变化后，该动作显示为 `更新 AI 分析`。

页面加载、项目创建和页面刷新都不会自动调用 LLM。旧的分项分析能力继续保留为内部兼容代码，但不再作为 Studio 的独立按钮。

## 数据对象

`UnifiedCreativeAnalysis` 是版本化业务对象，记录：

- `unified-creative-analysis-v1` Schema 版本
- `PROCESSING / COMPLETED / FAILED` 状态
- 项目内版本号
- SHA-256 input fingerprint
- 严格校验后的统一输出
- AIRun 关联
- CreativeBrief、主素材、MaterialAnalysis、Evidence 和 PromptTemplate provenance

同一项目、同一 fingerprint 只保留一条记录。成功结果直接复用，不新增 AIRun 或 ApiUsage；失败结果可以由用户重新触发。

## 输入和输出边界

素材背景、核心问题、素材核心观点和关键要点优先读取现有 MaterialAnalysis，并标记为 `SOURCE_FACT`。没有明确 MaterialAnalysis provenance 时，只能作为 `USER_INPUT`。

一次 Workspace LLM Structured Output 只生成 advisory 内容：

- `AI_INTERPRETATION`：创作理解、风险提醒
- `AI_SUGGESTION`：可选切入角度、结构建议、表达方向、标题参考

不会生成完整正文、最终标题、Hook 或 CTA，也不会写回或覆盖 CreativeBrief。

## Source Grounding

Prompt 只允许引用当前项目提供的 SourceItem ID。服务端再次使用白名单过滤全部 `sourceItemIds`，不会保存模型编造的 ID。

任何重要建议缺少来源、引用为空或出现非法 ID 时，统一结果包含：

```text
SOURCE_REFERENCE_GAP
```

这表示需要人工核对，不会伪造来源补齐。

## Fingerprint

Fingerprint 包含：

- Schema 与 PromptTemplate 版本
- 项目目标与受众
- CreativeBrief 内容与版本
- 项目素材正文、更新时间和最新 MaterialAnalysis
- Evidence
- CreatorProfile 中参与分析的字段

读取状态只计算 fingerprint，不调用 Provider。当前 fingerprint 与最新成功结果不一致时，Studio 显示统一更新提示；旧结果和用户 Brief 均保持不变。

## 权限和失败语义

- VIEWER：只读，不能触发分析。
- EDITOR / ADMIN / OWNER：可显式触发。
- 所有查询按 Workspace、项目和成员关系隔离。

普通用户只看到“生成中 / 完成 / 暂时失败”，不会看到内部子模块的独立状态。
