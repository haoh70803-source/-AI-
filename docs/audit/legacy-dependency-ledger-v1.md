# Legacy Dependency Ledger v1

- 审计日期：2026-09-16
- 稳定基线：`feat/production-readiness-v1b` / `09fe9c211145e04ec7d6430805e326c98364d048`
- 阶段：P3 Phase B Batch 2，清理首批孤儿 CSS + 审计第二批 UI；不删除第二批组件或数据库对象
- 证据优先级：生产 import / route > API / service 调用链 > 测试 > 数据库现实

本账本只记录历史模块的真实状态和后续处理建议。`LEGACY_UNUSED` 只适用于当前层级没有生产入口的模块；如果它背后的 API、Service、数据库模型或真实数据仍被其他路径使用，必须单独保留后端能力，不能因为 UI 废弃而级联删除。

## 1. Executive Summary

当前生产主路径已经收敛为：

```text
/dashboard
  ├─ 无 project：WorkbenchStart
  └─ 有 project：StudioShell
                   ├─ StudioDefaultMethod / AssistantThread
                   ├─ ContentCanvas
                   ├─ Draft / MotherContent
                   ├─ MaterialAnalysis / MaterialDistillation
                   └─ Platform / Review / Publishing 后续链路

/library/[id]
  └─ Material Detail → Transcript → MaterialAnalysis → MaterialKnowledge → MaterialDistillation → 进入创作
```

P3 Phase A 通过静态生产引用扫描确认，以下 10 个组件文件没有被当前生产代码 import：

- `assistant-dock.tsx`
- `dashboard-assistant.tsx`
- `creation-launchpad.tsx`
- `library-subnav.tsx`
- `retry-ingest-button.tsx`
- `project-status-panel.tsx`
- `project-archive-button.tsx`
- `evidence-board.tsx`
- `deep-content-workspace.tsx`
- `ai-creation-panel.tsx`

其中第一批五个纯 UI 残留已在 P3 Phase B Batch 1 删除。其余历史 UI 虽然没有当前入口，但分别连接 Unified Analysis、Deep Content、Evidence、Project transition 或 ingest retry 能力，不能直接级联删除其 API、Service、Model 或数据。

真实数据库检查未完成：本机 `.env.local-real` 指向的 `127.0.0.1:55432/content_center` 当前不可达，Docker Compose 开发服务也未运行。因此所有数据库行数均不臆测为 0；相关项统一记录为 `UNKNOWN`。旧诊断文档中的历史快照只能作为历史证据，不能代替本次数据库复核。

## 2. Legacy Dependency Ledger

