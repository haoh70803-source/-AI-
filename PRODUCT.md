# 鑫世界产品规则

本文件记录产品负责人已经确定的方向，不是根据现有代码反推的功能清单。与旧文档冲突时，以本文件为准；实现差距用 `CURRENT IMPLEMENTATION GAP` 标记，不修改产品定义来迎合旧流程。

状态词统一为：`INVARIANT`（不可破坏的原则）、`PRODUCT PRINCIPLE`（已确定的产品原则）、`TARGET ARCHITECTURE`（收敛目标）、`CURRENT IMPLEMENTATION`（代码中已实现）、`CURRENT IMPLEMENTATION GAP`（现状与目标的差距）、`EXPERIMENT`（尚在验证）、`LEGACY COMPATIBILITY`（旧数据或流程兼容）、`FUTURE`（正式规划但本阶段不施工）。目标不等于现状。

## 定位与核心关系

**PRODUCT PRINCIPLE**：鑫世界当前正在收敛为“以项目为长期工作容器的通用 AI 工作台”。

```text
用户 → 项目 → 与 AI 持续协作 → 使用资料、研究、可选技能和工具 → 形成可持续修改和保存的成果
```

项目不是一次性生成任务。产品不以 `MotherContent`、固定口播稿流程、Studio 或默认 Canvas 为中心；运行通用 Agent 不以选择默认 Method 为前提。

## 六个一级核心产品对象

| 对象 | PRODUCT PRINCIPLE |
| --- | --- |
| 项目（Project） | 长期工作容器，承载持续工作。 |
| 对话（Conversation） | 用户与 AI 持续协作的主线。 |
| 资料（Material） | 原始输入的读取、管理与供给；可来自本地文件、视频、音频、PDF、图片、网页或文本。资料页负责把东西读出来。 |
| 研究（Research） | 主动查找、比较、分析、验证和综合；研究负责把东西研究明白，不是资料详情的别名。 |
| 技能（Skill） | 给 AI 增加可选专业能力；允许 0 个、多个、跳过或组合。0 Skill 时通用 Agent 仍须能工作。 |
| 成果（Artifact） | 可持久化、修改、继续使用的输出；不限于文稿、脚本，也可承载研究产出、分析及未来类型。 |

**TARGET ARCHITECTURE**：上述六个对象的职责清晰，项目对话能够按需使用资料、研究、Skill 和工具，产出一等成果对象。

**CURRENT IMPLEMENTATION**：仓库已有 `ContentProject`、`AssistantThread` / `AssistantMessage`、`SourceItem` / `Transcript`、Benchmark / Discovery 研究代码、`MethodAsset` / `MethodVersion`、`Artifact` 等基础。通用 `Artifact` 目前只有 `TEXT` 类型；口播流程仍使用 `MotherContent`。这些是代码事实，不改变上面的产品原则。

**CURRENT IMPLEMENTATION GAP**：资料详情仍直接编排 `MaterialAnalysis` 与 `MaterialDistillation`；深度内容研究尚未完全归入 Research。Project、Conversation 与通用 Artifact 仍和旧母稿、方法、Canvas 路径并存。不能把这种并存解释为多个并列产品中心。

## 入口与持续工作

- **PRODUCT PRINCIPLE**：首页（Home）负责找到工作、创建项目、快速开始、回到最近工作；“首页负责找到工作，项目负责完成工作”。首页不是大型业务中心。
- **PRODUCT PRINCIPLE**：侧边栏（Sidebar）是应用级导航外壳，不是领域业务对象。
- **PRODUCT PRINCIPLE**：项目工作区（Project Workspace）是持续协作和完成工作的主要位置。
- **CURRENT IMPLEMENTATION**：现有首页、项目路由和 Sidebar Foundation / Project Organization 已有代码；工作区仍含历史 Studio / Canvas / 母稿结构。

## 内容经营域

**FUTURE**：这是一项正式规划，不是可有可无的附加功能；本阶段不施工。对象包括创作者账号（CreatorAccount）、已发布作品（PublishedWork）、数据快照（MetricSnapshot）、互动与评论（Engagement）、数据复盘（Review）。长期闭环为：

```text
研究 → 项目 → 成果 → 发布 → 已发布作品 → 表现数据 → 数据复盘 → 经验沉淀 → 下一轮研究 / 创作
```

复盘需要不同时间点的数据快照、增长曲线、作品间和同账号历史比较、评论互动、AI 复盘，以及向下一轮创作反馈。创作者平台账号与鑫世界产品登录账号是不同概念，不得合并为一个 `Account`。

**CURRENT IMPLEMENTATION**：已有发布任务及对标账号/作品互动观察等局部代码；它们不等于上述完整内容经营闭环已经实现。

## 商业交付域与运行形态

**FUTURE**：公司/工作空间、用户、席位、设备、许可证、授权码、有效期、第三方 API 配置、本地数据管理、安装升级、备份恢复，均属于正式产品规划。许可证将支持人数、设备、授权码、有效期及到期权限控制；当前阶段不实现 License。

**CURRENT IMPLEMENTATION**：已有 `User`、`Workspace`、权限及第三方服务配置等基础；席位/设备/许可证及完整商业交付能力不能据此宣称已完成。

**TARGET ARCHITECTURE**：最终交付方向为本地优先桌面应用（Local-first Desktop）：用户安装应用，数据与文件主要由本机管理，可使用自己的第三方 API Key，核心产品不依赖鑫世界官方云服务才能存在。当前先完成核心产品能力，不能以桌面目标为由立即重写整个产品。

**CURRENT IMPLEMENTATION GAP**：现有主要运行形态仍是 Web、服务端数据库/对象存储与后台任务；本地优先桌面交付目标尚未完成。
