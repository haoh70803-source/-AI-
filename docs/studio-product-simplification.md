# Studio 产品收敛（ARCHIVED / SUPERSEDED）

> **ARCHIVED / SUPERSEDED：本文不得作为当前 V1 实施规范。** 已被 [Product Simplification V1](./product-simplification-v1.md) 及统一 Workbench 最终实施计划取代。本文仅供历史追踪；不要据此恢复旧 Studio、旧三栏、旧术语或页面级 AI 助手。

## 核心产品概念

Studio 阶段一只向普通创作者长期展示四个产品概念：

1. **参考素材**：本次创作参考的本地素材，以及转录和智能整理状态。
2. **创作依据**：EvidenceItem、来源追踪和来源缺口形成的紧凑产品化摘要；完整内容只在 Drawer 中出现。
3. **创作方案**：用户确认的主题、受众、核心问题、素材核心观点、切入角度、结构、表达方向和风险边界。
4. **核心母稿**：方案确认后先进入 AI 生成准备状态，生成成功后进入正式写作区域。
5. **AI 创作助手**：只说明当前做到哪一步、建议下一步，以及是否需要运行或更新一次统一分析或生成母稿。

桌面端由“内容主区 + AI 助手区”组成；窄屏按单列顺序展示，不强行维持三栏后台布局。阶段二 Deep Content Package 和阶段三平台内容、审核流程不在本轮重做范围内。

## 连续创作路径

```text
参考素材
→ 创作依据（系统整理，默认无需管理）
→ 创作方案
→ 确认并开始创作
→ AI 生成第一版核心母稿
→ 核心母稿
```

准备阶段不渲染大面积空白母稿编辑器。Brief 已确认但没有母稿时，Studio 显示 AI-first 准备状态，只有用户点击“AI 生成核心母稿”才调用 Kimi，同时保留“手动开始写”。已有母稿时直接进入编辑器，并通过“查看创作方案”和“查看历史版本”回看上下文。

## 确定性预填与不覆盖

`CreativeBriefPrefillService` 集中组合已保存的 `MaterialAnalysis`、`UnifiedCreativeAnalysis` 和现有 `CreativeBrief`：

- 已有 Brief 的非空字段始终优先。
- MaterialAnalysis 提供主题、受众、核心问题、参考摘要、素材核心观点和关键要点。
- UnifiedCreativeAnalysis 提供建议切入角度、建议结构、表达方向、风险提醒和标题参考。
- 预填只形成页面上的待确认创作方案，不在页面加载时写数据库。
- 只有用户保存或点击“确认并开始创作”时才写入 CreativeBrief。

因此打开 Studio、读取已有分析和预填方案均不会调用 Kimi 或 RedFox，也不会静默覆盖用户已有 Brief。

## 为什么内部对象不长期占主界面

Evidence、AI Run、Prompt、素材分析步骤和技术状态是可靠运行所需的后台对象，但不是创作者的主要任务。它们仍完整保留：

- 素材原文、Transcript、MaterialAnalysis 和相关统一分析依据进入素材详情 Drawer。
- EvidenceItem 不再作为普通用户需要理解的系统出现。确定性 `CreativeBasisSummary` 把它和来源缺口映射为“创作依据”，主界面只显示可用数与待核实数，Drawer 中只提供采用、不采用和修改等产品动作。
- UnifiedCreativeAnalysis 完整结构进入“查看完整分析” Drawer，分类显示为“来源依据 / AI 理解 / AI 建议 / 我的输入”。
- 项目状态和管理动作进入折叠的高级区域。

主界面只保留内容本身与下一步，避免要求用户先理解内部 Pipeline。

## 单一 AI 分析入口

普通用户只有一个分析动作：无结果时为“开始 AI 分析”，输入变化后为“更新分析”。页面加载、刷新、展示已有结果和创作方案预填都不会自动运行分析。相同 Input Fingerprint 继续复用已有成功结果，不新增 AIRun 或 ApiUsage。

AI 分析只给建议，不等同于 CreativeBrief，也不会自动确认方案或生成核心母稿。母稿生成继续复用 `GENERATE_MOTHER_CONTENT`，上下文包含素材分析、统一分析、CreativeBrief、可选 CreatorProfile 和已采用创作依据。VIEWER 可查看素材、创作依据、方案、母稿、历史版本和完整分析，但不能运行 AI 或编辑内容。