| 模块 | UI | API | Service | DB | Real Data | 当前入口 | 替代能力 | 状态 | 建议 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AssistantDock | 已在 Batch 1 删除；删除前无生产 import；仅被自身 CSS 命中 | 无专属 API | 无 | N/A | N/A | 无 | 当前 Studio `StudioDefaultMethod`、Discovery 自有助手、全局搜索 | `LEGACY_UNUSED` | 已删除；不删除 AssistantThread 或统一助手服务 |
| DashboardAssistant | 已在 Batch 1 删除；删除前无生产 import；只有 `.dashboard-help-*` CSS | 无 | 无 | N/A | N/A | 无 | `WorkbenchStart` 和项目态 `StudioShell` | `LEGACY_UNUSED` | 已删除 |
| AssistantShell | 已在 Batch 1 删除；删除前只被 AssistantDock / DashboardAssistant 使用 | 无 | 无 | N/A | N/A | 无 | 当前助手由 `StudioDefaultMethod` 自有 UI 渲染 | `LEGACY_UNUSED` | 已删除；不影响当前 Studio Assistant |
| CreationLaunchpad | 已在 Batch 1 删除；删除前无生产 import；旧 Dashboard 入口 | 仅客户端路由跳转，无业务 API | 无 | N/A | N/A | 无 | `WorkbenchStart` | `LEGACY_UNUSED` | 已删除；专属 CSS 在本轮 Batch 2 清理 |
| LibrarySubnav | 已在 Batch 1 删除；删除前无生产 import | 无 | 无 | N/A | N/A | 无 | Library / Methods 页面自己的标题区与链接 | `LEGACY_UNUSED` | 已删除 |
| RetryIngestButton | 文件存在；无生产 import | 调用 `/api/ingest-jobs/[id]/retry` | 重试 endpoint 与 Worker 仍有效 | `IngestJob` | UNKNOWN | 无 | 资料详情 `SourceActions` 的“重试采集” | `LEGACY_UNUSED`（UI 层） | 只可删除组件文件；保留 retry API、Worker 和失败重试能力 |
| ProjectStatusPanel | 文件存在；无生产 import | 调用 `/api/projects/[id]/transition` 和项目删除 API | `project-service.transitionProjectStatus` 仍被项目页使用 | `ContentProject` | UNKNOWN | 无 | 当前项目页状态分组和 `ProjectCardMenu` | `LEGACY_UNUSED`（UI 层） | 不列入第一批；先确认旧项目详情外部依赖，再删 UI |
| ProjectArchiveButton | 文件存在；无生产 import | 调用项目 transition API | 同一 transition service 仍有效 | `ContentProject` | UNKNOWN | 无 | `ProjectCardMenu` | `LEGACY_UNUSED`（UI 层） | 不删除共享归档能力；后续可删除纯 UI 文件 |
| AICreationPanel | 文件存在；无生产 import；包含 Unified Analysis 和局部改写 UI | `/api/projects/[id]/ai/run`、`ai/runs/[runId]/apply`、`discard` | `runUnifiedCreativeAnalysis`、`runAIAction`、`ai-api` 仍存在；有测试与旧 E2E | `UnifiedCreativeAnalysis`、`AIRun`、`ApiUsage` | UNKNOWN | 当前主 Studio 不再渲染该组件 | `StudioShell`、`StudioDefaultMethod`、`ProjectContextBuilder`、MaterialAnalysis | `LEGACY_UNUSED`（UI 层） / 后端 `LEGACY_USED` | 暂不删除组件、API、Service、Model；先决定 Unified Analysis 是否保留为隐藏兼容能力 |
| Unified Creative Analysis | 当前主 Studio 不触发；旧 AICreationPanel、API 与测试仍存在 | `POST /api/projects/[id]/ai/run`，action=`UNIFIED_CREATIVE_ANALYSIS` | `apps/web/server/unified-analysis/*` | `UnifiedCreativeAnalysis`、`AIRun`、`PromptTemplate`、migration | UNKNOWN；数据库不可达 | 非主路径；仍可通过 API / 测试路径触发 | 当前默认路径使用 MaterialAnalysis + CreativeBrief + ProjectContextBuilder | `LEGACY_USED` | 不删除；保留 provenance、fingerprint、权限和失败语义，后续评估与外部 GPT / Skill 决策层的复用边界 |
| DeepContentWorkspace | 文件存在；无生产 import | Deep Content Package、GPT Task Package、Import GPT Draft 多组 API | `apps/web/server/deep-content/*` | `DeepContentPackage`、`AIRun`、PromptTemplate | UNKNOWN；数据库不可达 | 当前主 Studio 不渲染；外部 GPT 手工协作路径仍有 API 和测试 | 外部 GPT 做决策 / Skill，内部系统执行；Publishing / Review 仍读取已保存 package | `LEGACY_UNUSED`（UI 层） / package `LEGACY_USED` | 不因为 UI 无入口而删除；保留 package、GPT task、import 和版本边界，等待产品决策 |
| DeepContentPackage | 无当前主 UI，但服务、API、测试、Review、Publishing 都有调用 | GET / PUT / generate / apply / GPT task / copied / import | Deep Content service、GPT task package、GPT draft import | `DeepContentPackage`、`AIRun`、`PromptTemplate` | UNKNOWN；历史诊断快照曾记录 0 行，但不是本次证明 | Review / Publishing 服务端读取最新非 ARCHIVED package | 外部 GPT / Skill 工作流的结构化交接层 | `LEGACY_USED` | 保留数据和迁移；后续若冻结只能先禁用入口，不删历史数据 |
| EvidenceBoard | 文件存在；无生产 import | `/api/projects/[id]/evidence`、`[evidenceId]`、`creative-basis` | `evidence-service`、`studio/creative-basis` | `EvidenceItem` | UNKNOWN；数据库不可达 | 当前 Studio 使用上下文事实摘要和 Assistant 结果，不渲染该组件 | `CreativeBasisSummary`、当前 Studio 上下文、FactGate | `LEGACY_UNUSED`（UI 层） | 可以单独评估 UI 删除；绝对不能删除 EvidenceItem、evidence-service 或 FactGate |
| EvidenceItem / FactGate | Evidence service 被 API、AI context、Review、Publishing 使用；FactGateV2 在 AI control service 中使用 | Evidence CRUD API 仍存在 | `evidence-service`、`fact-gate-v2`、`context-builder-v2` | `EvidenceItem`、ownership/status 字段 | UNKNOWN；历史快照曾记录 0 行，但不是本次证明 | 当前生成、审核、Publishing 和安全上下文依赖 | 当前事实纪律底座 | `ACTIVE` | 不删除；不把 EvidenceBoard UI 的废弃等同于 Evidence 能力废弃 |
| AssistantThread / AssistantMessage | `StudioDefaultMethod` 通过 `StudioShell` 生产渲染 | `/api/projects/[id]/assistant`、messages、save | `apps/web/server/assistant/service.ts`、AI control | `AssistantThread`、`AssistantMessage`、`AIRun` | UNKNOWN；历史快照曾记录 4 个 AssistantThread，但不是本次证明 | 当前 Studio 鑫小助 | 统一上下文助手 | `ACTIVE` | 保留；与 AssistantDock / DashboardAssistant 分开看待 |
| `/projects/[id]` | 页面存在 | 无业务 API；直接 redirect | Next route redirect 到 `/dashboard?project=:id` | N/A | N/A | 旧 URL / 外部书签 / 历史测试 | `/dashboard?project=:id` | `ACTIVE_COMPATIBILITY` | 保留 redirect，不删除 |
| `/projects/[id]/studio` | 页面存在 | 无业务 API；直接 redirect | Next route redirect 到 `/dashboard?project=:id` | N/A | N/A | 大量历史 E2E、旧文档、旧外部链接 | `/dashboard?project=:id` | `ACTIVE_COMPATIBILITY` | 保留 redirect；移除前必须清理外部和测试依赖 |
| `/projects/methods` | 页面存在 | 无业务 API；直接 redirect | Next route redirect 到 `/library/methods` | N/A | N/A | 旧助手链接、历史文档、旧测试 | `/library/methods` | `ACTIVE_COMPATIBILITY` | 保留 redirect |
| ip-strategist writing method | 无前端入口；server-only adapter | 作为 `GENERATE_MOTHER_CONTENT` 的内部上下文，不单独开放 API | `apps/web/server/ai/writing-methods/ip-strategist.ts` 由 `ai-run-service` 调用 | 无专属 model；结果记录在 `AIRun` metadata / MethodUsage 关联上下文 | 真实使用量 UNKNOWN | 当前母稿生成真实调用 | 当前母稿生成链路的最低优先级表达方法 | `ACTIVE`（隐藏 server-only） | 不归 Legacy；保留许可证、版本、8,000 字符上限和语义锚点测试 |
| cangjie reference | 无 runtime import；只在方法论文档中被引用 | 无 | 无 | 无 | N/A | 无 | 只作参考思想，不编译成 Skill | `EXPERIMENTAL`（REFERENCE_ONLY） | P3 不删除；不新增 runtime 接入 |
| Local FunASR | Python 服务与 TypeScript Provider / Worker 仍存在 | Worker 转写路径调用 localhost-only ASR adapter | `packages/providers`、`apps/worker`、`services/local-asr` | `Transcript`、`IngestJob`、`ApiUsage` | UNKNOWN；历史数据依赖未能本次查询 | 开发环境 primary；历史 Transcript 可能使用 | Production Doubao primary；未来迁移方案 | `TRANSITIONAL` | P3 不删除；退出条件留到 P4：历史数据迁移/保留策略、Doubao 替代验证、回滚方案完成后再评估 |
| Publishing | 当前日历、Review、PublishTask 服务和测试存在 | `/calendar`、PublishTask、review API | `server/publishing`、Review / Quality Gate | `PublishTask`、`PlatformVariant`、`ReviewRecord` | UNKNOWN | `/calendar` 作为次级入口，非一级导航 | 人工审核后的发布任务链 | `ACTIVE` | README 的“Publishing 未实现”属于文档漂移；不删除 |
| Material Detail main chain | `/library/[id]` 当前生产入口，P1 functional / integrated E2E 通过 | Transcript、MaterialAnalysis、Knowledge、Distillation、metadata refresh API | `server/material-detail`、material-analysis、material-knowledge、distillation | `SourceItem`、`Transcript`、`MaterialAnalysis`、`MaterialDistillation` | UNKNOWN；数据库不可达 | 资料库 → 资料详情 → 进入创作 | P1 稳定资料主链 | `ACTIVE` | 不冻结、不删除；继续由 P1 能力基线保护 |
| Method usage | 当前 Studio 方法选择和母稿生成读取 | `/api/projects/[id]/methods`、生成 action | `project-methods`、`creator-methods`、`ai-run-service` | `MethodAsset`、`MethodVersion`、`MethodUsage`、`ProjectMethodSelection` | UNKNOWN | `/library/methods` 与 Studio 方法选择 | 创作方法资产体系 | `ACTIVE` | 不删除；方法使用记录是事实和质量反馈底座 |

