# V4 S0 基线确认与实施门禁

日期：2026-10-10；工作目录：`E:\AI工作台1.2`；HEAD：`242f7b911e369d4c93d0deccc02ee368cfd90137`。验证等级 V0。**S0 检查完成，实施门禁 HOLD，尚未进入 S1。** 本次不是 Governance Update。

## 实际结果及影响分析

读取六份审计、四份权威规则与 Web 工程规则，并重读相关实现。HEAD 与审计一致，但此前审计未保存逐文件哈希，因此不能据 HEAD 相同推断工作树字节未变化。当前有 **78 个已修改 tracked 文件、241 个 untracked 文件**（本次生成文档前快照）。没有暂存文件。未归属改动一律作为用户已有工作保留。

27 项逐项复核：20 项原确定类的实现特征仍在、6 项条件性风险仍需负向运行复现、1 项未挂载候选仍需动态/日志验证。不是“27 项运行失败”，也不是已证实发生越权。

`docs/V4-IMPLEMENTATION-REPORT.md` 明确首页、ArtifactEditor、ArtifactWindow、编辑 Hook 和 UX E2E 已有另一轮修改；记录 `output/v4-ux/source-before/` 与 `source-changes.diff` 作为该轮区分材料。本次未验证那些备份能否回滚当前工作树，不能直接用其覆盖文件。现有飞书、研究、转录、V3 创作质量改动可从相应未提交文件和文档追溯，但归属未经人工确认。

S1 飞书/项目权限、S2 Agent、S3 保存和 S4 侧边栏/首页/工作区均碰到已修改文件。因此用户本次明确门禁 **“涉及其他任务的未提交修改”** 已触发。仅做 S0 和只读审核核查；不得擅自把这些工作归入本次交付。用户新增授权覆盖旧 `docs/V4-FUNCTION-DECISIONS.md` 中“功能取舍尚未批准”的历史状态：5 入口与审核降级已获当前指令授权，但不自动解除未提交工作重叠门禁。

## 27 项当前证据

