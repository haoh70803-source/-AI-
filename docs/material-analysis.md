# 素材智能整理

> 输出契约已被 [Product Simplification V1](./product-simplification-v1.md) 取代。本文中的旧字段仅用于历史记录兼容；新整理结果使用“它讲了什么 / 值得借 / 不要照搬 / 需要确认”四块结构。

## 目的

素材智能整理位于语音转写与内容项目之间。它把来源平台元数据和 Transcript 整理为一份可阅读、可编辑、可版本追踪的素材理解结果，不生成 Hook、内容结构、平台稿或母稿。

## 输入

- `SourceItem` 及标准化 RedFox metadata：原始标题、描述、平台、作者、发布时间、原始 topics 和互动指标。
- 当前 `Transcript.fullText`。

互动指标只作为市场表现信号；Transcript 中的陈述只代表来源内容，不能自动视为已验证事实。CreatorProfile 不参与本阶段分析。

## 输出

统一由 `MaterialAnalysisDTO` 暴露：

- `suggestedTitle`
- `summary`
- `topic`
- `tags`
- `keywords`
- `contentType`
- `targetAudience`
- `coreViewpoint`
- `keyPoints`
- `coreQuestion`

服务端使用严格 schema 校验字段、长度、数组数量和未知字段。原始 AI JSON 不作为后续业务接口。

## 原始数据与 AI 结果

`MaterialAnalysis` 是独立业务对象。生成、编辑或重新整理都不会覆盖 SourceItem 的原始标题、描述、metadata 或 Transcript。重新整理创建新的 version，历史结果保留；人工保存把当前版本标记为 `HUMAN` 来源。

## Transcript stale

每个版本记录 `transcriptUpdatedAtAtAnalysis`。当前 Transcript 的 `updatedAt` 更新后，DTO 返回 `stale: true`，页面提示转写已更新，但不会自动调用 Kimi。RedFox 互动指标刷新不会触发 stale。

## 标签行为

AI tags 首先只保存在 `MaterialAnalysis`。用户明确保存编辑结果时，标签经过 NFKC、trim、大小写与分隔符归一化、去重并限制最多 8 个，然后只追加到 `ContentTag` / `SourceItemTag`；已有人工标签不会删除。

## RBAC

- VIEWER：只能读取已保存结果。
- EDITOR / ADMIN / OWNER：可以发起整理、重新整理、编辑、保存，并基于素材创建内容项目。

全部读写按 Workspace 和 SourceItem 双重约束。相同 SourceItem 存在 `PROCESSING` 版本时拒绝重复调用。

## Kimi 2.6

运行时统一经过 Workspace LLM Adapter、`AIRun` 和 `ApiUsage`，并保持 `KIMI_2_6_ONLY`。前端不能传模型。未配置时页面明确显示未配置状态；产品环境不会用 fixture 或 deterministic 文本冒充 AI 结果。

## 接入创作工作台

用户点击“基于这条素材创作”时，服务端复用当前项目创建流程，把最新一版已完成的 `MaterialAnalysis` 映射为初始 `CreativeBrief`。项目、主素材关联和初始简报在同一个数据库事务中创建；该过程只读取已保存的整理结果，不再次调用 Kimi 或 RedFox。

映射只覆盖有直接来源的事实字段：选题、目标受众、核心问题、素材核心观点、关键要点和参考内容摘要。切入角度、内容结构、语气与风险点保持空白，交给创作者填写。完整映射、来源追踪和不覆盖规则见 [material-studio-handoff.md](./material-studio-handoff.md)。

Studio 展示层再由 `CreativeBriefPrefillService` 把这份来源理解与已保存的 `UnifiedCreativeAnalysis` 建议组合成一份待确认的“创作方案”。已有 CreativeBrief 的非空字段始终优先；统一分析只补充尚未确认的角度、结构、表达方向、风险与标题参考。该组合是确定性读取，不调用 Kimi、不调用 RedFox，也不在页面加载时写入或覆盖 CreativeBrief。用户保存或点击“确认并开始创作”后，才把最终方案写入 Brief。

素材原文、Transcript、MaterialAnalysis 和统一分析中对该素材的引用在 Studio 素材详情 Drawer 中按需查看，不再长期占据主创作区域。Evidence 同样保留底层模型和编辑能力，但通过“查看素材依据”二级入口使用。

## 后续 Structure Analysis

未来结构分析只能读取已校验的 `MaterialAnalysisDTO` 和明确的来源数据，使用新的业务对象与 PromptType；不得把 Hook、结构、CTA 或二创方案回填进本对象。