## 3. API / Service / DB Call Chain Notes

### Legacy UI with no production chain

```text
AssistantDock / DashboardAssistant / CreationLaunchpad / LibrarySubnav
  → 无生产 import
  → 无生产 route
  → 无专属 API / Service / DB
  → 可进入纯 UI 删除候选
```

### Unified Creative Analysis

```text
AICreationPanel（当前无生产 import）
  → POST /api/projects/[id]/ai/run
  → runUnifiedCreativeAnalysis / ai-api
  → UnifiedCreativeAnalysisContextBuilder
  → PromptTemplate + LLMRuntime
  → AIRun + UnifiedCreativeAnalysis + ApiUsage
```

当前 `workbench-page-data.ts` 不读取 Unified Analysis 状态，也没有把它作为默认 Studio 前置步骤；但 API、Service、数据库模型、测试和旧 E2E 仍存在，所以只能标为 `LEGACY_USED`，不能标为 `SAFE_DELETE_CANDIDATE`。

### Deep Content / External GPT

```text
DeepContentWorkspace（当前无生产 import）
  → deep-content-package / gpt-task-package / import-gpt-draft routes
  → deep-content service / GPT Task Package / Draft Import
  → DeepContentPackage + AIRun + PromptTemplate
  → Review / Quality Gate / Publishing 读取已保存结果
```