| 编号 | 问题 | 当前结论 | 本轮定位 |
| --- | --- | --- | --- |
| A01 | 首页偏离长期工作入口 | 静态问题特征仍在 | `apps/web/app/(app)/home/page.tsx:6` |
| A02 | 通用 Agent 被旧内容分类拒绝 | 静态问题特征仍在 | `apps/web/server/ai/control/scope-gate.ts:3` |
| A03 | Skill 数量契约不一致 | 静态问题特征仍在 | `apps/web/server/project-service.ts:148` |
| A04 | 通用知识引用适配器未实现 | 静态问题特征仍在 | `apps/web/server/assistant/references.ts:20` |
| A05 | 事实治理到通用对话的输入不一致 | 静态问题特征仍在 | `apps/web/server/ai/control/context-builder-v2.ts:274` |
| A06 | 资料引用是逐轮的，持续引用限研究和成果 | 静态问题特征仍在 | `apps/web/server/assistant/service.ts:273` |
| A07 | 通用成果与旧审核发布链路未统一 | 静态问题特征仍在 | `apps/web/server/publishing/publish-task-service.ts:49` |
| A08 | 真实运营数据缺少作品级数据和粉丝画像 | 静态问题特征仍在 | `apps/web/lib/video-analytics.ts:21` |
| A09 | AI 复盘标签对应本地规则计算 | 静态问题特征仍在 | `apps/web/lib/video-analytics.ts:82` |
| A10 | 两个选题状态体系 | 静态问题特征仍在 | `packages/db/prisma/schema.prisma:2303` |
| A11 | 个人推荐上下文读取范围需复核 | 代码特征仍在；风险未复现 | `apps/web/server/discovery/recommendations/context-builder.ts:22` |
| A12 | 方法建议列表的个人边界不一致 | 代码特征仍在；风险未复现 | `apps/web/server/learning-suggestions/service.ts:49` |
| A13 | 默认工作区仍是大 Canvas/Studio | 静态问题特征仍在 | `apps/web/components/projects/studio-shell.tsx:410` |
| A14 | 全局 CSS 多套叠加 | 静态问题特征仍在 | `apps/web/app/layout.tsx:5` |
| A15 | Web 依赖 Worker 的实际执行入口 | 静态问题特征仍在 | `apps/web/server/embedded-worker.ts:6` |
| A16 | 项目创建重复编排与初始化差异 | 静态问题特征仍在 | `apps/web/server/sidebar/basic-project.ts:17` |
| A17 | 资料详情越界研究编排 | 静态问题特征仍在 | `apps/web/server/material-detail/service.ts:9` |
| A18 | 未发现生产导入的旧 UI 候选 | 候选文件仍在；运行使用未证实 | `apps/web/components/sidebar.tsx:41` |
| A19 | 读取项目存在惰性写入 | 静态问题特征仍在 | `apps/web/server/drafts/service.ts:122` |
| A20 | 资讯是限定本人访问的实验入口 | 静态问题特征仍在 | `apps/web/server/research/news/access.ts:6` |
| A21 | 错误被吞导致后台可观测性不足 | 代码特征仍在；风险未复现 | `apps/web/server/research/news/runtime.ts:22` |
| A22 | 运营内容的项目关联缺少外键 | 代码特征仍在；风险未复现 | `packages/db/prisma/schema.prisma:2462` |
| A23 | 旧选题启动非单事务/幂等链 | 代码特征仍在；风险未复现 | `apps/web/server/discovery/service.ts:480` |
| A24 | 对话 CHECK 不是可靠的事实核验器 | 静态问题特征仍在 | `apps/web/server/assistant/service.ts:115` |
| A25 | 重开对话和历史读取有数量截断 | 静态问题特征仍在 | `apps/web/server/assistant/service.ts:219` |
| A26 | 硬崩溃时未保存编辑与流式部分文本不可保证恢复 | 代码特征仍在；风险未复现 | `apps/web/server/assistant/service.ts:290` |
| A27 | API导出依赖components目录中的纯报告格式器 | 静态问题特征仍在 | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export/route.ts:3` |

补充核对：A03 项目设置仍最多 3 个，ContextBuilder 仍 `.slice(0, 1)`；A10 ContentIdea 与 ContentTopic 都存在；A12 决定函数约 76 行同样未显式限制 ownerUserId；A25 Artifact history 仍 take:100。A26 beforeunload 已有保护，但保护不等于持久草稿。

## 目标文件、依赖与重叠快照

clean 表示当前 Git 状态无该文件改动，并不表示其依赖也干净。M/?? 均不得直接覆盖；这些路径只是已查直接关键依赖，非全部未来修改文件。涉及 Source 读取、Skill、飞书、Artifact 的调用方及测试需要在实际阶段再次核对。

| 阶段 | 直接文件/依赖 | 原状态 | 当前 SHA256 |
| --- | --- | --- | --- |
| S1 | `apps/web/server/discovery/recommendations/context-builder.ts` | clean | `f03ce1db140d4f970d5e234e3699260d3c6e8a067417c9f130d4b2b36e0f491f` |
| S1 | `apps/web/server/learning-suggestions/service.ts` | clean | `52795aa023d5ca2b9ecc268d929fa415a7be4e1aa4fb872abb8303318d7204da` |
| S1 | `apps/web/server/sidebar/basic-project.ts` | clean | `d2f2775bda553c273426c292112aa42f135afad6258ce51d7020b6ad2eaac575` |
| S1 | `apps/web/server/project-service.ts` |  M | `5d010ad99a1eed57d69bfbb76aa5bcd66ea7db6e991d572c54a044bbf7dce7f3` |
| S1 | `apps/web/server/feishu/service.ts` |  M | `8b90c9e274545485903fb4fb20c5f85e6a25b7f803f0cff3dee6ef2a00eceaa8` |
| S1 | `apps/web/server/knowledge/feishu-context.ts` | ?? | `7dbcb302ed1e3a782f384b6883a4666b4bbcc34922a95bb86a62101fa6f812f6` |
| S1 | `packages/integrations/src/feishu/client.ts` |  M | `55802a31d9c2559bd29a811e6f343eb991387a184826862e77422eca85d98789` |
| S2 | `apps/web/server/ai/control/scope-gate.ts` | clean | `6a2fa9ca2fcc5816429831e7e4da5215473441aca3075cab1af40e35ab1f4fd8` |
| S2 | `apps/web/server/ai/control/context-builder-v2.ts` |  M | `099eda5ea773d212ba2a49482420a04135257aab1df628cc399105e3e17982b7` |
| S2 | `apps/web/server/assistant/references.ts` | clean | `a6d7cf90674cc780d551dfdbb1451b7483a7f064051fb7a4f0e02abe3717c58e` |
| S2 | `apps/web/server/assistant/service.ts` |  M | `d34fb930d68b2a0494390bda80e429b1101d67632b9f297682bfbafb5d47294a` |
| S2 | `apps/web/server/project-methods/service.ts` | clean | `5ca44fa1525ecd315f38b31f2e43dab2fc1bf5a6d5784e93302504ef50a477d9` |
| S2 | `apps/web/server/project-service.ts` |  M | `5d010ad99a1eed57d69bfbb76aa5bcd66ea7db6e991d572c54a044bbf7dce7f3` |
| S2 | `apps/web/components/projects/studio-default-method.tsx` |  M | `f2fb58fc97b40293d15e33c22f1f8690bf2ea563a820bf49e4725863c3bc3509` |
| S3 | `apps/web/server/discovery/service.ts` | clean | `c5bf02e8c75cdbf00dc1f02a81fa74da5c18f35ca9083c28d94e3cef2f8051a2` |
| S3 | `apps/web/server/project-service.ts` |  M | `5d010ad99a1eed57d69bfbb76aa5bcd66ea7db6e991d572c54a044bbf7dce7f3` |
| S3 | `apps/web/server/assistant/service.ts` |  M | `d34fb930d68b2a0494390bda80e429b1101d67632b9f297682bfbafb5d47294a` |
| S3 | `apps/web/server/artifacts/service.ts` |  M | `0fca92db714589ddaf46064b3da4fef885a4b8dbf52774ec50c2d5f95b170d5c` |
| S3 | `apps/web/server/drafts/service.ts` |  M | `a7b84fb7ca6ea78e32d7427024494ecb4a61fec49eeac77e4b7ea7bf83a0a70c` |
| S3 | `apps/web/components/projects/use-artifact-editor.tsx` |  M | `d1d13d55e4ee7676432462342b196379e1a36208b411ef9f5bdbb5d596353742` |
| S4 | `apps/web/components/sidebar-foundation.tsx` |  M | `845f4110601b484229a8b72c51a7ff6bdeb80cdde59f2d94a77634ef0194376a` |
| S4 | `apps/web/app/(app)/home/page.tsx` |  M | `cdc2105cdd84c39ffb1dc9386ba0d3a7f5f125fd96bb21565f325f844644a67b` |
| S4 | `apps/web/components/projects/studio-shell.tsx` |  M | `db08de49041520c89a0aa1c391bbc65ed6f859793e3bf059a80419c79415daf1` |
| S4 | `apps/web/components/research/research-shell.tsx` |  M | `2517d0a92a532cf538695d2f652f2e38434fdb7bf0b1df63bc111788fab2a947` |
| S4 | `apps/web/components/library/feishu-library.tsx` |  M | `d2c5709e3261c430190548e2a08cd195dd3691ad1d3d0a7c710e2f7a0abf2f9d` |
| S4 | `apps/web/components/projects/artifact-editor.tsx` |  M | `01a3f902631ff92320bdb1de70ff3cd0831c5cd28b0dc8722fd301da3e726034` |
| S4 | `apps/web/components/content-hub.tsx` | clean | `b5b8e002209e2dabb08a0c817ae3ed1fabb6197de98fdf0b94072181e406286f` |
| S4 | `apps/web/components/app-shell.tsx` | clean | `b811cd59ad1dbeade7ceb52cd342138d6df1ae592bf8250a7b93d8d7da8d8006` |
| S5 | `apps/web/server/project-service.ts` |  M | `5d010ad99a1eed57d69bfbb76aa5bcd66ea7db6e991d572c54a044bbf7dce7f3` |
| S5 | `apps/web/server/research/service.ts` |  M | `636979e3bcc1dae681d94714b03e25365454aecc12460fa4f0ed00879c82b85c` |
| S5 | `apps/web/server/material-detail/read-model.ts` |  M | `87d2315ad32c1cfb77a75c1030e38c2b11c6a1be4d5ceaaab1c52de64159cb42` |
| S5 | `apps/web/server/embedded-worker.ts` |  M | `033d4b70f8af34066af7cbaab616c5556b4e260facf506d9f27a72c3daa7ee13` |
| S5 | `apps/web/components/projects/use-artifact-editor.tsx` |  M | `d1d13d55e4ee7676432462342b196379e1a36208b411ef9f5bdbb5d596353742` |

## 追加审核决策：已完成只读核查

- `/content-review` → `ContentHub mode="review"` → 内容治理 API → `topic.review`；筛选 PENDING_APPROVAL/REWORK_REQUIRED/ON_HOLD 的 ContentTopic，是选题审批，不是平台成稿审核。证据 `apps/web/components/content-hub.tsx:66`、`apps/web/server/content-governance/service.ts:205`。
- `/projects/[id]/review/[platform]` 通过 requireWorkspace 与 getPlatformReview 加载 `PlatformReviewWorkspace`，调用 `/api/projects/{id}/platform-variants/{platform}/review/{action}`；ReviewService 持久化 ReviewRecord，人工决定更新平台稿状态，读取记录有 workspace/project/variant scope。证据页面 12–20 行、组件 55 行、服务 148–179 行。
- 侧栏 `sidebar-foundation.tsx:15` 仍有独立“内容审核”；`content-hub.tsx:69` 仍有审核和 `/projects?review=pending` 成稿审核链接。项目列表 page.tsx:166/171 与 project-service.ts:70 已消费 review=pending，并筛选 IN_REVIEW 平台稿；该链接有静态实现链，运行可达仍未验收。
- 通用 Artifact 没有平台人工审核桥接；锁定、AI CHECK、保存、导出均不能显示为人工审核通过。平台旧稿过期提示已存在。ReviewRecord、PlatformVariant、PublishTask 与历史记录不得删除。
- 本次尚未调整任何入口；死链接、浏览器导航和权限回归 NOT RUN。

## 测试环境与验收记录

根目录仅发现 `.env.example`，指定 `.env.local-test` 不存在。检查了 runtime-env.mjs 的环境隔离守卫和 packages/db/src/test-target.ts 的数据库白名单；未读取生产凭证、未查询数据库、未创建测试环境、未启动进程。存在 LOCAL_REVIEW 脚本不是 LOCAL_TEST 已配置的证明。

| 阶段 | 测试/验收门禁 | 当前结果 | 回滚边界 |
| --- | --- | --- | --- |
| S0 | 文档/HEAD/dirty 清单/27证据/审核链核查 | 静态完成；重叠未核准 HOLD | 本次只新增文档，无业务回滚 |
| S1 | 先风险负向测试，再修复；跨用户/空间、停用、VIEWER、撤权、媒体 | NOT RUN | 仅本次精确补丁；不得回退为放宽安全边界 |
| S2 | 0/多 Skill、知识/事实授权、预算与持续引用；定向 typecheck | NOT RUN | 保留旧兼容数据与接口，不引入平行架构 |
| S3 | 持久重开、局部修改、409、恢复、长历史、停止/超时/中断 | NOT RUN | 恢复追加历史，不覆盖既有成果 |
| S4 | 5 主入口、审核深链、权限、手机、键盘、dirty 状态 | NOT RUN | 精确 UI 反向补丁，保留旧 URL |
| S5 | 创建/研究/资料/编辑契约模块回归与 typecheck | NOT RUN | 分模块补丁，不删表/文件，不迁移生产 |
| S6 | 13 候选动态/测试/外部/日志/历史核查 | NOT RUN；无删除授权 | 仅候选清单 |

阶段报告必须记录修改前后行为、实际命令/结果/环境/失败/实体版本证据；任何阶段失败则停止。C01–C16 状态列入 V4_TEST_REPORT.md。真实中文模型测试及人工评价未运行；付费或生产凭据测试另行批准。未完成项不能算完成率。

## 待人工确认（恢复实施的前置条件）

1. 是否授权在表内相关既有未提交改动基础上，以精确补丁继续 S1–S5，并保留原改动；还是这些文件由其他任务继续持有？授权后每次修改前重查哈希和 diff，无法安全拆分仍停止。
2. Recommendation 的共享项目/资料/选题是否允许进入个人模型推荐，以及 MethodSuggestion.ownerUserId 的私有/共享规则，权威规则未完整定义；需在 S1 修改 query 前明确，不能自行新增共享政策。
3. 隔离 LOCAL_TEST 配置尚未确认。不得拿 LOCAL_REAL 或历史 LOCAL_REVIEW 成功结果替代。后续可在已有安全本地配置明确后评估复用或建立测试库，但本轮未运行迁移。

## 已有工作区完整清单（不含本轮新报告）

```text
 M apps/web/app/(app)/home/page.tsx
 M apps/web/app/(app)/research/results/[kind]/[id]/page.tsx
 M apps/web/app/(app)/research/session/[id]/page.tsx
 M apps/web/app/api/feishu/route.ts
 M apps/web/app/api/projects/[id]/artifacts/[artifactId]/route.ts
 M apps/web/app/api/projects/[id]/assistant/route.ts
 M apps/web/app/api/research/results/[runId]/share/route.ts
 M apps/web/app/api/source-items/[id]/assets/[assetId]/access/route.ts
 M apps/web/app/api/source-items/[id]/processing/route.ts
 M apps/web/components/admin/system-doubao-config-form.tsx
 M apps/web/components/integrations/integration-card.tsx
 M apps/web/components/library/feishu-library.css
 M apps/web/components/library/feishu-library.tsx
 M apps/web/components/library/source-processing-poller.tsx
 M apps/web/components/material-detail/source-workspace.tsx
 M apps/web/components/projects/artifact-editor.tsx
 M apps/web/components/projects/artifact-window.css
 M apps/web/components/projects/artifact-window.tsx
 M apps/web/components/projects/project-agent.css
 M apps/web/components/projects/studio-default-method.tsx
 M apps/web/components/projects/studio-shell.tsx
 M apps/web/components/projects/use-artifact-editor.tsx
 M apps/web/components/research/research-shell.tsx
 M apps/web/components/research/research.css
 M apps/web/components/sidebar-foundation.tsx
 M apps/web/lib/contracts/artifacts.ts
 M apps/web/lib/contracts/assistant.ts
 M apps/web/lib/source-processing-state.ts
 M apps/web/next-env.d.ts
 M apps/web/server/ai/control/context-builder-v2.ts
 M apps/web/server/artifacts/service.ts
 M apps/web/server/artifacts/view-model.ts
 M apps/web/server/assistant/prompt.ts
 M apps/web/server/assistant/service.ts
 M apps/web/server/assistant/task-state.ts
 M apps/web/server/assistant/web-search.ts
 M apps/web/server/creator-profile-service.ts
 M apps/web/server/drafts/service.ts
 M apps/web/server/embedded-worker.ts
 M apps/web/server/feishu/runtime.ts
 M apps/web/server/feishu/service.ts
 M apps/web/server/material-detail/read-model.ts
 M apps/web/server/project-service.ts
 M apps/web/server/research/service.ts
 M apps/web/server/research/sharing.ts
 M apps/web/server/studio/fact-safety.ts
 M apps/web/tests/artifacts.test.ts
 M apps/web/tests/assistant-feishu-cache.test.ts
 M apps/web/tests/assistant-stream-route.test.ts
 M apps/web/tests/assistant-task-state.test.ts
 M apps/web/tests/assistant-web-search.test.ts
 M apps/web/tests/creation-composer.test.ts
 M apps/web/tests/source-processing-state.test.ts
 M apps/worker/package.json
 M apps/worker/src/benchmark-analysis.ts
 M apps/worker/src/index.ts
 M apps/worker/src/job-recovery.ts
 M apps/worker/src/transcription-policy.test.ts
 M apps/worker/src/transcription.integration.test.ts
 M apps/worker/src/transcription.test.ts
 M apps/worker/src/transcription.ts
 M docs/agent-runtime.md
 M docs/doubao-asr.md
 M docs/production-transcription.md
 M packages/core/src/index.ts
 M packages/db/prisma/schema.prisma
 M packages/integrations/src/feishu/client.ts
 M packages/integrations/src/feishu/policy.ts
 M packages/integrations/src/feishu/service.ts
 M packages/integrations/src/index.ts
 M packages/integrations/src/schemas.test.ts
 M packages/integrations/src/schemas.ts
 M packages/integrations/src/system-config.ts
 M packages/integrations/src/system-provider-policy.ts
 M packages/providers/src/doubao/schemas.ts
 M packages/providers/src/ffmpeg-media-processor.test.ts
 M packages/providers/src/ffmpeg-media-processor.ts
 M packages/providers/src/index.ts
