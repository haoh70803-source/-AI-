# Product Simplification V1

## 默认创作路径

普通创作者只需要理解三个概念：

```text
参考素材 → 我的补充 → 我的口播稿
```

- **参考素材**：展示素材状态和四块整理结果——它讲了什么、值得借、不要照搬、需要确认。
- **我的补充**：只收集我的核心观点、给谁看、我们自己的业务 / 经历 / 案例，以及其他表达要求。
- **我的口播稿**：Kimi 根据前两项生成可直接修改并自动保存的口播稿。

Workbench 默认不展示统一创作分析、证据面板或深度创作包。员工端只允许一个统一、上下文感知的 AI 协作层：当前 Workbench 的“鑫小助”。这些已有后端对象和历史数据继续保留，但不会在进入 Workbench 时自动运行或成为生成口播稿的前置步骤。平台内容与人工审核保留为稿件后的次级流程。

禁止为 Dashboard、Project、Research、Asset、Method 或 Publish 分别创建独立 Assistant。`DashboardAssistant`、Project Assistant、Research Assistant、Asset Assistant、Method Assistant、Publish Assistant 都不属于当前 V1 产品。

普通员工 UI 不展示 Model、Provider、Skill、Workflow、Node、AIRun、ApiUsage 等工程术语。内部对象可以继续用于运行、审计和管理员能力，但必须翻译为员工能够理解的业务状态与动作。

## 所有 AI 调用都必须由用户明确触发

当前允许的 AI 动作包括：

1. 用户在素材详情点击“开始整理”或“按新的方式重新整理”。
2. 用户在 Workbench 点击“生成我的口播稿”。
3. 用户在鑫小助选择明确的快捷动作，或选中文字后请求局部改写/事实检查；结果必须先预览，再由用户决定是否应用。
4. 用户确认稿件后，按需选择一个平台生成版本；可选 AI 审核同样必须由用户触发。

打开页面、保存“我的补充”、查看历史、切换 Canvas/鑫小助、调整 pane 或把内容加入当前引用都不调用 AI。默认路径不自动调用 Unified Creative Analysis 或 Deep Content Package。

## 素材整理契约

新版本保存到 `MaterialAnalysis.understanding`：

```json
{
  "whatItSays": { "summary": "...", "keyPoints": ["..."] },
  "reusable": [{ "content": "...", "whyUseful": "..." }],
  "doNotCopy": [{ "content": "...", "reason": "..." }],
  "uncertain": [{ "content": "...", "reason": "..." }]
}
```

旧记录不自动重跑。页面显示“旧版整理结果”，并提供用户主动触发的新方式整理按钮。

## 口播稿事实边界

生成优先级为：我的补充 > CreatorProfile 中的真实信息 > 已确认事实 > 素材整理中的可迁移机制 > ip-strategist 写作方法。生成模型不接收完整 Transcript，也不接收 Unified Creative Analysis。完整 Transcript 只用于服务端轻量重复检测。

素材中的人名、数字、金额、日期、比例、承诺和原作者个人案例，在没有来自“我的补充”、CreatorProfile 或已确认事实的支持时必须省略、泛化或提示确认。`星加克` 等不确定实体不得猜测纠正；`当天成交13个` 等原作者案例不得改写成我们的经历。

边界检查采用软提醒：草稿保存并保持可编辑，界面只显示“有 N 处需要确认”。已有发布前 Quality Gate 和人工审核仍负责最终阻断。

## 保留的基础设施

Workspace 隔离、RBAC、审计、AIRun、ApiUsage、Provider Adapter、素材与转写、CreativeBrief、MotherContent 版本历史、平台内容、审核和发布快照均保留。数据库仅为 `MaterialAnalysis` 增加一个 nullable JSON 字段，没有新增业务模型或枚举。