它符合“外部 GPT / Skill 做决策层，内部系统执行”的潜在交接边界，不能因为当前主 Studio 不展示就删除。

### Evidence / FactGate

```text
Evidence API / AI context / Review / Publishing
  → evidence-service / CreativeBasis / FactGateV2
  → EvidenceItem + ownership + status
  → 当前 Studio 上下文、母稿生成、审核和发布安全边界
```

EvidenceBoard 是 UI 层残留；EvidenceItem、ownership、FactGate 和来源约束是当前核心资产。

### Current compatibility routes

```text
/projects/[id]          → /dashboard?project=:id
/projects/[id]/studio   → /dashboard?project=:id
/projects/methods       → /library/methods
```

这三条 redirect 仍被历史 E2E、旧文档和外部书签引用，归类为 `ACTIVE_COMPATIBILITY`，本轮不删除。

## 4. Safe Delete Candidates / Batch 1 Result

以上五个候选已在 P3 Phase B Batch 1 执行删除；本轮 Batch 2 不再处理它们：

| 候选 | 证据 | 替代 | 结论 |
| --- | --- | --- | --- |
| `apps/web/components/assistant-dock.tsx` | 删除前满足无生产 import、无 route、无 API、无 DB、无测试依赖 | Studio / Discovery 当前助手 | `DELETED_BATCH_1` |
| `apps/web/components/dashboard-assistant.tsx` | 删除前满足无生产 import、无 route、无 API、无 DB、无测试依赖 | `WorkbenchStart` 与项目态 Studio | `DELETED_BATCH_1` |
| `apps/web/components/assistant-shell.tsx` | 删除前确认只被上述两个旧助手组件使用 | 当前 Studio / Discovery 自有助手 UI | `DELETED_BATCH_1` |
| `apps/web/components/creation-launchpad.tsx` | 删除前满足无生产 import、无 route、无业务 API、无 DB、无测试依赖 | `WorkbenchStart` | `DELETED_BATCH_1` |
| `apps/web/components/library/library-subnav.tsx` | 删除前满足无生产 import、无 route、无 API、无 DB、无测试依赖 | Library / Methods 页面 header links | `DELETED_BATCH_1` |

