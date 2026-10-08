# 历史概念与兼容边界

本文件登记“代码仍在”与“新产品中心”之间的区别，不授权删改旧实现。状态词遵循 [PRODUCT.md](PRODUCT.md) 的 `CURRENT IMPLEMENTATION`、`CURRENT IMPLEMENTATION GAP`、`LEGACY COMPATIBILITY`、`FUTURE` 等定义。历史处置状态为 `KEEP`、`SIMPLIFY`、`MERGE_CANDIDATE`、`LEGACY_COMPAT`、`DEPRECATE`、`DELETE_CANDIDATE`、`VERIFY`；状态不是立即删除命令。

| 对象 | 处置状态 | CURRENT IMPLEMENTATION 与约束 |
| --- | --- | --- |
| `MotherContent` | `LEGACY_COMPAT` | Prisma 模型及 `mother-content-service.ts` 仍存在，可承载旧数据与兼容投影；新产品的一等通用成果目标是 Artifact，不再围绕 MotherContent 建立产品中心。 |
| `GENERATE_MOTHER_CONTENT` | `LEGACY_COMPAT` | 仍是 `AIRun` 动作及口播生成路径；仅作为旧流程兼容，不是 General Agent 通用任务模型。 |
| `ORAL_VIDEO_SCRIPT` | `LEGACY_COMPAT / VERIFY` | `workflow-skill/contract.ts` 仍识别该类型；口播可以是一种内容类型或旧流程，不是平台核心语义。具体保留边界待验证。 |
| Default Method | 通用产品语义 `DEPRECATE`；旧 fallback `LEGACY_COMPAT` | `ai-run-service.ts` 等旧生成路径仍可读取 defaultMethod；不得由此推断通用 Agent 必选默认方法，本轮不删除 fallback。 |
| `ProjectMethodSelection` 的单一 Method 产品语义 | `DEPRECATE / LEGACY_COMPAT` | Prisma 关系仍在，项目创建已能接收多个 `methodVersionIds`；不得继续以“一项目只能选一个 Method”扩张通用能力。Skill 目标为可选、可组合、可跳过。 |
| 旧 Studio 产品角色 | `DEPRECATE` | Studio 相关工作区、命名与兼容入口仍在；Studio 不再是当前产品中心，Core V1 稳定后再治理。 |
| 旧 Discovery 一级产品角色 | `DEPRECATE / MERGE_CANDIDATE` | `/discovery` 与研究服务仍在；相关能力未来优先归入 Research 的模式或能力。当前路由是否调整另行决定。 |
| `MaterialAnalysis` | `MERGE_CANDIDATE` | 模型、服务和资料详情使用仍在；深度内容理解未来优先考虑并入 Research，不在本轮搬迁。 |
| `MaterialDistillation` | `MERGE_CANDIDATE` | 模型、服务和资料详情使用仍在；不继续扩张为独立产品中心。 |
| Canvas | `VERIFY` | `CanvasObject` 等模型和现有 UI 仍在；它不是默认 Project Workspace 或当前产品中心。未来是否作为高级编辑能力保留，待确认；本轮不删除。 |

## 尚未定性的对象

以下默认 `VERIFY`，不能因为名称显旧就升级为 `DELETE_CANDIDATE`：

| 对象 | CURRENT IMPLEMENTATION |
| --- | --- |
| `CreativeBrief` | Prisma 模型仍在；项目创建可初始化 Brief，工作区仍读取它。 |
| `Recommendation` | `RecommendationBatch` / `RecommendationItem` 等模型与 Discovery recommendation 服务仍在。 |
| `ContentIdea` | Prisma 模型与 Discovery idea 服务仍在。 |
| `PlatformVariant` | Prisma 模型仍在，关联平台内容与旧 MotherContent 路径。 |
| 其他旧 Domain | 发现后先核对真实调用与数据，再由明确的模块任务定性；不得自行删除。 |

**CURRENT IMPLEMENTATION GAP**：通用 Project / Conversation / Artifact 与上述旧对象仍交织。既定方向不因兼容代码存在而改变。

**FUTURE**：全仓 Legacy Cleanup 安排在核心 V1 稳定以后，届时再统一评估 `KEEP`、`SIMPLIFY`、`MERGE`、`LEGACY_COMPAT`、`DEPRECATE`、`DELETE`。本轮不删除代码、数据或历史文档。
