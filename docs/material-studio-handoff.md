# 素材智能整理接入创作工作台

## 范围

本链路只完成：

```text
MaterialAnalysis
→ 创建或复用 ContentProject
→ 初始化 CreativeBrief
→ 在 Studio 中供用户继续编辑
```

它不执行结构分析、二创、母稿生成、平台适配，也不会额外调用 Kimi、RedFox 或其他 Provider。

## 字段映射

| MaterialAnalysis | CreativeBrief | 规则 |
| --- | --- | --- |
| `topic` | `topic` | 直接映射 |
| `targetAudience` | `audience` | 缺失时使用项目受众 |
| `coreQuestion` | `coreQuestion` | 直接映射 |
| `coreViewpoint` | `coreMessage` | 作为素材核心观点，而不是 AI 新结论 |
| `keyPoints` | `keyPoints` | 保持已校验的数组 |
| `summary` | `background` | 作为参考内容摘要 |

`angle`、`structure`、`tone` 和 `risks` 不从素材整理结果推断，初始化为空。`suggestedTitle`、`keywords` 和参考标签只写入来源 metadata，不冒充创作策略。

## 来源追踪

`CreativeBrief.metadata` 记录：

- 初始化来源 `MATERIAL_ANALYSIS`
- `MaterialAnalysis` ID 与版本
- 主素材 `SourceItem` ID
- 素材原始标题与参考标题
- 关键词与参考标签

Studio 只用明确记录的主素材判断整理结果是否有新版本，不依赖“素材列表第一条”等隐式顺序。

## 不覆盖原则

- 新项目没有简报时，可由最新已完成的 `MaterialAnalysis` 初始化一次。
- 已存在的 `CreativeBrief` 永远不被重新整理结果自动覆盖。
- 同一素材重复点击“基于这条素材创作”时复用现有项目；只有现有项目尚无简报时才允许一次性补齐。
- 初始化后素材产生更高版本，Studio 只显示更新提示，保留用户已编辑内容。
- 没有 `MaterialAnalysis` 的旧项目继续使用空白简报，不报错、不伪造预填结果。

## 权限与事务

页面与 API 沿用现有 Workspace RBAC：VIEWER 只读，EDITOR / ADMIN / OWNER 可创建项目和保存简报。新项目、主素材关联和初始简报在一个事务中提交；并发补齐使用 CreativeBrief 的项目唯一约束避免重复写入。

## 多素材说明

V1.2B-2 只认创建入口所对应的单条主素材。后续若支持多素材汇总，必须增加显式选择或合并策略；不得自动混合多个分析，也不得复用当前单素材映射假装已经支持。