严格条件说明：

- 以上候选只指组件文件，不包含共享后端能力。
- 不包含 `ProjectStatusPanel`、`ProjectArchiveButton`、`RetryIngestButton`，因为它们虽然没有当前生产 import，但代码内嵌了仍在使用的 transition / retry endpoint，需先做 API 依赖确认。
- 不包含 EvidenceBoard、AICreationPanel、DeepContentWorkspace，因为它们对应的后端能力仍有现实调用链或核心数据边界。
- Phase B 必须另行确认后，最多处理 3–5 个模块；本轮不自动进入 Phase B。

## 5. Legacy Used

以下模块当前主入口不再使用或不再作为主要 UI，但仍有 API、Service、数据或下游依赖，禁止直接删除：

- UnifiedCreativeAnalysis UI / backend
- DeepContentWorkspace UI / DeepContentPackage backend
- EvidenceBoard UI（Evidence core 仍为 ACTIVE）
- ProjectStatusPanel / ProjectArchiveButton / RetryIngestButton UI（共享 endpoint 仍为 ACTIVE）

它们的处理顺序应是：先决定产品是否继续保留能力，再决定是否隐藏/冻结入口，最后才评估删除代码和数据。

## 6. Transitional

### Local FunASR

状态：`TRANSITIONAL`。

当前保留理由：

- 本地服务、Provider、Worker 转写路径和相关测试仍存在。
- 历史 `Transcript` 可能记录 `LOCAL_FUNASR`，本次真实数据库不可达，不能假设没有历史数据。
- 生产文档已经把 Doubao 设为 production primary，但开发和历史兼容仍需要 Local FunASR。

建议退出条件留到 P4：

1. 完成历史 Transcript / retry / replay 数据盘点。
2. 完成 Doubao 替代路径和成本/失败语义验证。
3. 明确旧数据读取和回滚策略。
4. 再评估是否删除本地服务和 Provider。

## 7. Experimental

### cangjie

状态：`EXPERIMENTAL` / `REFERENCE_ONLY`。

当前只有文档参考，没有 runtime import、API、Service、数据库模型或自动 Skill 编译链。P3 不删除参考说明，也不新增运行时接入。

### External GPT / Skill boundary

当前项目没有把完整外部 Skill 编译进运行时。`ip-strategist` 是一个受许可证约束的 server-only 写作方法 adapter，不等于完整 Skill 系统。未来外部 GPT 负责 Skill / 决策层、内部系统执行时，应优先复用现有 Deep Content task package、import draft、Evidence、CreativeBrief 和 MethodVersion 边界，而不是复制一套新的 Agent 架构。

## 8. Core Assets That Must Not Be Deleted

- `FactGateV2`、`ownership`、`EvidenceOwnership`、`EvidenceStatus`：事实边界和外部资料约束。
- `EvidenceItem`、`evidence-service`、`CreativeBasisSummary`：正式事实、来源追踪和人工确认底座。
- `MethodAsset`、`MethodVersion`、`MethodUsage`、`ProjectMethodSelection`：创作方法资产和生成使用反馈。
- `SourceItem → IngestJob → Worker → SourceAsset / Transcript → MaterialAnalysis / MaterialKnowledge / MaterialDistillation`：当前资料主链。
- `/library/[id]` 资料详情 20 项能力基线：播放、文字稿、重转、内容理解、内容提炼、待确认内容、下载、进入创作、失败保留旧结果等。
- `AssistantThread` / `AssistantMessage` 与当前 `StudioDefaultMethod`：当前唯一生产 Studio 助手能力。
- `ContentProject`、CreativeBrief、MotherContent / DraftBranch / DraftRevision：当前创作工作流和版本安全边界。
- Review / Quality Gate / Publishing 人工确认门：不能因为 README 仍写“未实现”而删除。

