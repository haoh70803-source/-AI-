# 鑫世界目标架构与当前边界

本文件定义收敛方向，不宣称所有模块已经按目标独立实现。状态术语沿用 [PRODUCT.md](PRODUCT.md)：`INVARIANT`、`PRODUCT PRINCIPLE`、`TARGET ARCHITECTURE`、`CURRENT IMPLEMENTATION`、`CURRENT IMPLEMENTATION GAP`、`EXPERIMENT`、`LEGACY COMPATIBILITY`、`FUTURE`。代码与目标冲突时记录差距，不反向修改目标。

## 分层

| 层 | TARGET ARCHITECTURE | 当前状态 |
| --- | --- | --- |
| 产品入口 | Home、Sidebar、Project Workspace | `CURRENT IMPLEMENTATION`：已有路由及应用外壳，工作区仍混有旧 Studio / Canvas 路径。 |
| 核心产品域 | Project、Conversation、Material、Research、Skill、Artifact | `CURRENT IMPLEMENTATION`：均有代码基础，但职责尚未完全收敛。 |
| 后续业务域 | Creator Account、Publishing、Published Work、Performance / Metric Snapshot、Engagement、Review、Licensing / Entitlement | `FUTURE`：正式规划；发布和对标数据有局部基础，不等于完整经营域已实现。 |
| 基础能力 | Agent Runtime、Context、Tool、Provider、Storage、Background Job、Auth、Workspace、RBAC | `CURRENT IMPLEMENTATION`：已有相应服务/运行基础，具体边界仍需按模块任务验证。 |
| 桌面交付基础 | Credential Store、Desktop File Bridge、Local Runtime Management、Backup / Restore | `FUTURE`：本阶段不因文档创建实现。 |

## 已知的当前基础架构缺口

以下均为 **CURRENT IMPLEMENTATION GAP**，只登记，不表示相关目标能力已实现：

1. **Context**：当前 ContextBuilder 已有通用上下文基础，但仍混有 `MotherContent`、`CreativeBrief`、`MaterialAnalysis`、`MaterialDistillation` 等历史内容生产语义；目标仍是通用 Project / Agent Context。
2. **Tool Runtime**：已有 ScopeGate、权限策略、Provider、文件读取、网页抓取、ASR、RedFox、Evidence 等能力，但许多仍由固定 API、Worker 和 workflow 调用；尚未形成统一 Tool Registry / Tool Runtime。
3. **Research**：Research 是统一目标产品概念，当前实现仍分散于 Discovery、Trend、Benchmark、Recommendation、Evidence 等历史垂直模块；尚未形成完整通用 Research Runtime。
4. **Workspace / Security**：主要路径已有 workspace scope 和 RBAC 基础，但 Workspace 选择和部分个人数据范围仍需治理；已知 Recommendation 个性化读取范围需要后续安全修复，不能宣称全系统隔离已完成。

## 依赖方向

1. **INVARIANT**：模块化不等于零依赖。目标是依赖方向稳定、边界明确、内部实现可替换。
2. **TARGET ARCHITECTURE**：UI 不直接拥有复杂跨模块业务规则；模块不随意操作其他模块的内部数据结构。
3. **TARGET ARCHITECTURE**：跨模块协作优先使用明确的 Service、Capability 或 Application API；共享 Service 不持续吸纳各业务场景逻辑。
4. **TARGET ARCHITECTURE**：基础能力与场景编排分离；Provider 是能力的具体实现，不应成为业务能力的唯一身份。
5. **INVARIANT**：Workspace、User、Project、Credential、Creator Account 等隔离必须由服务端权限与范围检查保证，不靠 Prompt 或隐藏 UI。

## 核心职责

### Project 与 Home

**TARGET ARCHITECTURE**：Project Core 负责基础项目创建、读取、基本信息更新、权限与归属。Home 的“创建项目 + 附加资料 + 选择 Skill + 选择模型 + 开启对话”是场景编排，不应不断塞进基础 `createProject()`。

**CURRENT IMPLEMENTATION**：`apps/web/server/project-service.ts` 的 `createProject()` 已同时处理资料、文件夹、MethodVersion、模型偏好和初始 Brief；项目对话由 `apps/web/server/assistant/service.ts` 支撑。

**CURRENT IMPLEMENTATION GAP**：基础项目能力与首页创建编排仍耦合。这里仅登记，不在本轮拆分。

### Material 与 Research

**TARGET ARCHITECTURE**：Material 负责输入、转录、提取、查看、管理原始资料；Research 负责主动分析、比较、验证、综合。深度内容研究优先进入 Research，不让 Material Detail 长成第二个 Research。

**CURRENT IMPLEMENTATION**：`SourceItem` / `Transcript`、资料入库与详情、Discovery / Benchmark / Trend 等研究服务已存在。

**CURRENT IMPLEMENTATION GAP**：`apps/web/server/material-detail/service.ts` 仍直接组合 `MaterialAnalysis`、`MaterialDistillation`，边界尚待收敛。

### Conversation 与 Artifact

**TARGET ARCHITECTURE**：Conversation 保存持续协作过程，可请求创建、修改、继续 Artifact，但不直接依赖 Artifact 内部存储实现。Artifact 是持久成果边界，不受一种稿件类型限制。

**CURRENT IMPLEMENTATION**：`AssistantThread` / `AssistantMessage`、`Artifact`、`apps/web/server/artifacts/service.ts` 已存在；通用文本成果可由对话保存并修订。

**CURRENT IMPLEMENTATION GAP**：Schema 中 `ArtifactType` 只有 `TEXT`；口播路径仍调用 `MotherContent`。历史兼容行为见 [LEGACY.md](LEGACY.md)。

### Skill、Tool 与 Provider

**PRODUCT PRINCIPLE**：Skill 是可选专业能力，允许 0 个或多个；通用 Agent 不依赖 Default Method。

**TARGET ARCHITECTURE**：Tool 是 Agent 可执行的低层能力，如读文件、抓网页、转录、搜索、数据处理；Provider 是这些能力的具体提供方式。Research 不能永久等同于某个第三方服务。

**CURRENT IMPLEMENTATION**：已有 Method/Skill 版本选择、Skill Resolver、Provider Adapter 与运行记录。旧 `GENERATE_MOTHER_CONTENT` 路径仍保留 defaultMethod fallback。

**LEGACY COMPATIBILITY**：旧 fallback 暂存以兼容旧任务，不把它提升为通用产品要求。

## 演进约束

**FUTURE**：内容经营域、Licensing / Entitlement 和本地优先桌面交付进入后续明确模块任务；本文件不授权提前施工。

**EXPERIMENT**：尚未证实的交互、抽象和迁移路径只能以实验记录，不得写成稳定现状或借目标架构名义扩大本轮范围。