?? .dsh-audit-css.py
?? FEISHU_API_INTEGRATION.md
?? FEISHU_ARCHITECTURE.md
?? FEISHU_DEPLOYMENT.md
?? FEISHU_INTEGRATION_AUDIT.md
?? FEISHU_TEST_REPORT.md
?? V4_BUSINESS_FLOW_AUDIT.md
?? V4_CODE_ARCHITECTURE_AUDIT.md
?? V4_DUPLICATION_REPORT.md
?? V4_FUNCTION_VALUE_MATRIX.md
?? V4_IMPLEMENTATION_PLAN.md
?? V4_RESTRUCTURE_PROPOSAL.md
?? apps/web/app/(app)/research/teardown/page.tsx
?? apps/web/app/api/feishu/browse/route.ts
?? apps/web/app/api/projects/[id]/artifacts/[artifactId]/history/route.ts
?? apps/web/app/api/research/teardown/[runId]/export/route.ts
?? apps/web/app/api/research/teardown/[runId]/history/route.ts
?? apps/web/app/api/research/teardown/[runId]/route.ts
?? apps/web/app/api/research/teardown/route.ts
?? apps/web/components/library/feishu-knowledge-subscriptions.tsx
?? apps/web/components/library/feishu-wiki-browser.tsx
?? apps/web/components/projects/creation-controls.tsx
?? apps/web/components/research/navigation.ts
?? apps/web/components/research/teardown/teardown-workspace.tsx
?? apps/web/components/research/teardown/teardown.css
?? apps/web/e2e/creation-agent.spec.ts
?? apps/web/e2e/creation-production-smoke.spec.ts
?? apps/web/e2e/creation-quality.spec.ts
?? apps/web/e2e/teardown.spec.ts
?? apps/web/e2e/workbench-ux.spec.ts
?? apps/web/lib/contracts/creation.ts
?? apps/web/playwright.creation.config.ts
?? apps/web/playwright.production-smoke.config.ts
?? apps/web/playwright.quality.config.ts
?? apps/web/playwright.teardown.config.ts
?? apps/web/playwright.ux.config.ts
?? apps/web/server/assistant/creation-policy.ts
?? apps/web/server/knowledge/feishu-browse.ts
?? apps/web/server/knowledge/feishu-context.ts
?? apps/web/server/research/teardown/material-capability.ts
?? apps/web/server/research/teardown/service.ts
?? apps/web/tests/creation-agent.test.ts
?? apps/web/tests/creation-fact-safety.test.ts
?? apps/web/tests/creation-policy.test.ts
?? apps/web/tests/creation-quality.test.ts
?? apps/web/tests/creation-writing-real.test.ts
?? apps/web/tests/feishu-browse.test.ts
?? apps/web/tests/feishu-knowledge-subscriptions.test.tsx
?? apps/web/tests/feishu-wiki-browser.test.tsx
?? apps/web/tests/fixtures/creation-cases.ts
?? apps/web/tests/fixtures/creation-prompt-before.txt
?? apps/web/tests/fixtures/creation-quality-cases.ts
?? apps/web/tests/research-navigation.test.tsx
?? apps/web/tests/research-project-handoff.test.ts
?? apps/web/tests/teardown-chain.test.ts
?? apps/web/vitest.research-navigation.config.ts
?? apps/worker/src/llm-runtime.ts
?? apps/worker/src/teardown/capabilities.ts
?? apps/worker/src/teardown/queue.ts
?? apps/worker/src/teardown/worker.test.ts
?? apps/worker/src/teardown/worker.ts
?? apps/worker/src/transcription-chunks.test.ts
?? apps/worker/src/transcription-chunks.ts
?? apps/worker/src/video-preview.ts
?? config/environments/feishu.env.example
?? docs/V3-E2E-REPORT.md
?? docs/V3-FACT-SAFETY-REPORT.md
?? docs/V3-QUALITY-EVALUATION.md
?? docs/V3-RELEASE-READINESS.md
?? docs/V3-UX-REVIEW.md
?? docs/V4-FUNCTION-DECISIONS.md
?? docs/V4-IMPLEMENTATION-REPORT.md
?? docs/V4-REGRESSION-REPORT.md
?? docs/V4-UX-AUDIT.md
?? docs/product-review/2026-10-10/build_decisions.py
?? docs/product-review/2026-10-10/build_inventory.py
?? docs/product-review/2026-10-10/feature-decisions.json
?? docs/product-review/2026-10-10/feature-decisions.md
?? docs/product-review/2026-10-10/full-page-audit/README.md
?? docs/product-review/2026-10-10/full-page-audit/build-audit.cjs
?? docs/product-review/2026-10-10/full-page-audit/build-report.cjs
?? docs/product-review/2026-10-10/full-page-audit/final-check.cjs
?? docs/product-review/2026-10-10/full-page-audit/function-decisions.csv
?? docs/product-review/2026-10-10/full-page-audit/initial-source-snapshot.json
?? docs/product-review/2026-10-10/full-page-audit/management-review.md
?? docs/product-review/2026-10-10/full-page-audit/page-control-api-inventory.json
?? docs/product-review/2026-10-10/full-page-audit/page-metadata.json
?? docs/product-review/2026-10-10/full-page-audit/report-preview-desktop.png
?? docs/product-review/2026-10-10/full-page-audit/report-preview-mobile.png
?? docs/product-review/2026-10-10/full-page-audit/report.html
?? docs/product-review/2026-10-10/full-page-audit/report.md
?? docs/product-review/2026-10-10/full-page-audit/runtime-pages.cjs
?? docs/product-review/2026-10-10/full-page-audit/runtime-pages.json
?? docs/product-review/2026-10-10/full-page-audit/runtime-probe.json
?? docs/product-review/2026-10-10/full-page-audit/screenshot-register.json
?? docs/product-review/2026-10-10/full-page-audit/screenshots/artifact.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-invite.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-recovery.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-reset.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-verify.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/current-login.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/feishu.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/home.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/navigation.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/settings.png
?? docs/product-review/2026-10-10/full-page-audit/screenshots/workbench.png
?? docs/product-review/2026-10-10/full-page-audit/verification-artifacts/current-runtime.png
?? docs/product-review/2026-10-10/full-page-audit/verification-artifacts/report-export-check.csv
?? docs/product-review/2026-10-10/full-page-audit/verification.json
?? docs/product-review/2026-10-10/full-page-audit/verify-report.cjs
?? docs/product-review/2026-10-10/implementation-index.md
?? docs/product-review/2026-10-10/implementation-inventory.json
?? docs/product-review/2026-10-10/report.md
?? docs/product-review/2026-10-10/verification.json
?? docs/research/navigation.md
?? docs/research/teardown-module.md
?? docs/research/teardown-reference-license.txt
?? packages/core/src/teardown.test.ts
?? packages/core/src/teardown.ts
?? packages/db/prisma/migrations/20261009083000_feishu_wiki_subscriptions/migration.sql
?? packages/integrations/src/feishu/client.test.ts
?? packages/integrations/src/feishu/contracts.ts
?? packages/integrations/src/feishu/docx.test.ts
?? packages/integrations/src/feishu/docx.ts
?? packages/integrations/src/feishu/service-boundary.test.ts
?? packages/integrations/src/knowledge/feishu-access.ts
?? packages/integrations/src/knowledge/feishu-service.ts
?? packages/integrations/src/knowledge/feishu-wiki.test.ts
?? packages/integrations/src/knowledge/feishu-wiki.ts
?? packages/integrations/vitest.feishu.config.ts
?? packages/providers/src/teardown-analysis.ts
?? qa-reports/BUG_REPORT.md
?? qa-reports/BUILD_SOURCE_CHECK.json
?? qa-reports/PERFORMANCE_REPORT.md
?? qa-reports/RELEASE_READINESS.md
?? qa-reports/RESULT_SUMMARY.json
?? qa-reports/TEST_AUDIT_REPORT.md
?? qa-reports/TEST_CASES.md
?? qa-reports/browser-results/.last-run.json
?? qa-reports/browser-results/generic-artifact-creates-A-169e6-tion-and-leaves-B-unchanged-edge/error-context.md
?? qa-reports/browser-results/generic-artifact-creates-A-169e6-tion-and-leaves-B-unchanged-edge/test-failed-1.png
?? qa-reports/browser-results/generic-artifact-creates-A-169e6-tion-and-leaves-B-unchanged-edge/trace.zip
?? qa-reports/browser-results/multi-user-security-System-9cb06--APIs-stay-workspace-scoped-edge/error-context.md
?? qa-reports/browser-results/multi-user-security-System-9cb06--APIs-stay-workspace-scoped-edge/test-failed-1.png
?? qa-reports/browser-results/multi-user-security-System-9cb06--APIs-stay-workspace-scoped-edge/trace.zip
?? qa-reports/browser-results/multi-user-security-User-A-091e7--or-relate-User-B-resources-edge/error-context.md
?? qa-reports/browser-results/multi-user-security-User-A-091e7--or-relate-User-B-resources-edge/trace.zip
?? qa-reports/browser-results/multi-user-security-ordina-1019e-from-every-system-admin-API-edge/error-context.md
?? qa-reports/browser-results/multi-user-security-ordina-1019e-from-every-system-admin-API-edge/test-failed-1.png
?? qa-reports/browser-results/multi-user-security-ordina-1019e-from-every-system-admin-API-edge/trace.zip
?? qa-reports/browser-results/qa-prelaunch-QA-E2E-01-资料引用→六轮对话→保存→刷新→退出重登→编辑保存（Mock-AI）-edge/error-context.md
?? qa-reports/browser-results/qa-prelaunch-QA-E2E-01-资料引用→六轮对话→保存→刷新→退出重登→编辑保存（Mock-AI）-edge/test-failed-1.png
?? qa-reports/browser-results/qa-prelaunch-QA-E2E-01-资料引用→六轮对话→保存→刷新→退出重登→编辑保存（Mock-AI）-edge/trace.zip
?? qa-reports/doubao-console-control.mjs
?? qa-reports/doubao-flash-probe.mjs
?? qa-reports/doubao-official-probe.mjs
?? qa-reports/doubao-stream-doc.mjs
?? qa-reports/doubao-stream-probe.mjs
?? qa-reports/generate-reports.mjs
?? qa-reports/logs/api-performance.json
?? qa-reports/logs/browser-edge.receipt.json
?? qa-reports/logs/browser-production-current.receipt.json
?? qa-reports/logs/browser-production-final.json
?? qa-reports/logs/browser-production-final.receipt.json
?? qa-reports/logs/browser-production-list.receipt.json
?? qa-reports/logs/browser-production-verification.receipt.json
?? qa-reports/logs/browser-production.json
?? qa-reports/logs/browser-production.receipt.json
?? qa-reports/logs/browser-start-check.receipt.json
?? qa-reports/logs/browser-tests-final.receipt.json
?? qa-reports/logs/browser-tests.json
?? qa-reports/logs/browser-tests.receipt.json
?? qa-reports/logs/browser-unit-regression.receipt.json
?? qa-reports/logs/build.receipt.json
?? qa-reports/logs/core-final.json
?? qa-reports/logs/core-final.receipt.json
?? qa-reports/logs/core-regression.json
?? qa-reports/logs/core-regression.receipt.json
?? qa-reports/logs/core-tests.json
?? qa-reports/logs/core-tests.receipt.json
?? qa-reports/logs/custom-final.json
?? qa-reports/logs/custom-final.receipt.json
?? qa-reports/logs/custom-regression.json
?? qa-reports/logs/custom-regression.receipt.json
?? qa-reports/logs/custom-tests.json
?? qa-reports/logs/custom-tests.receipt.json
?? qa-reports/logs/dependency-audit.json
?? qa-reports/logs/dependency-audit.receipt.json
?? qa-reports/logs/extended-final.json
?? qa-reports/logs/extended-tests.json
?? qa-reports/logs/extended-tests.receipt.json
?? qa-reports/logs/final-test-lint.receipt.json
?? qa-reports/logs/global-lint-direct.receipt.json
?? qa-reports/logs/global-static.receipt.json
?? qa-reports/logs/lint.receipt.json
?? qa-reports/logs/material-chain-regression.receipt.json
?? qa-reports/logs/material-chain-typecheck-final.receipt.json
?? qa-reports/logs/material-chain-typecheck.receipt.json
?? qa-reports/logs/material-cloud-readiness.receipt.json
?? qa-reports/logs/material-view-regression.receipt.json
?? qa-reports/logs/test-db-migration.receipt.json
?? qa-reports/logs/typecheck-config.receipt.json
?? qa-reports/logs/typecheck-core.receipt.json
?? qa-reports/logs/typecheck-db.receipt.json
?? qa-reports/logs/typecheck-integrations.receipt.json
?? qa-reports/logs/typecheck-providers.receipt.json
?? qa-reports/logs/typecheck-ui.receipt.json
?? qa-reports/logs/typecheck-web-delivery.receipt.json
?? qa-reports/logs/typecheck-web-final.receipt.json
?? qa-reports/logs/typecheck-worker.receipt.json
?? qa-reports/logs/typecheck.receipt.json
?? qa-reports/loopback-only.mjs
?? qa-reports/material-chain-diagnosis-2026-10-09.md
?? qa-reports/material-chain-isolated.mjs
?? qa-reports/material-chain-live.mjs
?? qa-reports/material-current-diagnosis.mjs
?? qa-reports/material-streaming-verification-2026-10-09.md
?? qa-reports/playwright.config.ts
?? qa-reports/playwright.production.config.ts
?? qa-reports/production-browser-results/.last-run.json
?? qa-reports/production-browser-results/generic-artifact-creates-A-169e6-tion-and-leaves-B-unchanged-edge/error-context.md
?? qa-reports/production-browser-results/generic-artifact-creates-A-169e6-tion-and-leaves-B-unchanged-edge/test-failed-1.png
?? qa-reports/production-browser-results/generic-artifact-creates-A-169e6-tion-and-leaves-B-unchanged-edge/trace.zip
?? qa-reports/production-browser-results/multi-user-security-System-9cb06--APIs-stay-workspace-scoped-edge/error-context.md
?? qa-reports/production-browser-results/multi-user-security-System-9cb06--APIs-stay-workspace-scoped-edge/test-failed-1.png
?? qa-reports/production-browser-results/multi-user-security-System-9cb06--APIs-stay-workspace-scoped-edge/trace.zip
?? qa-reports/production-browser-results/multi-user-security-User-A-091e7--or-relate-User-B-resources-edge/error-context.md
?? qa-reports/production-browser-results/multi-user-security-User-A-091e7--or-relate-User-B-resources-edge/test-failed-1.png
?? qa-reports/production-browser-results/multi-user-security-User-A-091e7--or-relate-User-B-resources-edge/trace.zip
?? qa-reports/production-browser-results/multi-user-security-ordina-1019e-from-every-system-admin-API-edge/error-context.md
?? qa-reports/production-browser-results/multi-user-security-ordina-1019e-from-every-system-admin-API-edge/test-failed-1.png
?? qa-reports/production-browser-results/multi-user-security-ordina-1019e-from-every-system-admin-API-edge/trace.zip
?? qa-reports/production-browser-results/qa-prelaunch-QA-E2E-01-资料引用→六轮对话→保存→刷新→退出重登→编辑保存（Mock-AI）-edge/error-context.md
?? qa-reports/production-browser-results/qa-prelaunch-QA-E2E-01-资料引用→六轮对话→保存→刷新→退出重登→编辑保存（Mock-AI）-edge/test-failed-1.png
?? qa-reports/production-browser-results/qa-prelaunch-QA-E2E-01-资料引用→六轮对话→保存→刷新→退出重登→编辑保存（Mock-AI）-edge/trace.zip
?? qa-reports/production-final-results/.last-run.json
?? qa-reports/run-qa.mjs
?? qa-reports/screenshots/core-1366x768.png
?? qa-reports/screenshots/core-1440x900.png
?? qa-reports/screenshots/core-1920x1080.png
?? qa-reports/screenshots/restored-artifact.png

