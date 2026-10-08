# Agent + Skill Runtime Migration v1

- 阶段：G1.1 / G1.2 / G1.3 / G1.4 迁移账本
- 状态：G1.4 已接入 Skill Pool UI 和产品级 Resolver 流式状态；Resolver 仍为 Dry Run，完整 Runtime 切换未执行
- 基线：`52af226234720a8ec163c7f5a32b34c8cc0d6db4`
- 目标：把当前固定口播母稿运行时迁移为通用 Agent + Skill Resolver 模型。

本账本记录未来迁移边界和 G1.2-G1.4 已完成的最小运行时 / UI 变化。本轮不修改数据库、Schema 或 migration。

> G1.2 对“本轮不修改 Runtime”的原始治理方案已被本次用户任务明确覆盖：本轮允许并已执行最小 Runtime 迁移。未执行的部分仍保持兼容路径。

## G1.3 Implementation Status

| 迁移项 | 状态 | 当前行为 |
| --- | --- | --- |
| `REMOVE_AUTO_INJECTION`：ip-strategist | `COMPLETED` | `ai-run-service` 不再自动调用 `loadMotherContentWritingMethodPack`；adapter、vendor、license 和独立测试保留 |
| `RESOLVER_DRY_RUN` | `COMPLETED` | `ProjectContextBuilder` 生成确定性 Resolver plan，并将产品级结果写入 `AIRun.metadata.resolver`；不执行自动调用 |
| `DEFAULT_METHOD_FALLBACK` | `REVISED` | General Agent / `PROJECT_ASSISTANT` 无 selected Skill 时不查询、不注入 default method；`GENERATE_MOTHER_CONTENT` 保留明确的 specific-task fallback |
| `COMPATIBILITY_PATH` | `ACTIVE` | `GENERATE_MOTHER_CONTENT` 的现有口播 Schema 和任务边界保留；没有切换通用 FREEFORM 输出 |
| `MODEL_ASSISTED_RESOLVER` | `COMPLETED_DRY_RUN` | 可选模型计划 + deterministic guard；当前不直接改写执行上下文 |
| 自动调用 Skill | `DRY_RUN_ONLY` | 只记录 `autoInvokedSkills` 建议，不真正执行 |
| `AIRun.resolverMode` | `COMPLETED` | 记录 `DETERMINISTIC_DRY_RUN` 或可选 `MODEL_ASSISTED_DRY_RUN` |
| 用户可见流式 Resolver 状态 | `COMPLETED_UI_ONLY` | 复用 Project Assistant SSE；只显示产品语言，不落库、不暴露内部字段 |
| 多输出类型 | `NOT_STARTED` | `ORAL_VIDEO_SCRIPT` specific-task 兼容路径继续存在 |

## Status Values

```text
KEEP_IN_SYSTEM
KEEP_IN_GENERAL_AGENT
MOVE_TO_SKILL_METADATA
MOVE_TO_SKILL_CONTENT
MOVE_TO_RESOLVER
REMOVE_AUTO_INJECTION
LEGACY_KEEP
UNKNOWN
```

## Migration Ledger

