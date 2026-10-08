# Agent + Skill Resolver v1

- 阶段：G1.1 架构修订 / G1.2 Dry Run / G1.3 General Agent / G1.4 UI 状态
- 状态：G1.4 已实现当前项目 Skill Pool UI 和 Resolver 产品级流式状态；完整 Resolver 执行与 Auto Invoke 仍未启用
- 目标：撤销“最多一个 MAIN Skill”的全局硬限制，建立通用 Agent、Skill Pool、Resolver 和系统安全边界之间的清晰分工。
- 本文不授权修改 Studio UI、数据库或 migration；G1.2/G1.3 已明确落地的最小 Runtime 变化以本账本和测试为准。

## 1. Product Goal

鑫世界 Studio 的 Agent 应该是通用的任务执行者，而不是永久绑定的口播稿生成器、固定五段式写作器或固定平台文案生成器。

用户可以在当前任务中加载一组 Skills。Agent 在执行前通过 Skill Resolver 判断：

- 哪些 Skill 适用；
- 哪些 Skill 不适用；
- 哪些 Skill 重复；
- 哪些 Skill 冲突；
- 哪些 Skill 可以组合；
- 大致执行顺序；
- 是否需要自动发现内部 Skill；
- 是否需要用户确认。

Skill 影响当前任务，不自动成为长期用户偏好，也不改变系统安全边界。

## 2. General Agent Principle

没有 Skill 时，Agent 仍然可以根据当前任务完成：

- 理解；
- 分析；
- 总结；
- 生成；
- 改写；
- 规划；
- 检查；
- 调用已授权能力。

没有 Skill 时不得自动绑定：

- 口播；
- 小红书；
- 五段式；
- 60 秒；
- CTA；
- 固定标题数量；
- 固定开头数量；
- 固定平台输出；
- 固定输出 Schema。

这些内容只有在当前任务的 Skill 或用户明确要求中出现时，才进入执行计划。

## 3. Skill Pool

Skill Pool 是当前 Agent 可发现的能力集合，来源包括：

- 用户在当前工作窗口手动加载的 Skill；
- 当前 Workspace 已启用且用户有权限使用的内部 Skill；
- 当前项目或资料上下文允许自动发现的 Skill；
- 未来保存的项目 / 账号 / 工作台组合，但本轮不实现持久化档案。

Skill 可以是：

- 方法包；
- 约束包；
- 风格包；
- 转换包；
- 分析包；
- 检查包；
- 输出提示包。

Skill Pool 不等于 Skill Marketplace，不自动安装外部 GitHub Skill，也不允许未授权 Skill 获得系统能力。

## 4. Skill Resolver

Skill Resolver 不是新的独立 Agent，也不是固定 Workflow Engine。它是通用 Agent 在正式执行前的轻量规划步骤。

### 4.1 输入

```text
用户当前任务
+ 当前项目 / 当前稿件 / 当前资料
+ 用户手动加载的 Skills
+ 有权限的内部 Skill Pool
+ 系统硬规则
```

### 4.2 输出

Resolver 生成面向 Agent 的内部执行计划，至少包含：

```text
适用 Skill
跳过 Skill 及原因
重复 / 冲突 Skill 组
建议组合关系
建议顺序
需要自动发现的 Skill
需要用户确认的事项
当前输出提示
```

这些字段是执行计划，不直接暴露给普通用户。

### 4.3 Resolver 决策原则

Resolver 可以：

- 使用一个或多个 Skill；
- 只使用某个 Skill 的适用部分；
- 跳过不适用 Skill；
- 调整 Skill 顺序；
- 将一个 Skill 的建议作为另一个 Skill 的输入；
- 自动调用适用的内部检查 Skill；
- 在无法安全判断时询问用户。

Resolver 不可以：

- 覆盖系统硬规则；
- 伪造 Evidence / Source；
- 把 Skill 内容当成事实；
- 静默执行用户明确要求跳过的 Skill；
- 因为某个 Skill 存在就强行改变输出类型；
- 把一次任务的组合永久保存为用户偏好。

### 4.4 G1.3 Model-assisted Resolver

G1.3 将自然语言适用性判断交给一个轻量的 Model-assisted planning 步骤，但模型只返回产品级 Resolution Plan，不返回思维过程，也不直接执行 Skill。输入只包含当前任务、上下文摘要、已加载 Skill metadata 和可自动调用的内部 Skill metadata。

模型计划进入执行前必须经过 deterministic guard：

- Skill ID 必须来自当前已加载或已授权的 metadata；
- Skill 必须处于 enabled 且当前 Workspace 可访问；
- 自动调用只能使用内部 Skill，并同时满足 `canAutoInvoke = true`、不要求用户意图和系统安全条件；
- 冲突、跳过原因和顺序提示只能引用已知 Skill；
- FactGate、Evidence、ownership、privacy 和 destructive action 仍由既有系统边界负责。