## 9. Legacy CSS Inventory

P3 Phase B Batch 2 已删除确认无生产引用的第一批孤儿 CSS；未删除任何 Active 页面样式。

| CSS 组 | 生产引用判断 | 状态 | 处理建议 |
| --- | --- | --- | --- |
| `.assistant-dock-*` | 删除前仅存在于 `globals.css`；对应组件已在 Batch 1 删除 | `REMOVED_BATCH_2` | 已删除孤儿规则 |
| `.dashboard-help-*` | 删除前仅存在于 `globals.css`；DashboardAssistant 已在 Batch 1 删除 | `REMOVED_BATCH_2` | 已删除孤儿规则 |
| `.dashboard-v2`、`.creation-launchpad`、`.creation-composer` | 删除前无 TS/TSX、测试或动态 class 引用；当前使用 `.workbench-start` | `REMOVED_BATCH_2` | 已删除旧 Dashboard / Launchpad 规则 |
| `.studio-v2`、`.assistant-is-closed` | 旧三栏 Studio 规则；当前 Studio 使用 `.dashboard-workbench` / `.content-workbench` | `LEGACY_UNUSED` / 需逐段复核 | 不做全文件重构；按 selector 使用情况逐段处理 |
| `.assistant-shell-*`、`.workspace-assistant` | 删除前无 TS/TSX、测试或动态 class 引用；当前 Studio assistant 使用自有结构 | `REMOVED_BATCH_2` | 已删除孤儿规则 |
| `.dashboard-workbench`、`.content-workbench`、`.workbench-assistant` | `dashboard/page.tsx`、StudioShell、ContentCanvas 当前真实使用 | `ACTIVE` | 不删除 |
| `.research-workbench-shell`、`.research-assistant` | DiscoveryWorkspace 当前真实使用 | `ACTIVE` | 不删除 |
| `.material-*`、`.source-*`、`.transcript-*`、`.distillation-*` | `/library/[id]` 资料详情当前真实使用 | `ACTIVE` | 由 P1 capability baseline 保护 |
| `.project-list-action` | 仅旧 ProjectArchiveButton 使用；项目页实际使用 `ProjectCardMenu` | `LEGACY_UNUSED` | 先保留，待 UI 删除决策 |
| Deep Content 专属 CSS | 未发现专属 `.deep-content-*` CSS 组；组件主要使用通用 Card / utility class | `UNKNOWN` | 不因无专属 CSS 判定后端废弃 |
| Unified Analysis 专属 CSS | 未发现专属 `.unified-creative-analysis-*` CSS 组；旧组件主要使用 utility class | `UNKNOWN` | UI / backend 分开判断 |

## 10. Documentation Drift

本轮不修改既有产品文档，只记录漂移：