| 当前对象 | 当前作用 | 迁移状态 | 未来归属 | 备注 |
| --- | --- | --- | --- | --- |
| FactGate / fact-safety | 事实安全、替换阻断、来源边界 | 保留 | `KEEP_IN_SYSTEM` | Skill 不能覆盖 |
| Evidence / ownership / Source scope | 来源、归属、权限 | 保留 | `KEEP_IN_SYSTEM` | 继续做服务端白名单和权限校验 |
| Workspace permission / destructive confirmation | 权限和重要修改确认 | 保留 | `KEEP_IN_SYSTEM` | 不进入 Skill metadata |
| DraftBranch / DraftRevision / Preview / Apply | 稿件状态和版本安全 | 保留 | `KEEP_IN_SYSTEM` | 生成结果仍必须 Preview / Apply |
| AIRun / ApiUsage / MethodUsage | 执行审计和使用记录 | 保留 | `KEEP_IN_SYSTEM` | MethodUsage 记录实际采用的 Skill，不记录隐式全局方法 |
| `StudioDefaultMethod` / assistant service | 通用项目 Agent、流式对话、停止、重试、保存结果 | 保留并抽象 | `KEEP_IN_GENERAL_AGENT` | 不再默认绑定口播任务 |
| `ContextBuilderV2` | 上下文预算、manifest、selected objects | 保留 | `KEEP_IN_GENERAL_AGENT` | 将 method items 改为 Resolver 产出的 plan |
| `AIControlService` / ModelRouter | Scope、权限、模型能力和执行审计 | 保留 | `KEEP_IN_GENERAL_AGENT` + `KEEP_IN_SYSTEM` | 不承载 Skill 内容 |
| `ProjectContextBuilder` | 当前项目、资料、事实、default / selected methods | 拆分 | 安全部分 `KEEP_IN_SYSTEM`；方法部分 `MOVE_TO_RESOLVER` | 逐步退出 legacy builder 作为唯一来源 |
| `generationQualityContract` | 事实、原创性、口语和一主意 | 拆分 | 安全部分 `KEEP_IN_SYSTEM`；表达部分 `MOVE_TO_SKILL_CONTENT` | 不再作为所有 Agent 的固定创作风格 |
| `motherContentBoundary` | 母稿特定任务和口播结构 | 迁移 | `MOVE_TO_SKILL_CONTENT` | 只由口播 Skill / output contract 提供 |
| `motherContentSystemBoundary` | 母稿安全与输出要求 | 拆分 | 安全部分 `KEEP_IN_SYSTEM`；输出部分 `MOVE_TO_SKILL_METADATA` | 不再作为通用 Agent 全局 Prompt |
| `motherContentProviderSchema` | `ORAL_VIDEO_SCRIPT` 固定结构 | 迁移 | `MOVE_TO_SKILL_METADATA` | 变为 Skill outputContract；通用 Agent 支持 FREEFORM / 其他合同 |
| `outputInstruction(GENERATE_MOTHER_CONTENT)` | 固定 JSON / 口播字段 | 迁移 | `MOVE_TO_RESOLVER` + Skill Contract | 不作为全局唯一输出形状 |
| `ProjectMethodSelection` | 项目选择方法版本 | 修订 | `MOVE_TO_RESOLVER` | `PROJECT_SCOPED_PERSISTENCE`；当前最多 3 个是 `LEGACY_COMPAT_LIMIT`，后续先放宽到 10/20，再由 Resolver relevance filtering |
| `MethodAsset` / `MethodVersion` | Skill / Method 资产与版本 | 保留 | `KEEP_IN_SYSTEM` + `MOVE_TO_SKILL_METADATA` | workflowContract、metadata、版本继续保留 |
| `workflowContract` | 单项 Skill 的输入、步骤、输出、事实边界 | 保留并扩展 | `MOVE_TO_SKILL_METADATA` + `MOVE_TO_SKILL_CONTENT` | 不是 Agent 全局合同 |
| `getPublishedDefaultContentMethodForStudio` | 当前默认方法 | 降级 | `MOVE_TO_RESOLVER` | 仅无适用 Skill 时 fallback，或提供轻量 hint |
| `recordGenerationMethodUsages` | 同时记录 selected + default | 修订 | `MOVE_TO_RESOLVER` + `KEEP_IN_SYSTEM` | 记录 Resolver 实际采用的 Skill 版本和 skip / auto-invoke 结果 |
| `StudioMethodSelector` | 项目 Skill Pool UI 与默认方法补充 | 重写 UI / contract | `MOVE_TO_RESOLVER` | 当前最多 3 个是 `LEGACY_COMPAT_LIMIT`；不再作为产品原则 |
| `loadMotherContentWritingMethodPack` | 每次母稿生成自动加载 ip-strategist | 迁移 | `REMOVE_AUTO_INJECTION` | 转成 Skill Pool 中可选 capability |
| `ip-strategist` 内容 | 参考机制、叙事、口语表达 | 保留内容 | `MOVE_TO_SKILL_CONTENT` | 保留许可证、来源和版本，不再隐式加载 |
| `studioQuickActionSections` | 每个快捷动作固定读取的 default sections | 降级 | `MOVE_TO_RESOLVER` | 变为任务 / Skill 所需上下文提示，不作为所有动作的默认方法层 |
| `quickSystemPrompt` | Studio 口播改写和检查规则 | 拆分 | `KEEP_IN_GENERAL_AGENT` + `MOVE_TO_SKILL_CONTENT` | 保留事实安全和预览行为，移出固定口播偏好 |
| `STUDIO_QUICK_ACTIONS` | 改开头、Humanize、精简、事实检查 | 保留为能力 | `KEEP_IN_GENERAL_AGENT` + Skill metadata | 由任务和已加载 Skill 决定是否显示 / 调用 |
| `draft-warnings` | 生成后资料风险提醒 | 保留并修相关性 | `KEEP_IN_SYSTEM` + Check Skill 输出 | 当前 uncertain 全量展示问题需单独修复 |
| `WorkflowHumanizeAction` | 去 AI 味快捷入口 | 保留能力 | `MOVE_TO_SKILL_METADATA` | 作为 transform Skill；空 replacement 时不得允许 apply |
| `ContentProductionPreview` | 口播标题、开头、CTA、时长预览 | 降级 | `MOVE_TO_SKILL_METADATA` | 只有当前 Skill 要求时展示 |
| `PlatformContentFactory` | 平台适配、Preview / Apply、人工审核 | 保留 | `KEEP_IN_GENERAL_AGENT` + `KEEP_IN_SYSTEM` | 平台 Skill / task capability 可调用，人工确认不变 |
| `ContextBuilderV2` method manifest | default + selected methodVersions | 修订 | `MOVE_TO_RESOLVER` | manifest 记录加载 / 使用 / 跳过 / 自动调用的实际状态 |
| `assistantSystemPrompt` | 当前项目通用协作助手 | 保留 | `KEEP_IN_GENERAL_AGENT` | 只保留通用理解、资料、事实、安全规则 |