当前模式是 `MODEL_ASSISTED_DRY_RUN`：模型计划用于审计与后续接入准备，不改变本次实际 Prompt 上下文。默认生产路径仍使用 `DETERMINISTIC_DRY_RUN`，以避免在没有 UI / 流式状态和独立 Resolver 审计入口前引入隐式额外模型调用。

## 5. User-selected Skills

用户手动加载的 Skill 不是“全部强制执行”的流水线节点。

### 5.1 适用

如果 Skill 与当前任务相关，Resolver 将其纳入执行计划，并在流式状态中显示采用结果。

### 5.2 不适用

如果 Skill 与当前任务无关，必须先向用户说明，而不是静默跳过。例如：

```text
当前任务只是修改已有口播开头，“小红书排版”与这次任务关系不大，我准备暂不使用。
```

用户可以继续确认使用。用户明确要求必须使用时，只要不违反系统硬规则，Resolver 应尽量纳入，并在结果中说明它的实际作用。

### 5.3 用户任务优先

用户当前明确要求可以改变 Skill 的软表达参数，例如：

- 更短；
- 更自然；
- 不要营销；
- 只改开头；
- 不要 CTA；
- 先给分析，再给稿件。

用户不能覆盖：权限、事实、ownership、Evidence、Source scope、隐私、删除 / 发布确认和其他系统安全规则。

## 6. Auto-invoked Skills

Agent 可以自动发现并调用内部 Skill，但必须满足：

1. Skill `enabled = true`；
2. 当前用户和 Workspace 有权限；
3. Skill `canAutoInvoke = true`；
4. 当前任务明确需要该能力；
5. 调用不会改变用户任务的业务含义；
6. 调用过程对用户可见。

典型例子：

```text
用户选择：老板知识口播
Agent 判断当前稿件存在明显模板化表达
自动调用：去 AI 味
```

或者：

```text
主 Skill 生成完成
→ 自动调用：事实检查
→ 返回检查结果
→ 不自动覆盖正文
```

自动调用不是隐式黑箱链路。必须在流式状态中说明：

```text
已自动调用：事实检查
```

## 7. Conflict Resolution

冲突优先级：

```text
系统不可覆盖规则
>
用户当前明确要求
>
当前任务目标
>
用户加载 / Resolver 选择的 Skill 规则
>
Agent 默认表达习惯
```

### 7.1 Skill 与系统规则

系统规则获胜。Skill 中冲突部分被忽略，并显示简短产品化原因。

### 7.2 Skill 与用户要求

- 表达参数冲突：用户要求优先；
- 方法核心步骤冲突：如果跳过会改变任务结果，询问用户；
- 事实、权限、安全冲突：用户要求无效，给出安全替代。

### 7.3 Skill 与 Skill

Resolver 不预设“哪个类型永远更高”。它根据：

- 任务目标；
- 用户明确要求；
- Skill `priorityHints`；
- `conflictsWith` / `worksWellWith`；
- 输出类型是否兼容；
- 事实边界是否冲突；
- 当前上下文是否足够；

决定组合、部分采用、顺序或询问。

示例：

```text
Skill A：详细展开
Skill B：60 秒精简
用户：控制在 60 秒
```

结果：保留必要解释，按 60 秒约束压缩。

```text
Skill A：强营销 CTA
Skill B：不营销
用户：不要营销
```

结果：采用不营销要求。

## 8. Skill Metadata

建议的 Skill metadata：

```text
displayName
description
whenToUse
whenNotToUse
capabilities
inputHints
outputHints
roleHints
conflictsWith
worksWellWith
priorityHints
factBoundary
canAutoInvoke
requiresUserIntent
version
enabled
```

建议的 `roleHints`：

```text
creation
transform
review
style
analysis
planning
```

这些字段主要供 Resolver 参考，不全部转成硬校验。系统仍需对权限、事实、安全和 destructive action 做硬校验。

Workflow Skill Contract v1 的字段可以继续作为 Skill 内容合同，但不能被解释为 Agent 的全局输出合同。

## 9. Skill-to-Skill Composition

Skill 可以声明推荐关系：

```text
worksWellWith:
- 去 AI 味
- 60 秒精简
- 事实检查
```

推荐关系只帮助 Resolver，不产生强制嵌套执行。

不实现：

- 固定 DAG；
- 强制 step executor；
- 多 Agent 编排；
- Skill 无限递归调用；
- Skill 自己修改 Skill Pool。

当 Skill 推荐另一个 Skill 时，最终是否调用仍由 Resolver 根据当前任务判断，并在状态流中说明。

## 10. Session / Workspace Persistence

G1.4.5 审查后的真实 V1 语义：

```text
V1 = PROJECT_SCOPED_PERSISTENCE
```

当前 UI 复用 `ProjectMethodSelection`。Skill 选择写入当前项目，因此：

- 同一项目刷新或重新打开页面后，已加载 Skill 仍然保留；
- 新项目默认没有这些 Skill；
- 当前没有账号级、老板级或全局 Skill 组合；
- 同一项目的新窗口会读取该项目当前的选择，这是项目级持久化，不是窗口级临时状态。

未来如果需要严格的窗口 / 会话隔离，单独引入：