```

## 输入文档指纹

| 文件 | 行数 | SHA256 |
| --- | --- | --- |
| `V4_CODE_ARCHITECTURE_AUDIT.md` | 2428 | `57d53428bf6ccbb856ecd2dc8764a809876cf029591fb17a7da0cd07c6babbe5` |
| `V4_FUNCTION_VALUE_MATRIX.md` | 160 | `0c845194df6a66dfece7f60a3ead97fdb2ea4ac21364e74e3241097d9b77f778` |
| `V4_DUPLICATION_REPORT.md` | 150 | `0a9fcda64c3d901ae9788f279eed76bd6dff4a124321a414013e5f736ab84afe` |
| `V4_BUSINESS_FLOW_AUDIT.md` | 134 | `24434ef75eae36e9f756dc5128e96c1f623b018cc2406ad9dc33103419f54194` |
| `V4_RESTRUCTURE_PROPOSAL.md` | 144 | `28be7466f13686c70d8276dfdd38e3d63bf0434a1526763ce36b330558922d09` |
| `V4_IMPLEMENTATION_PLAN.md` | 111 | `a2c5ef20796b7639c5932f5060a8c780151a65de13a7f2e2fdcf2da304356385` |
| `PRODUCT.md` | 61 | `6e1be7bbaf8e8a31c2e7a258326953d8d3cbb4dcd7a32db1f78cc419ec046cd3` |
| `ARCHITECTURE.md` | 72 | `c3cfb75edafae4ee4425983cc879f8e5919f771624bd84c771eca5a8818c9cb4` |
| `LEGACY.md` | 32 | `53b2b262c2e0cd1594d63c7bd3a8b71b19e19869c8f99e5356a6f3f212045a74` |
| `AGENTS.md` | 53 | `d1f06c87f96bb87682ae4f8162ec7ca4f30a9bee915bc7a6cf5a64a66db359b6` |
| `apps/web/AGENTS.md` | 9 | `ec1b6e023814ae1a510b02ea62229e5eb035d75e39e3335d5ea7f5ce5654d567` |

## 继续执行授权（2026-10-10）

用户回复“继续”，授权保留既有工作并精确扩展重叠文件。随后明确选择：个人推荐按当前用户范围；共享内容须明确加入后使用；MethodSuggestion 仅本人范围。S0 重叠和可见性决策门禁解除。已从经验证本地配置确认现有白名单 LOCAL_TEST 库 content_center_agent_test_12（127.0.0.1:55438），未运行迁移。root .env.local-test 仍不存在，但不再阻断复用实际隔离库。原快照保留，不覆盖历史。


## 实施后的关联报告

本文件保留S0原始问题、工作树与指纹。后续用户已批准个人scope及按评估选择A26最小checkpoint，实施状态以V4_EXECUTION_REPORT.md及S1–S5阶段报告为准，不改写原证据。最终220项通过、Web/Worker类型通过；实际外部服务与真实模型质量NOT RUN；S6删除0。权威五文件SHA256保持原值。Next验收自动生成next-env类型路径，原已修改文件单独列为风险，不以此覆盖原任务工作。
