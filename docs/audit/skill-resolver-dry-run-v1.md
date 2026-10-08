# Skill Resolver Dry Run v1

- 阶段：G1.2 / G1.3 / G1.4
- 状态：已实现确定性 Dry Run、General Agent 无 Skill 边界、可选 Model-assisted Dry Run、Skill Pool UI 和 Resolver 产品状态，未启用完整 Resolver 执行
- 基线：`52af226234720a8ec163c7f5a32b34c8cc0d6db4`
- 目标：在不切换完整 Agent Runtime 的前提下，记录 Skill 适用性、fallback、冲突和自动调用建议。

## Current Behavior Before G1.2

```text
GENERATE_MOTHER_CONTENT
→ ProjectContextBuilder
→ default method
→ selected methods
→ 自动加载 ip-strategist
→ 固定母稿 Prompt / Schema
→ MethodUsage 同时记录 default + selected
```

## G1.2 Behavior

```text
当前任务
+ selected methods
+ default fallback metadata
→ Skill Resolver Dry Run
→ activated / skipped / conflict / auto-invocation plan
→ 生成继续使用现有 specific-task 兼容路径
```

## G1.3 Behavior

```text
PROJECT_ASSISTANT / General Agent
→ 读取用户请求、项目、资料、当前稿件和系统安全边界
→ 无 selected Skill 时不查询、不注入 workspace default method
→ 不隐式加载 ip-strategist、ORAL_VIDEO_SCRIPT 或口播格式约束
```

`GENERATE_MOTHER_CONTENT` 仍是明确的 specific-task 兼容路径；它可以使用 default method，但审计标记为 `LEGACY_COMPAT_SPECIFIC_TASK_FALLBACK`，不代表 General Agent 默认行为。

Model-assisted Resolver 现在提供可选 Dry Run：模型返回 activated / skipped / auto-invoked / conflicts / order / confirmation 计划，之后由 deterministic guard 重新验证 Skill 存在、授权、enabled、Workspace scope、`canAutoInvoke` 和 `requiresUserIntent`。模型计划不会在本阶段绕过安全边界或直接改变实际上下文。

G1.4 在现有 Agent rail 上增加当前项目 Skill Pool。添加、移除和搜索复用 ProjectMethodSelection；真实生命周期是 `PROJECT_SCOPED_PERSISTENCE`，不是窗口级临时状态。Resolver 状态通过 SSE 事件映射为普通产品语言，状态不落库，不展示 Prompt、JSON、ID 或隐藏推理。Auto Invoke 仍只显示“建议自动调用”。

### G1.4.5 Truthfulness Audit

| 状态 | 真实语义 | 分类 |
| --- | --- | --- |
| `TASK_READING` | 发送后进入项目 / 资料上下文准备阶段；事件在读取完成前发出 | `UI_PHASE` |
| `TASK_UNDERSTANDING` | ContextBuilder 已返回，准备进入权限、事实和模型执行；不是隐藏思考结果 | `UI_PHASE` |
| `SKILL_POOL_LOADED` | 已从当前项目读取 Skill，并完成 Resolver 输入准备 | `RESOLVER_DECISION` |
| `SKILL_ACTIVATED` | Resolver 将 Skill 放入当前上下文；已加载的 Skill 会进入生成上下文 | `RESOLVER_DECISION` |
| `SKILL_SKIPPED` | Resolver 明确记录跳过及原因；被跳过 Skill 不应进入上下文 | `RESOLVER_DECISION` |
| `SKILL_CONFLICT` | Resolver 记录冲突和产品语言建议；不等于已执行冲突解决动作 | `RESOLVER_DECISION` / `DRY_RUN_ONLY` |
| `AUTO_INVOKE_SUGGESTED` | 只记录自动调用建议，没有执行另一个 Skill | `DRY_RUN_ONLY` |
| `GENERATION_STARTED` | 即将调用当前模型的流式生成 | `REAL_EXECUTION` |
| `CHECK_STARTED` | 模型返回后执行 deterministic fact-risk / post-check | `REAL_EXECUTION` |
| `COMPLETED` | 结果已写入 AssistantMessage 并准备发送完成事件 | `REAL_EXECUTION` |

其中 `TASK_READING`、`TASK_UNDERSTANDING` 是可见阶段提示，不代表系统展示了模型隐藏推理。当前默认 Project Assistant 路径不启用真实 Auto Invoke。

### Resolver 输出

当前记录字段：

- `dryRun`
- `loadedSkills`
- `activatedSkills`
- `skippedSkills`
- `autoInvokedSkills`
- `conflicts`
- `executionOrderHints`
- `outputHints`
- `needsUserConfirmation`

这些字段是产品级审计信息，不包含 Prompt、JSON 执行细节、Chain of Thought、Provider、Model 或内部运行 ID。

## Implemented Rules

1. 在明确传入 fallback 的 specific-task / 快捷动作中，没有 selected Skill 时，default method 作为 fallback 激活；General Agent 不传入该 fallback。
2. 存在 selected Skill 时，default method 记录为 skipped，不再进入当前生成上下文。
3. 多个 selected Skill 可以同时进入 Resolver plan。
4. `conflictsWith` 和用户短内容要求可以形成冲突记录。
5. `canAutoInvoke` 且任务明显包含检查意图的内部 Skill，会进入 `autoInvokedSkills` 建议。
6. auto-invocation 本轮只记录，不执行。
7. Resolver 不替换现有 `GENERATE_MOTHER_CONTENT` Schema。
8. `PROJECT_ASSISTANT` 无 selected Skill 时不再带入 default method。
9. `AIRun.metadata` 记录 `resolverMode`，当前默认值为 `DETERMINISTIC_DRY_RUN`；可选模型路径记录 `MODEL_ASSISTED_DRY_RUN`。
10. 未知 Skill ID、越权 Workspace Skill 或不满足自动调用条件的 Skill 会被 deterministic guard 拒绝。

## Not Switched Yet

- 没有真正执行 Resolver 排序后的 Skill；
- 没有让 Model-assisted plan 直接改写实际执行上下文；
- 没有自动调用 Humanizer / Fact Check；
- 没有新增用户可见 Resolver 状态；
- 没有新增 `@` UI；
- 没有支持多个 output type；
- 没有取消当前 specific-task 的口播输出字段；
- 没有移除 `MethodAsset`、`MethodVersion`、`ProjectMethodSelection` 或 `MethodUsage`；
- 没有做数据库迁移。

## Next Runtime Switch

下一步需要在独立阶段验证：

1. Resolver plan 是否可以安全成为 Prompt 的唯一 Skill 输入；
2. default fallback 是否需要通过 feature flag 切换；
3. Skill conflict 是否需要用户确认；
4. auto-invocation 的停止、失败和重试语义；
5. 多输出类型与各 Skill outputContract 的兼容方式；
6. UI 如何展示流式状态而不暴露内部实现。