```text
SESSION_SCOPED_SKILL_POOL
```

本轮不增加 session 表，也不伪装成窗口级临时池。

本轮不实现：

- 项目 Skill 档案；
- 账号 Skill 档案；
- 老板 / IP 档案；
- 常用 Skill 组合；
- 跨窗口长期 Skill 记忆（当前项目级选择除外）。

## 11. Output Freedom

系统不再固定一个全局口播输出 Schema。

### 没有 Skill

通用 Agent 根据任务决定：

- 自由文本；
- 分析；
- 表格；
- 计划；
- 修改建议；
- 结构化结果。

### 有 Skill

Skill 可以提供：

- `outputHints`；
- `outputContract`；
- 输出字段建议；
- 是否需要 Preview / Apply。

示例：

```text
口播 Skill：标题 + 正文 + 备选开头
小红书 Skill：标题 + 正文 + 标签建议
改开头任务：只返回开头候选
分析任务：返回分析结果
自由任务：FREEFORM
```

输出合同属于当前任务和 Skill，不属于通用 Agent 的永久能力边界。

## 12. Streaming Execution Status

G1.4 已将以下状态接入现有 Project Assistant SSE 通道，状态只在当前前端工作区显示，不写入对话消息，也不暴露内部 ID：

```text
TASK_READING
TASK_UNDERSTANDING
SKILL_POOL_LOADED
SKILL_ACTIVATED
SKILL_SKIPPED
SKILL_CONFLICT
AUTO_INVOKE_SUGGESTED
GENERATION_STARTED
CHECK_STARTED
COMPLETED
```

当前 Skill Pool UI 复用项目已有的 `ProjectMethodSelection` 读写边界。界面将其呈现为“已加载 Skill” chips，支持搜索、添加、移除和多选。当前后端最多允许 3 个项目 Skill，这只是 `LEGACY_COMPAT_LIMIT`，不再是产品原则；退出方案是先提升到 10 或 20，再交给 Resolver 做 relevance filtering。

执行状态必须是普通产品语言，不显示 Prompt、JSON、ID、Provider 或内部推理。

推荐状态：

```text
正在读取当前资料
正在识别任务
已加载 6 个创作能力
正在判断能力是否适用
老板表达：使用
小红书排版：本次不适用，准备暂不使用
已自动调用：事实检查
正在生成
正在检查结果
已完成
```

状态要求：

- 可见；
- 可停止；
- 不伪造已完成；
- 失败时给出恢复路径；
- 不暴露 Chain of Thought；
- 不暴露 MethodVersion ID、AIRun ID、Evidence ID、Provider 或 Model。

## 13. System Guardrails

无论加载多少 Skill，都不能覆盖：

- Workspace permission；
- privacy；
- FactGate；
- Evidence；
- ownership；
- Source scope；
- attribution；
- confirmed facts boundary；
- destructive action safety；
- publish / delete confirmation；
- Provider、数据库和安全配置边界。

Resolver 只能在这些边界之内自由组合。

## 14. Default Method Role

Default method 不再是所有任务永久自动注入的完整第二方法层。

未来角色：

1. 在明确的 specific task 兼容路径中提供 fallback；
2. 可以提供少量通用产品表达建议；
3. 不应覆盖用户任务；
4. 不应和用户 Skill 叠加成两套完整方法；
5. 不应为 General Agent 自由任务自动绑定口播、五段式、60 秒或 CTA。

如果用户加载了适用 Skill，Resolver 可以选择不使用 default method，或只取不冲突的轻量提示，并向内部执行计划说明原因。

## 15. ip-strategist Migration

当前 `ip-strategist` adapter 由 `ai-run-service` 对所有 `GENERATE_MOTHER_CONTENT` 自动加载，这属于 `REMOVE_AUTO_INJECTION` 迁移项。

未来处理方式：

- 保留版本、许可证、来源和 8,000 字符预算；
- 将其包装为普通 Skill / capability metadata；
- 用户可以加载；
- Resolver 可以在适用时自动发现，但必须可见；
- 不再由母稿生成路径固定注入；
- 不再作为 Agent 的默认表达人格；
- 不提升为系统事实来源。

## 16. Future Saved Profiles

未来可以支持：

- 项目常用 Skill 组合；
- 账号常用 Skill 组合；
- 老板 / IP 常用表达组合；
- 工作台配置。

这些配置必须是可见、可修改、可取消的用户偏好，不得静默变成系统硬规则。

## 17. V1 Boundaries

G1.1 只完成架构和文档修订，不实现：

- 全自动无限 Skill 搜索；
- Skill Marketplace；
- 外部 GitHub Skill 自动安装；
- 复杂 DAG；
- 多 Agent 编排；
- Skill 自修改；
- Darwin 自动进化；
- 自动保存长期档案；
- 跨窗口长期 Skill 记忆；
- 自动发布。

下一 Runtime 阶段优先验证：

```text
多 Skill
+ Resolver
+ 冲突判断
+ 自动调用
+ 流式状态
+ 系统安全边界不变
```