## Required Resolver Plan

未来 Resolver 输出的内部计划建议包含：

```text
taskType
userIntent
loadedSkills
applicableSkills
skippedSkills + reason
conflictGroups
compositionPlan
autoInvocations
requiresUserConfirmation
outputHints
systemGuardrails
```

Resolver 计划必须可被流式状态映射为普通产品语言，但不把 JSON、Prompt、ID 或隐藏推理展示给用户。

## Runtime Migration Order

### Step 1：先拆安全边界

- 从 `generationQualityContract`、`ai-run-service` 和 `quick-actions` 中识别系统不可覆盖规则；
- 保持 FactGate、Evidence、ownership、Source scope、权限和确认门不变；
- 不改变当前输出和数据库结构。

### Step 2：建立 Skill metadata adapter

- 将现有 MethodVersion / workflowContract 映射为 Skill metadata；
- 增加 `roleHints`、`whenToUse`、`whenNotToUse`、`conflictsWith`、`worksWellWith`、`canAutoInvoke` 等设计字段；
- 先在服务端构造，不立即改 Prisma Schema。

### Step 3：实现 Resolver dry-run

- 只生成 Resolver plan；
- 不改变现有生成 Prompt；
- 记录适用 / 跳过 / 冲突原因；
- 用测试样例验证用户手选 Skill 不适用时能解释。

### Step 4：迁移主生成

- 取消 `ip-strategist` 自动注入；
- 将 `GENERATE_MOTHER_CONTENT` 固定结构改为当前主 Skill 的 outputContract；
- 没有 Skill 时允许通用 Agent 输出 FREEFORM 或任务需要的结构；
- 保持 Preview / Apply 和安全校验。

### Step 5：迁移 Quick Actions / Checks

- Humanizer、精简、改开头、事实检查变成可被 Resolver 选择的能力；
- Check Skill 默认只标记，不直接覆盖正文；
- 保持当前 `sanitizeStudioQuickActionOutput` 和 FactGate。

### Step 6：接入流式状态

- 读取资料；
- 识别任务；
- 加载 Skill；
- 判断适用性；
- 自动调用；
- 生成；
- 检查；
- 完成 / 失败 / 停止。

## Compatibility / Data Safety

- 不删除 `MethodAsset`、`MethodVersion`、`ProjectMethodSelection`、`MethodUsage`；
- 历史 MethodUsage 保持可读，不能重新解释旧记录；
- 历史 `workflowContract` 按旧版本解析；
- 当前 `ORAL_VIDEO_SCRIPT` Skill 可以继续运行；
- `ip-strategist` 旧生成记录保留来源和版本，但未来新任务不自动使用；
- 不新增 migration 作为 G1.1 的前置条件；
- 不把 Resolver plan 当作数据库长期档案；
- 不自动创建长期 Skill 组合。

## V1 Boundaries

本迁移账本不包含：

- Marketplace；
- 外部 GitHub Skill 安装；
- 无限 Skill 搜索；
- 多 Agent 编排；
- 复杂 DAG；
- Skill 自修改；
- Darwin 自动进化；
- 跨窗口 Skill 记忆；
- 自动发布。