| 文档 | 状态 | 证据 / 漂移 |
| --- | --- | --- |
| `README.md` | `STALE`（局部） | `What Does Not Work Yet` 仍写 LLM、AI 创作、Publishing、ContentProject、Creator Memory、热点发现未实现；当前代码已有 LLM、AI、Publishing、ContentProject、Discovery 路由、Service 与测试 |
| `docs/V1_PRODUCT_ACCEPTANCE.md` | `STALE`（导航段） | 仍写一级导航“开始创作 / 项目 / 研究 / 资产”；P2 已稳定为“创作 / 资料 / 研究 / 方法” |
| `docs/CODEX_RULES.md` | `STALE`（导航段） | `/dashboard` 规则仍写“开始创作 / 项目 / 研究 / 资产”；其工程术语和单一助手边界仍有效 |
| `docs/product/product-language-v1.md` | `CURRENT` | P2 新增的四入口、实体名称、CTA 和发布入口边界与当前代码一致 |
| `docs/product-simplification-v1.md` | `CURRENT` | 默认路径不自动运行 Unified Analysis / Deep Content、当前 Studio 使用单一鑫小助，和 `workbench-page-data.ts` / StudioShell 一致 |
| `docs/studio-product-simplification.md` | `SUPERSEDED` | 文件已明确标记 ARCHIVED / SUPERSEDED；不能作为当前实施规范 |
| `docs/ai-first-mother-content.md` | `SUPERSEDED` | 文件已明确标记 ARCHIVED / SUPERSEDED；只保留历史设计说明 |
| `docs/material-analysis.md` | `STALE`（局部） | 顶部已说明旧输出契约被取代，但后段仍描述当前 Studio 会组合 UnifiedCreativeAnalysis；当前主 `workbench-page-data.ts` 不传入该结果 |
| `docs/unified-creative-analysis.md` | `STALE`（产品入口段）/ backend `CURRENT_COMPATIBILITY` | API、Service、Model、fingerprint、provenance 和测试仍存在；但“普通用户当前拥有独立 AI 深度分析入口”的描述已不符合默认 Studio |
| `docs/content-discovery.md` | `STALE`（入口表述） | 仍把 `/projects/[id]/studio` 描述为进入路径；该 URL 现在是 compatibility redirect，canonical path 是 `/dashboard?project=:id` |
| `docs/production-transcription.md` | `CURRENT` | Production Doubao primary、Development Local FunASR、产品层隐藏 Provider 细节与当前 runtime 边界一致 |
| `docs/local-asr.md` | `CURRENT` / `TRANSITIONAL` | Local FunASR 的 localhost-only、Resolver、模型边界和不伪造 Transcript 规则仍有效 |
| `docs/external-writing-methods.md` | `CURRENT` | ip-strategist 版本、许可证、server-only adapter、8,000 字符预算与当前实现一致 |
| `docs/项目诊断与优化方案-v1.md` | `SUPERSEDED` / historical | 未跟踪历史诊断文档；其中“README 未实现”“不做 Skill 编译器”等结论不能覆盖当前 P2 产品语言和外部 GPT / Skill 边界 |
| `docs/XSJ_CONTENT_LEARNING_METHOD_V1.md` | `CURRENT`（reference boundary） | 仍明确不把 cangjie 参考资料编译成 runtime Skill；可继续作为参考边界 |

后续文档清理应先更新 README、V1 验收规范和 CODEX_RULES 的漂移段落，再决定是否调整 Unified Analysis / Material Analysis 历史说明。本轮不扩展业务代码。

## 11. Database Reality

本轮使用的 `.env.local-real` 目标为：

```text
127.0.0.1:55432/content_center
```

已做的安全检查：

- `runtime-env.mjs LOCAL_REAL` 在连接前报告 `LOCAL_REAL_DATABASE_UNREACHABLE`。
- `docker compose -f docker-compose.dev.yml ps` 没有运行中的服务。
- 本机没有监听 `55432` 的 PostgreSQL 进程；测试环境的 `55433` 与本轮真实库不是同一目标。
- 因连接前置检查失败，未建立事务，未执行任何 INSERT / UPDATE / DELETE，也未运行 migration。

因此本账本对以下项使用 `UNKNOWN`，而不是 0：

- `UnifiedCreativeAnalysis`
- `DeepContentPackage`
- `AssistantThread / AssistantMessage`
- `EvidenceItem`
- `AIRun` 对应历史 action
- `MethodUsage`
- `Transcript` 中的 Local FunASR 历史依赖

未跟踪历史诊断文档曾记录一次旧数据库快照：`AssistantThread=4`、`PromptTemplate=18`、`UnifiedCreativeAnalysis=0`、`DeepContentPackage=0`、`EvidenceItem=0`。该快照没有当前数据库复核效力，只用于说明为什么本轮不能把“代码无入口”直接等同于“真实数据为 0”。

## P3 Batch 1 Cleanup Result

