# AI-first 核心母稿（ARCHIVED / SUPERSEDED）

> **ARCHIVED / SUPERSEDED：本文不得作为当前 V1 实施规范。** 默认产品路径已被 [Product Simplification V1](./product-simplification-v1.md) 及统一 Workbench 最终实施计划取代。用户界面现称“我的口播稿”；本文正文只保留为历史设计说明。

## 产品原则

核心母稿采用“AI 从 0 到 80%，人从 80% 到 100%”的协作方式。创作方案确认后，页面先展示生成准备状态，主操作是“AI 生成核心母稿”，同时保留“手动开始写”。打开 Studio、查看创作依据或历史版本都不会调用外部模型；只有用户明确点击生成、重新生成或既有局部 AI 编辑动作时才会发起调用。

## 生成上下文

`GENERATE_MOTHER_CONTENT` 继续作为唯一的母稿生成动作。上下文由 `ProjectContextBuilder` 集中组装：

- ProjectSource 及原文或 Transcript；
- 每条素材最新的已完成 MaterialAnalysis；
- 最新已完成 UnifiedCreativeAnalysis 及 provenance；
- 用户最终确认的 CreativeBrief；
- 可选 CreatorProfile；
- 正式 EvidenceItem 映射出的已采用 CreativeBasis。

未配置 CreatorProfile 时仍可生成，但产品不声称结果完全符合个人风格。

## 事实与原创边界

生成指令明确要求母稿由 CreativeBrief 和 CreatorProfile 主导，不得逐句替换、同义改写、复刻来源独特表达、复制来源作者的个人经历或金句，也不得把未核实数据写成确定事实。不得用引号复现来源话术；不受正式创作依据支持的数字、金额、比例、日期、个人案例和承诺必须省略或弱化。UnifiedCreativeAnalysis 中的解释和建议不是正式事实；缺少来源支持的建议只能弱化或不使用，不能补造证据。正式 EvidenceItem 才作为已确认的创作依据。

## 版本保护

数据库仍使用现有单条 `MotherContent` 和技术 revision，不新增模型或迁移。日常 autosave 只更新当前 revision，不保存全文副本。只有整稿重新生成或 GPT Web 整稿导入前，服务才把当前人工修改后的完整版本写入现有 `AuditLog` 的 `mother_content.version_preserved` 快照。历史 UI 使用独立的创作版本 V1、V2 展示，不把 autosave revision 暴露给用户。

因此“AI 生成 V1 → 人工修改 → 重新生成 V2”时，V1 的人工修改内容仍可在历史 Drawer 中查看，AI 不会静默覆盖人工劳动。该方案复用现有审计基础设施；如果未来需要恢复、分支、对比或长期大量版本，应再评估专用版本表。

## 人工控制

AI 成功生成后，内容直接进入现有可编辑、自动保存的 MotherContent Editor，`origin` 为 `KIMI`。人工起稿的 `origin` 为 `HUMAN`，GPT Web 导入保持 `GPT_WEB`。AI 失败时保留素材分析、统一分析和 CreativeBrief，不创建占位母稿或假成功记录。VIEWER 只能查看创作依据、Brief、母稿及历史版本，不能生成、重新生成或编辑。