- 已删除 5 个纯 UI 历史组件：AssistantDock、DashboardAssistant、AssistantShell、CreationLaunchpad、LibrarySubnav。
- Batch 1 删除 commit：`ee0fd595c1f3cd5487efa36ca0fc2d2dfcf246d3`。
- Phase A Ledger commit：`ecc0e4b735b5b3be87d5b9b5c90383abe158d9ff`。
- 本轮 Batch 2 清理了上述组件留下的孤儿 CSS；没有删除 Active CSS。
- CSS diff：删除 235 行旧规则，并保留 3 个包含 Active 工作台规则的精确 selector 调整。
- CSS 删除前确认 TS / TSX、测试、动态 class、页面 HTML 和组合 selector 中没有生产引用。
- `globals.css` 保留 `.dashboard-workbench`、`.content-workbench`、`.workbench-assistant`、Research、Material Detail 等 Active 规则。
- typecheck、lint、直接 Web build、test 和 diff check 结果已记录在本账本对应审计报告中；唯一 test 失败仍为历史 Canvas stale assertion。

## P3 Batch 2 Review

本轮不删除第二批组件，状态如下：

| 候选 | 当前结论 | 证据 | 后续 |
| --- | --- | --- | --- |
| RetryIngestButton | `SAFE_UI_DELETE_CANDIDATE` | 无 production import；retry API 仍被资料详情 `SourceActions` 使用 | 后续只评估 UI 文件删除，保留 retry API / Worker |
| ProjectStatusPanel | `SAFE_UI_DELETE_CANDIDATE` | 无 production import；当前项目页使用状态分组，transition API 仍由项目菜单使用 | 后续确认旧项目详情外部依赖后再删 UI |
| ProjectArchiveButton | `SAFE_UI_DELETE_CANDIDATE` | 无 production import；`ProjectCardMenu` 已承担归档和删除 | 当前没有独立恢复 UI；保留 transition API 和归档数据 |
| EvidenceBoard | `SAFE_UI_DELETE_CANDIDATE` | 无 production import；Evidence API、EvidenceItem、ownership、FactGate、CreativeBasis 仍有效 | 只能删除 UI 层，禁止删除 Evidence 核心 |
| AICreationPanel | `LEGACY_UI_WITH_REUSABLE_BACKEND` | 无 production import，但 UnifiedCreativeAnalysis API / Service / AIRun / PromptTemplate / 测试和旧 E2E 仍存在 | 不删除；评估未来外部 GPT / Skill 工作流复用 |

第二批组件均保持未修改。数据库真实数据因 `LOCAL_REAL` 不可达，相关判断继续为 `UNKNOWN`。

## 12. Recommended First Cleanup Batch

Batch 1 已完成。后续 Batch 2 仍需单独产品决策，不能自动执行：

- RetryIngestButton
- ProjectStatusPanel
- ProjectArchiveButton
- EvidenceBoard
- AICreationPanel

删除时不得顺手删除 Assistant API、AssistantThread、Unified Analysis、Deep Content、Evidence、FactGate、Method、Local ASR、Publishing 或任何 migration / 历史数据。

## 13. Modified Files

本轮修改文件：

```text
D:\Documents\ChatGPT\内容生产中心\apps\web\app\globals.css
D:\Documents\ChatGPT\内容生产中心\docs\audit\legacy-dependency-ledger-v1.md
```

本轮删除文件：

```text
D:\Documents\ChatGPT\内容生产中心\apps\web\components\assistant-dock.tsx
D:\Documents\ChatGPT\内容生产中心\apps\web\components\assistant-shell.tsx
D:\Documents\ChatGPT\内容生产中心\apps\web\components\creation-launchpad.tsx
D:\Documents\ChatGPT\内容生产中心\apps\web\components\dashboard-assistant.tsx
D:\Documents\ChatGPT\内容生产中心\apps\web\components\library\library-subnav.tsx
```

未修改产品 API、Service、Prisma Schema、migration、Canvas、Skill、Doubao / ASR、Evidence、Unified Analysis、Deep Content 或 Publishing。

## 14. Git / Data Safety

- Phase A Ledger commit：`ecc0e4b735b5b3be87d5b9b5c90383abe158d9ff`
- Batch 1 deletion commit：`ee0fd595c1f3cd5487efa36ca0fc2d2dfcf246d3`
- 本轮 CSS / Ledger commit 尚未创建
- 本轮尚未 push
- 未 stash
- 未 reset
- 未删除数据库、migration 或历史 output / 诊断文件
- 未写入 real DB
- 真实数据库只做了连接可达性检查；读库统计因环境不可达而保留为 UNKNOWN
