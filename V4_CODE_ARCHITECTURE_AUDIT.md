# V4.0 全项目代码与功能架构审计

审计日期：2026-10-10（Asia/Singapore）。对象：当前工作树，HEAD `242f7b911e369d4c93d0deccc02ee368cfd90137`。这不是 Governance Update，不改变 PRODUCT.md / ARCHITECTURE.md / LEGACY.md / AGENTS.md。

验证等级 **V0**：仅读取代码、配置样例、Schema、路由、测试定义及 Git 状态。未启动服务、未调用外部 Provider、未执行测试/typecheck/build、未查询或修改数据库，未运行 migration。存在大量既有未提交修改和未跟踪新模块，本轮包含它们，但不把历史 QA 报告视为当前通过结果。

证据强度：**确定**=代码直接可见；**风险**=存在条件性失败路径，未复现；**VERIFY**=静态扫描候选。矩阵“已完整实现”仅指所列狭义能力具备代码闭环，**不代表当前环境 API 调用成功或上线可用**。外部数据、模型、转录、队列、邮件等仍需配置和运行验收。

## 结论与扫描口径

**CURRENT IMPLEMENTATION**：不是只有界面的原型。项目创建、资料处理、持续对话、文本 Artifact、版本修订、研究报告与研究入项目均存在持久服务。**CURRENT IMPLEMENTATION GAP**：默认首页/Canvas/内容 scope/Skill 选择/知识事实供给/通用成果审核发布尚未收敛。保持已有稳定能力比整仓重写更合理。

按 `rg --files`（默认忽略规则）扫描到 **1598 个文件**；其中 apps/packages/services/scripts/config 的 TS/TSX/MJS/Python/CSS/Prisma 源文件 **1216 个**，Next 页面 **82 个**（含登录、管理、兼容跳转与设置拦截页），API 路由 **196 个**，Prisma 模型 **89 个**。这些数量不是功能总数。未扫描依赖安装内容、生成缓存、实际媒体/用户数据、.env 密钥值；配置样例和基础设施定义纳入结构盘点。大文件逐段核查，其他文件做路径、导出、导入、调用、数据访问与占位模式静态扫描，未声称逐行人工评审每个文件。

## 当前分层与依赖

| 层 | 当前代码 | 依赖与判断 |
| --- | --- | --- |
| Web 外壳 | App Router、AppShell、SidebarFoundation、ResearchShell | SSR 读服务，客户端 fetch API；旧 Sidebar 无发现生产挂载 |
| 工作区 | dashboard → loadWorkbenchPageData → StudioShell → ContentCanvas / StudioDefaultMethod / ArtifactWindow | Conversation/Artifact 已嵌入，默认宿主仍旧 Studio/Canvas |
| 业务域 | server/project、assistant、artifacts、research、material-*、methods、content-governance、publishing、video-operations | 多种研究模式和旧内容流程共存 |
| AI 控制 | AIControlService、ContextBuilderV2、ProjectContextBuilder、ScopeGate、FactGateV2、ActionPermission、ModelRouter | 权限与 Provider 具备基础；GENERAL_QUERY 仍受内容 taxonomy 限制 |
| 异步执行 | apps/worker：ingest、transcription、analysis、collection、teardown、job-recovery | BullMQ/Redis，embedded/standalone 模式共享执行实现 |
| 数据 | packages/db：Prisma/PostgreSQL，89 模型；news 磁盘缓存；本地/对象存储 | 原文、分析、快照、工作状态不是天然冗余；需要明确权威来源 |
| Provider | packages/providers：LLM、RedFox、Doubao、local-asr、FFmpeg、storage、安全 URL | 真调用受配置、模式策略和外部依赖约束 |
| Integration | packages/integrations：加密配置、系统托管、飞书知识订阅 | Provider 身份应与业务能力分离 |
| 配置与验证 | pnpm/Turbo、Compose、runtime profiles、Vitest/Playwright、ASR Python | 脚本具有真实/测试环境边界；本轮未运行 |

## 问题清单

| ID | 严重度 | 证据强度 | 问题 | 文件与位置 | 影响范围 | 代码事实/风险 | 处理建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | 高 | 确定 | 首页偏离长期工作入口 | `apps/web/app/(app)/home/page.tsx:6`；`apps/web/components/video-analytics-workspace.tsx:123` | 所有登录后首页用户 | /home 默认演示运营看板，demo 分支跳过真实 API。界面有演示标识，不能判为偷偷写入假数据。 | CURRENT IMPLEMENTATION GAP：恢复创建/最近项目/快速开始；运营看板降为独立入口。 |
| A02 | 高 | 确定 | 通用 Agent 被旧内容分类拒绝 | `apps/web/server/ai/control/scope-gate.ts:3`；`apps/web/server/ai/control/ai-control-service.ts:92` | PROJECT_ASSISTANT GENERAL_QUERY 与旧任务 | 编程作业、天气等命中正则时先拒绝；有项目也不能绕过。 | 按通用项目任务重定义业务 scope；保持 RBAC、Workspace、FactGate，不能以 Prompt 代替权限。 |
| A03 | 高 | 确定 | Skill 数量契约不一致 | `apps/web/server/project-service.ts:148`；`apps/web/server/project-methods/service.ts:119` | 首页创建、项目设置、上下文解析 | 新建最多 1 个，项目设置最多 3 个，通用ContextBuilder默认.slice(0,1)只执行1个（context-builder-v2.ts:227）；0 Skill 可行，不能宣称完全支持可组合 Skill。 | 统一可选、多选和版本校验契约；先兼容旧 selections，不新增 SkillV2。 |
| A04 | 高 | 确定 | 通用知识引用适配器未实现 | `apps/web/server/assistant/references.ts:20`；`apps/web/server/ai/control/context-builder-v2.ts:161` | KNOWLEDGE 引用与知识中心 | KNOWLEDGE 返回 unsupported；飞书授权检索已单独接入，不能据此判定全部知识功能只有 UI。 | 复用飞书与 Material 读取边界；定义 KnowledgeEntry 可见性/有效性后再接通用检索。 |
| A05 | 高 | 确定 | 事实治理到通用对话的输入不一致 | `apps/web/server/ai/control/context-builder-v2.ts:274`；`apps/web/server/ai/project-context.ts:91`；`apps/web/server/content-governance/service.ts:224` | 已确认事实、通用 Conversation 与旧生成 | 旧 ContextBuilder 读取 governedFacts；GENERAL_QUERY 分支 ownFacts=[]，不自动读取 EvidenceItem/FactRecord。后置事实检查仍在，不能认定安全检查完全缺失。 | 用共享的已确认事实读取能力供给通用上下文，保留失效/保密/双确认规则；附录验收正反例。 |
| A06 | 中 | 确定 | 资料引用是逐轮的，持续引用限研究和成果 | `apps/web/server/assistant/service.ts:273`；`apps/web/components/projects/studio-default-method.tsx:139` | 多轮资料写作、重开项目 | 资料默认不跨轮保留；某些用户文案触发自动选项目资料且上限 8；研究/成果可继承。属于当前交互语义，是否改变需审核。 | 明确“本轮资料/持续资料”；选择和版本作为任务上下文保存，避免依赖关键词猜测。 |
| A07 | 高 | 确定 | 通用成果与旧审核发布链路未统一 | `apps/web/server/publishing/publish-task-service.ts:49`；`apps/web/server/artifacts/service.ts:111` | 通用 Artifact 至审核/发布 | PublishTask 接 PlatformVariant/MotherContent，通用 Artifact 无直接发布关系。Artifact 锁定不是 ReviewRecord 人工审核。 | 阶段性保留旧流程；后续明确任务才引入以 Artifact revision 为来源的发布适配。 |
| A08 | 高 | 确定 | 真实运营数据缺少作品级数据和粉丝画像 | `apps/web/lib/video-analytics.ts:21`；`packages/db/prisma/schema.prisma:2436` | 作品表现、粉丝画像、经营闭环 | fromVideoRecords 固定 works=[] audiences=[]；真实库具备账号日记录，演示数据才有作品点与画像。 | 准确标示数据边界；FUTURE 经营域另行设计真实 PublishedWork/快照，禁止分摊账号日总量冒充作品表现。 |
| A09 | 中 | 确定 | AI 复盘标签对应本地规则计算 | `apps/web/lib/video-analytics.ts:82`；`apps/web/components/video-analytics-workspace.tsx:175` | 运营复盘与下一次创作 | 计算 insight，没有该流程的 LLM 调用、Review 持久化或结构化传项目；复制文本再打开项目。 | 改为“数据观察/规则建议”；FUTURE AI 复盘立项后才连模型与成果。 |
| A10 | 中 | 确定 | 两个选题状态体系 | `packages/db/prisma/schema.prisma:1326`；`packages/db/prisma/schema.prisma:2303`；`apps/web/components/content-hub.tsx:46` | 研究灵感与内容审批 | ContentIdea 管线索/引用/启动项目；ContentTopic 管评分/审核/事实证据/版本。职责有差异，不能直接删表。 | 入口收敛到项目候选/研究选题；先定义线索转审批的桥接和历史映射。 |
| A11 | 高 | 风险 | 个人推荐上下文读取范围需复核 | `apps/web/server/discovery/recommendations/context-builder.ts:22`；`apps/web/server/discovery/recommendations/service.ts:20` | 同 Workspace 个人推荐 | 推荐批次按用户归属，候选项目/资料/选题主要 workspace 范围；与 ARCHITECTURE 已登记问题吻合。共享对象可读不等于个人数据可用于模型。 | 按每类对象实际私有/共享规则增加服务端读取 scope；先用同空间不同用户负例证实影响，不宣称已发生泄漏。 |
| A12 | 高 | 风险 | 方法建议列表的个人边界不一致 | `apps/web/server/learning-suggestions/service.ts:47`；`packages/db/prisma/schema.prisma:1583` | 同空间、同对标账号不同用户 | 建议模型有 ownerUserId，列表查询仅 workspace + sourceBenchmarkStudy 账号；需确认建议是否允许共享。 | 对照归属契约核验 ownerUserId 与 study 创建者；授权为私有时加用户过滤，公开分享走显式边界。 |
| A13 | 中 | 确定 | 默认工作区仍是大 Canvas/Studio | `apps/web/components/projects/studio-shell.tsx:410`；`apps/web/server/workbench-page-data.ts:40` | 每次打开项目、功能变更影响半径 | 聚合母稿、默认方法、反馈、平台稿、Canvas 和 Artifact；通用项目仍承担旧工作区依赖。 | Conversation + Artifact 为默认布局；Canvas 高级视图暂存兼容，拆 UI 编排时复用现有服务。 |
| A14 | 中 | 确定 | 全局 CSS 多套叠加 | `apps/web/app/layout.tsx:5`；`apps/web/components/product-v3.css:1`；`apps/web/app/globals.css:1` | 全页面样式、选择器优先级 | globals 4404 行、product-v3 4835 行，另加载 black-titanium/apple-workbench；仅文件大小不能推出全部重复。 | 按页面实测命中和覆盖关系逐段收敛，先隔离模块样式；不再创建平行全局 CSS 系统。 |
| A15 | 中 | 确定 | Web 依赖 Worker 的实际执行入口 | `apps/web/server/embedded-worker.ts:7`；`apps/web/package.json:24` | 打包、进程资源、桌面演进 | Web 除 producer 外还启动 embedded worker；本地模式有意如此，存在部署耦合而非前端执行后端。 | 保留 embedded/standalone 模式锁；稳定 queue contract 与生命周期后再决定打包边界。 |
| A16 | 中 | 确定 | 项目创建重复编排与初始化差异 | `apps/web/server/sidebar/basic-project.ts:13`；`apps/web/server/project-service.ts:111`；`apps/web/server/content-governance/service.ts:231` | 侧栏、首页、内容审批创建项目 | 有 createBasicProject、createProject、ContentTopic 直接创建三类路径；IP snapshot/幂等/初始 Brief 不统一。基础函数还只检 role，停用状态依赖 API 上层。 | 复用 ProjectCore 基础事务，再保留各入口应用编排；停用/撤权在写入事务内复核。 |
| A17 | 中 | 确定 | 资料详情越界研究编排 | `apps/web/server/material-detail/service.ts:8`；`apps/web/server/material-detail/service.ts:9` | 资料详情、分析/提炼、方法沉淀 | 资料读取与深度理解/提炼/项目启动交织；依照权威文档属于 CURRENT IMPLEMENTATION GAP。 | 保留 read/transcript；研究编排进入 Research 场景；现有结果继续可读。 |
| A18 | 低 | VERIFY | 未发现生产导入的旧 UI 候选 | `apps/web/components/sidebar.tsx:41`；见本报告静态引用附录 | 旧侧栏、旧项目控件、旧发现页 | 路径/符号扫描无生产导入不等于运行不可达；动态装配、外部使用尚未验证。 | 13 个候选中优先复核旧 Sidebar 和重复控件；确认后只清理无挂载 UI，保留后端能力与数据。 |
| A19 | 中 | 确定 | 读取项目存在惰性写入 | `apps/web/server/workbench-page-data.ts:12`；`apps/web/server/drafts/service.ts:122` | 首次重开旧项目、VIEWER、只读巡检 | getPrimaryDraft 可创建 primary branch 或把旧 MotherContent 初始化为 revision；打开页面不是纯查询。 | 兼容初始化明确管理；审核读角色是否允许迁移写入。运行审计必须用隔离库，避免 GET 改用户库。 |
| A20 | 中 | 确定 | 资讯是限定本人访问的实验入口 | `apps/web/server/research/news/access.ts:6`；`apps/web/server/research/news/runtime.ts:11` | 普通用户导航、部署 profile | 授权依赖一个固定邮箱 + SYSTEM_ADMIN；磁盘缓存需配置；公共导航可指向普通用户不能进入的功能。 | 入口按服务端授权显示；若要团队开放需独立审批访问政策，不能把实验当普遍可用。 |
| A21 | 中 | 风险 | 错误被吞导致后台可观测性不足 | `apps/web/server/research/news/runtime.ts:22`；`apps/web/server/assistant/service.ts:290` | 资讯调度、消息心跳、间歇网络问题 | 存在静默失败；资讯有 state.error、对话终态补偿，不能判为完全无恢复。 | 保证错误码/关联 runId/终态记录；分离允许降级与必须报警的失败。 |
| A22 | 中 | 风险 | 运营内容的项目关联缺少外键 | `packages/db/prisma/schema.prisma:2462`；`apps/web/server/video-operations/service.ts:155` | 项目生命周期和运营台账 | projectId 是可空 String，创建时服务校验，但 Schema 没有 ContentProject relation；旧删除可能留下悬空关联。 | 保持数据；按业务保留规则先统计断链，再选软归档/关系约束/历史快照。 |
| A23 | 中 | 风险 | 旧选题启动非单事务/幂等链 | `apps/web/server/discovery/service.ts:447`；`apps/web/server/discovery/service.ts:481` | 并发重复点击、中途失败 | 先读 idea.project，再 createProject、逐个 addSource、最后 update idea；缺少覆盖整体的事务与 clientRequestId，可能多建或部分绑定。 | 复用已有项目幂等及事务传递能力；外部采集与最终绑定分段补偿，测试并发重试。 |
| A24 | 中 | 确定 | 对话 CHECK 不是可靠的事实核验器 | `apps/web/server/assistant/service.ts:86` | 事实检查卡片与审核决策 | structuredResultFor 将前 8 行机械标为 MEDIUM 问题/固定建议；生成建议不等于有证据的确认。 | 展示为 AI 检查候选；真正确认必须调用事实/证据服务并持久化审核决定。 |
| A25 | 中 | 确定 | 重开对话和历史读取有数量截断 | `apps/web/server/assistant/service.ts:219`；`apps/web/server/artifacts/service.ts:81` | 长项目历史查看、追溯 | 对话只读最近 80 条、Artifact 历史最近 100 条；旧数据未删除但无该接口分页参数。 | 加显式“更早记录”分页；沿用现有历史摘要/召回，不承诺模型读了全部旧记录。 |
| A26 | 中 | 风险 | 硬崩溃时未保存编辑与流式部分文本不可保证恢复 | `apps/web/server/assistant/service.ts:290`；`apps/web/server/assistant/service.ts:358`；`apps/web/server/assistant/service.ts:379`；`apps/web/components/projects/use-artifact-editor.tsx:117` | 进程硬杀、断电、浏览器崩溃 | heartbeat只更新时间；delta更新内存partialContent，完成/catch才保存正文；dirty离开保护不是持久草稿 | 先定义可恢复草稿与delta checkpoint需求；在隔离环境故障注入，复用现有版本存储，不在真实库破坏测试 |

| A27 | 低 | 确定 | API导出依赖components目录中的纯报告格式器 | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export/route.ts:3`；`apps/web/components/research/work-research-markdown.ts:37` | 作品报告导出与UI展示的目录依赖 | 当前文件是纯格式函数，类型import会擦除，并非客户端执行数据库或密钥泄漏；目录归属使API依赖UI目录 | 复用该纯函数放入已有共享报告能力位置，保留安全转义与格式；不新增一套报告框架 |

## 已有安全与恢复能力（避免误判）

- `server/api-access.ts` 校验 session、用户停用、workspace membership；`workspace-context.ts` 对已失权 active workspace 不自动落到其他公司。
- Research Session/Run 以 workspace + createdBy/requestedBy 私有读取，显式分享转项目 Artifact；共享结果并不授权读取原私人会话。
- Artifact 读取约束 project/workspace，写入约束角色与 expectedVersion；局部修改、锁定、修订恢复有事务检查。
- Material 通过 readable-content 统一原文/Transcript/SourceUnderstanding，飞书正文读取验证授权、连接版本与权限状态；缓存命中需复核来源。
- `/api/media/[token]` 是签名、用途和过期校验的能力 URL；internal media-storage 是内部密钥 + workspace/source/asset scope，并非因为无 cookie 就是公开无鉴权 API。
- 转录/拆解存在版本 fence、终态、retry/cancel、队列补偿；Provider 失败不等于所有模块没有错误处理。

尚未做全端点动态越权、SSRF 渗透、依赖漏洞扫描。范围检查缺口按 A11/A12/A16 处理，不能宣称全系统隔离通过。

## 大文件与耦合热点

| 行数 | 文件 | 建议 |
| --- | --- | --- |
| 4835 | `apps/web/components/product-v3.css:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 4404 | `apps/web/app/globals.css:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 2611 | `packages/db/prisma/schema.prisma:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 1289 | `apps/web/components/projects/content-canvas.tsx:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 926 | `apps/worker/src/transcription.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 713 | `apps/worker/src/benchmark-creator-profile.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 491 | `apps/web/server/discovery/service.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 489 | `apps/web/server/assistant/service.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 478 | `apps/web/server/methods/service.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 460 | `apps/web/components/app-shell.css:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 453 | `apps/web/server/discovery/benchmark-study-service.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 421 | `apps/web/components/projects/studio-shell.tsx:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 403 | `apps/web/server/project-service.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 402 | `apps/web/server/drafts/service.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 401 | `apps/worker/src/redfox-ingest.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 384 | `apps/worker/src/material-distillation.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 377 | `packages/providers/src/benchmark-creator-profile.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 376 | `apps/web/server/material-detail/service.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 374 | `apps/web/components/projects/studio-default-method.tsx:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 333 | `apps/web/server/sidebar/service.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 326 | `apps/web/app/apple-workbench.css:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |
| 312 | `packages/providers/src/openai-compatible/provider.ts:1` | 先分职责/隔离状态或样式；不能按行数直接删除 |

## 完整当前骨架树

本树按扫描时实际文件生成，覆盖前后端、共享包、测试、迁移、配置、脚本、服务、vendor。测试文件在所属模块目录内列出；不是目标重构树。未列出的根目录治理文档包括 PRODUCT.md、ARCHITECTURE.md、LEGACY.md、AGENTS.md；根脚本与部署入口包括 package.json、pnpm-workspace.yaml、turbo.json、eslint.config.mjs、vitest.config.ts、docker-compose.*.yml、render*.yaml 和三个启动/停止 cmd。

```text
├── apps/
│   ├── web/
│   │   ├── AGENTS.md
│   │   ├── CLAUDE.md
│   │   ├── app/
│   │   │   ├── (app)/
│   │   │   │   ├── @settings/
│   │   │   │   │   ├── (.)settings/
│   │   │   │   │   │   ├── about/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   ├── account/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   ├── creator-profile/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   ├── diagnostics/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   ├── integrations/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   ├── layout.tsx
│   │   │   │   │   │   ├── members/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   ├── storage/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   └── workspace/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── [...catchAll]/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── default.tsx
│   │   │   │   ├── admin/
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── system/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── usage/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── users/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── calendar/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── tasks/
│   │   │   │   │       └── [id]/
│   │   │   │   │           └── page.tsx
│   │   │   │   ├── content-review/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── dashboard/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── discovery/
│   │   │   │   │   ├── benchmarks/
│   │   │   │   │   │   └── [id]/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── ideas/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── recommendations/
│   │   │   │   │   │   └── [id]/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   └── trends/
│   │   │   │   │       ├── [key]/
│   │   │   │   │       │   └── page.tsx
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── home/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── ip-context/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── knowledge/
│   │   │   │   │   ├── facts/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── library/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── feishu/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── methods/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── projects/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   ├── review/
│   │   │   │   │   │   │   └── [platform]/
│   │   │   │   │   │   │       └── page.tsx
│   │   │   │   │   │   └── studio/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── methods/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── research/
│   │   │   │   │   ├── benchmarks/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   ├── page.tsx
│   │   │   │   │   │   │   └── works/
│   │   │   │   │   │   │       └── [workId]/
│   │   │   │   │   │   │           └── page.tsx
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── error.tsx
│   │   │   │   │   ├── focus/
│   │   │   │   │   │   ├── [runId]/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── loading.tsx
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── results/
│   │   │   │   │   │   ├── [kind]/
│   │   │   │   │   │   │   └── [id]/
│   │   │   │   │   │   │       └── page.tsx
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── session/
│   │   │   │   │   │   └── [id]/
│   │   │   │   │   │       └── page.tsx
│   │   │   │   │   ├── sources/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── teardown/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── trends/
│   │   │   │   │   │   ├── [stableKey]/
│   │   │   │   │   │   │   └── page.tsx
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── works/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── settings/
│   │   │   │   │   ├── about/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── account/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── creator-profile/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── diagnostics/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── integrations/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── members/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── storage/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── workspace/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── short-video/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── tasks/
│   │   │   │   │       ├── [id]/
│   │   │   │   │       │   └── page.tsx
│   │   │   │   │       └── page.tsx
│   │   │   │   └── topics/
│   │   │   │       └── page.tsx
│   │   │   ├── (auth)/
│   │   │   │   ├── account/
│   │   │   │   │   ├── invite/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── recovery/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   ├── reset/
│   │   │   │   │   │   └── page.tsx
│   │   │   │   │   └── verify/
│   │   │   │   │       └── page.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── register/
│   │   │   │       └── page.tsx
│   │   │   ├── __runtime/
│   │   │   │   └── page.tsx
│   │   │   ├── api/
│   │   │   │   ├── account/
│   │   │   │   │   ├── invitation/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── recovery/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── verification/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── admin/
│   │   │   │   │   ├── system/
│   │   │   │   │   │   ├── providers/
│   │   │   │   │   │   │   └── [provider]/
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── usage/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── users/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── workspaces/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── auth/
│   │   │   │   │   └── [...all]/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── benchmark-topics/
│   │   │   │   │   ├── [runId]/
│   │   │   │   │   │   └── select/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── collections/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── content-hub/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── creation/
│   │   │   │   │   ├── models/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── sources/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── creator-profile/
│   │   │   │   │   ├── route.ts
│   │   │   │   │   └── suggestions/
│   │   │   │   │       ├── [suggestionId]/
│   │   │   │   │       │   └── route.ts
│   │   │   │   │       └── route.ts
│   │   │   │   ├── dev/
│   │   │   │   │   └── runtime-health/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── discovery/
│   │   │   │   │   ├── benchmarks/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   ├── collection-runs/
│   │   │   │   │   │   │   │   ├── [runId]/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── comments/
│   │   │   │   │   │   │   │   ├── analyze/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   └── collect/
│   │   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   │   ├── inputs/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── method-suggestions/
│   │   │   │   │   │   │   │   ├── [suggestionId]/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── organization/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── report/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   │   └── studies/
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── collect/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── ideas/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   ├── references/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   │   └── start/
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── projects/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── recommendations/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── search/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── trends/
│   │   │   │   │       ├── [key]/
│   │   │   │   │       │   ├── ideas/
│   │   │   │   │       │   │   └── route.ts
│   │   │   │   │       │   ├── related/
│   │   │   │   │       │   │   └── route.ts
│   │   │   │   │       │   └── topics/
│   │   │   │   │       │       └── route.ts
│   │   │   │   │       └── route.ts
│   │   │   │   ├── experience/
│   │   │   │   │   └── start/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── feishu/
│   │   │   │   │   ├── browse/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── health/
│   │   │   │   │   ├── live/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── ready/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── ingest-jobs/
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── cancel/
│   │   │   │   │       │   └── route.ts
│   │   │   │   │       ├── retry/
│   │   │   │   │       │   └── route.ts
│   │   │   │   │       └── route.ts
│   │   │   │   ├── integrations/
│   │   │   │   │   ├── LLM/
│   │   │   │   │   │   └── models/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   ├── [provider]/
│   │   │   │   │   │   ├── disable/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── enable/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   └── test/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── internal/
│   │   │   │   │   └── media-storage/
│   │   │   │   │       └── [assetId]/
│   │   │   │   │           └── route.ts
│   │   │   │   ├── internal-signup/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── local-asr/
│   │   │   │   │   ├── models/
│   │   │   │   │   │   └── initialize/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   └── status/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── media/
│   │   │   │   │   └── [token]/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── methods/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── default/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── import/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── projects/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   ├── ai/
│   │   │   │   │   │   │   ├── run/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── runs/
│   │   │   │   │   │   │       └── [runId]/
│   │   │   │   │   │   │           ├── apply/
│   │   │   │   │   │   │           │   └── route.ts
│   │   │   │   │   │   │           └── discard/
│   │   │   │   │   │   │               └── route.ts
│   │   │   │   │   │   ├── artifacts/
│   │   │   │   │   │   │   ├── [artifactId]/
│   │   │   │   │   │   │   │   ├── history/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   ├── revisions/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── assistant/
│   │   │   │   │   │   │   ├── messages/
│   │   │   │   │   │   │   │   └── [messageId]/
│   │   │   │   │   │   │   │       └── save/
│   │   │   │   │   │   │   │           └── route.ts
│   │   │   │   │   │   │   ├── models/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── references/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── brief/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── canvas/
│   │   │   │   │   │   │   └── objects/
│   │   │   │   │   │   │       ├── [objectId]/
│   │   │   │   │   │   │       │   ├── assistant/
│   │   │   │   │   │   │       │   │   └── route.ts
│   │   │   │   │   │   │       │   ├── restore/
│   │   │   │   │   │   │       │   │   └── route.ts
│   │   │   │   │   │   │       │   └── route.ts
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   ├── creative-basis/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── deep-content-package/
│   │   │   │   │   │   │   ├── apply/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── generate/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── drafts/
│   │   │   │   │   │   │   ├── [draftId]/
│   │   │   │   │   │   │   │   ├── checkpoint/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   ├── confirm/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   ├── history/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   ├── primary/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── evidence/
│   │   │   │   │   │   │   ├── [evidenceId]/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── feedback/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── gpt-task-package/
│   │   │   │   │   │   │   ├── copied/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── import-gpt-draft/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── methods/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── mother-content/
│   │   │   │   │   │   │   ├── confirm/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── confirmation/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   │   └── warnings/
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   ├── platform-variants/
│   │   │   │   │   │   │   ├── [platform]/
│   │   │   │   │   │   │   │   ├── apply/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   ├── review/
│   │   │   │   │   │   │   │   │   ├── ai/
│   │   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   │   ├── approve/
│   │   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   │   ├── reject/
│   │   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   │   ├── request-changes/
│   │   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   │   └── submit/
│   │   │   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   │   │   ├── reviews/
│   │   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── generate/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── restore/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   ├── sources/
│   │   │   │   │   │   │   ├── [sourceId]/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── transition/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── publish-tasks/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   ├── cancel/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── failed/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── package/
│   │   │   │   │   │   │   ├── copied/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── published/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   └── schedule/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── research/
│   │   │   │   │   ├── benchmarks/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   ├── research/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── research-v2/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── sync/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── works/
│   │   │   │   │   │   │       └── [workId]/
│   │   │   │   │   │   │           ├── analysis/
│   │   │   │   │   │   │           │   ├── [runId]/
│   │   │   │   │   │   │           │   │   ├── export/
│   │   │   │   │   │   │           │   │   │   └── route.ts
│   │   │   │   │   │   │           │   │   └── prepare-creation/
│   │   │   │   │   │   │           │   │       └── route.ts
│   │   │   │   │   │   │           │   └── route.ts
│   │   │   │   │   │   │           ├── collect/
│   │   │   │   │   │   │           │   └── route.ts
│   │   │   │   │   │   │           ├── media/
│   │   │   │   │   │   │           │   └── route.ts
│   │   │   │   │   │   │           └── route.ts
│   │   │   │   │   │   └── import/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   ├── creation/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── focus-v2/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── materials/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── news/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── preferences/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── results/
│   │   │   │   │   │   ├── [runId]/
│   │   │   │   │   │   │   └── share/
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   └── study/
│   │   │   │   │   │       └── [studyId]/
│   │   │   │   │   │           └── share/
│   │   │   │   │   │               └── route.ts
│   │   │   │   │   ├── sessions/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   │   └── runs/
│   │   │   │   │   │   │       ├── [runId]/
│   │   │   │   │   │   │       │   └── route.ts
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── sources/
│   │   │   │   │   │   └── [id]/
│   │   │   │   │   │       ├── clippings/
│   │   │   │   │   │       │   └── route.ts
│   │   │   │   │   │       └── topic/
│   │   │   │   │   │           └── route.ts
│   │   │   │   │   ├── teardown/
│   │   │   │   │   │   ├── [runId]/
│   │   │   │   │   │   │   ├── export/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── history/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── trends/
│   │   │   │   │       └── [stableKey]/
│   │   │   │   │           ├── opportunity-v2/
│   │   │   │   │           │   └── route.ts
│   │   │   │   │           └── related/
│   │   │   │   │               └── route.ts
│   │   │   │   ├── search/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── settings/
│   │   │   │   │   ├── diagnostics/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── invitations/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── members/
│   │   │   │   │   │   ├── [id]/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── owner/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── sessions/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── storage/
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── workspace/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── sidebar/
│   │   │   │   │   ├── folders/
│   │   │   │   │   │   ├── [folderId]/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── projects/
│   │   │   │   │   │   ├── [projectId]/
│   │   │   │   │   │   │   ├── opened/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── preference/
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   ├── source-items/
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   ├── assets/
│   │   │   │   │   │   │   └── [assetId]/
│   │   │   │   │   │   │       ├── access/
│   │   │   │   │   │   │       │   └── route.ts
│   │   │   │   │   │   │       └── preview/
│   │   │   │   │   │   │           └── route.ts
│   │   │   │   │   │   ├── collections/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── distillation/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── knowledge/
│   │   │   │   │   │   │   ├── candidates/
│   │   │   │   │   │   │   │   └── [candidateId]/
│   │   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── material-analysis/
│   │   │   │   │   │   │   ├── [analysisId]/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   ├── project/
│   │   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── metadata/
│   │   │   │   │   │   │   └── refresh/
│   │   │   │   │   │   │       └── route.ts
│   │   │   │   │   │   ├── processing/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── route.ts
│   │   │   │   │   │   ├── tags/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── transcribe/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   ├── transcript/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── understanding/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   ├── route.ts
│   │   │   │   │   └── upload/
│   │   │   │   │       └── route.ts
│   │   │   │   ├── system/
│   │   │   │   │   └── health/
│   │   │   │   │       └── queue/
│   │   │   │   │           └── route.ts
│   │   │   │   ├── tags/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── video-data/
│   │   │   │   │   └── route.ts
│   │   │   │   ├── voice-input/
│   │   │   │   │   └── route.ts
│   │   │   │   └── workspaces/
│   │   │   │       └── [workspaceId]/
│   │   │   │           └── route.ts
│   │   │   ├── apple-workbench.css
│   │   │   ├── black-titanium.css
│   │   │   ├── experience/
│   │   │   │   └── page.tsx
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   ├── onboarding/
│   │   │   │   ├── actions.ts
│   │   │   │   └── page.tsx
│   │   │   ├── page.tsx
│   │   │   ├── platform/
│   │   │   │   ├── accounts/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── layout.tsx
│   │   │   │   └── spaces/
│   │   │   │       └── page.tsx
│   │   │   └── workspace-unavailable/
│   │   │       └── page.tsx
│   │   ├── components/
│   │   │   ├── account-security-form.tsx
│   │   │   ├── account-sessions.tsx
│   │   │   ├── account-settings.tsx
│   │   │   ├── admin/
│   │   │   │   ├── create-user-form.tsx
│   │   │   │   ├── customer-spaces.tsx
│   │   │   │   ├── system-doubao-config-form.tsx
│   │   │   │   └── user-lifecycle-actions.tsx
│   │   │   ├── app-shell.css
│   │   │   ├── app-shell.tsx
│   │   │   ├── appearance-settings.tsx
│   │   │   ├── auth-form.tsx
│   │   │   ├── content-hub.tsx
│   │   │   ├── discovery/
│   │   │   │   ├── benchmark-creator-profile.tsx
│   │   │   │   ├── benchmark-topic-generator.tsx
│   │   │   │   ├── benchmark-workspace.tsx
│   │   │   │   ├── discovery-workspace.tsx
│   │   │   │   ├── idea-workspace.tsx
│   │   │   │   ├── recommendation-detail-actions.tsx
│   │   │   │   ├── today-recommendations.tsx
│   │   │   │   ├── trend-card.tsx
│   │   │   │   ├── trend-detail-workspace.tsx
│   │   │   │   └── trend-workspace.tsx
│   │   │   ├── email-verification.tsx
│   │   │   ├── fusion-overview.tsx
│   │   │   ├── global-search-v1.css
│   │   │   ├── global-search.tsx
│   │   │   ├── home-composer.css
│   │   │   ├── home-composer.tsx
│   │   │   ├── home-reference.css
│   │   │   ├── integrations/
│   │   │   │   ├── integration-card.tsx
│   │   │   │   └── transcription-settings-card.tsx
│   │   │   ├── learning-suggestion-panels.tsx
│   │   │   ├── library/
│   │   │   │   ├── asset-library.css
│   │   │   │   ├── asset-thumbnail.tsx
│   │   │   │   ├── feishu-knowledge-subscriptions.tsx
│   │   │   │   ├── feishu-library.css
│   │   │   │   ├── feishu-library.tsx
│   │   │   │   ├── feishu-wiki-browser.tsx
│   │   │   │   ├── ingest-dialog.tsx
│   │   │   │   ├── library-card-controls.tsx
│   │   │   │   ├── library-poller.tsx
│   │   │   │   ├── library-toolbar.tsx
│   │   │   │   ├── material-analysis-card.tsx
│   │   │   │   ├── material-distillation-card.tsx
│   │   │   │   ├── material-knowledge-card.tsx
│   │   │   │   ├── material-workspace.tsx
│   │   │   │   ├── metadata-refresh-button.tsx
│   │   │   │   ├── method-detail.tsx
│   │   │   │   ├── retry-ingest-button.tsx
│   │   │   │   ├── skill-management.tsx
│   │   │   │   ├── source-actions.tsx
│   │   │   │   ├── source-asset-download-button.tsx
│   │   │   │   ├── source-processing-poller.tsx
│   │   │   │   ├── transcript-panel.tsx
│   │   │   │   ├── transcription-actions.tsx
│   │   │   │   └── workflow-skill-import.tsx
│   │   │   ├── local-storage-settings.tsx
│   │   │   ├── logout-button.tsx
│   │   │   ├── material-detail/
│   │   │   │   ├── material-admin-details.tsx
│   │   │   │   ├── project-picker.tsx
│   │   │   │   ├── source-text.tsx
│   │   │   │   ├── source-understanding.tsx
│   │   │   │   ├── source-viewer.tsx
│   │   │   │   ├── source-workspace.css
│   │   │   │   └── source-workspace.tsx
│   │   │   ├── member-invitations.tsx
│   │   │   ├── member-settings.tsx
│   │   │   ├── onboarding-form.tsx
│   │   │   ├── page.tsx
│   │   │   ├── product-v3.css
│   │   │   ├── projects/
│   │   │   │   ├── ai-creation-panel.tsx
│   │   │   │   ├── artifact-editor.tsx
│   │   │   │   ├── artifact-window.css
│   │   │   │   ├── artifact-window.tsx
│   │   │   │   ├── assistant-markdown.tsx
│   │   │   │   ├── assistant-result-renderer.tsx
│   │   │   │   ├── brief-editor.tsx
│   │   │   │   ├── canvas-free-node.tsx
│   │   │   │   ├── content-canvas.tsx
│   │   │   │   ├── content-production-preview.tsx
│   │   │   │   ├── creation-controls.tsx
│   │   │   │   ├── creation-feedback.tsx
│   │   │   │   ├── deep-content-workspace.tsx
│   │   │   │   ├── default-content-method.tsx
│   │   │   │   ├── evidence-board.tsx
│   │   │   │   ├── folder-library.css
│   │   │   │   ├── folder-library.tsx
│   │   │   │   ├── mother-content-editor.tsx
│   │   │   │   ├── new-project-button.tsx
│   │   │   │   ├── platform-content-factory.tsx
│   │   │   │   ├── platform-review-workspace.tsx
│   │   │   │   ├── project-agent.css
│   │   │   │   ├── project-archive-button.tsx
│   │   │   │   ├── project-card-menu-with-lifecycle.tsx
│   │   │   │   ├── project-card-menu.tsx
│   │   │   │   ├── project-cover-image.tsx
│   │   │   │   ├── project-filter-menu.tsx
│   │   │   │   ├── project-form.tsx
│   │   │   │   ├── project-library-reference.css
│   │   │   │   ├── project-library-sync.tsx
│   │   │   │   ├── project-lifecycle-actions.tsx
│   │   │   │   ├── project-materials-panel.tsx
│   │   │   │   ├── project-status-panel.tsx
│   │   │   │   ├── project-tree-extension.css
│   │   │   │   ├── project-tree-extension.tsx
│   │   │   │   ├── studio-default-method.tsx
│   │   │   │   ├── studio-drawer.tsx
│   │   │   │   ├── studio-method-selector.tsx
│   │   │   │   ├── studio-shell.tsx
│   │   │   │   ├── studio-sources.tsx
│   │   │   │   ├── use-artifact-editor.tsx
│   │   │   │   └── workflow-humanize-action.tsx
│   │   │   ├── publishing/
│   │   │   │   ├── add-to-publishing-button.tsx
│   │   │   │   └── publish-task-workspace.tsx
│   │   │   ├── research/
│   │   │   │   ├── account-research-controls.tsx
│   │   │   │   ├── account-research-report.tsx
│   │   │   │   ├── account-v2-panel.tsx
│   │   │   │   ├── benchmark-account-add.tsx
│   │   │   │   ├── benchmark-collection-action.tsx
│   │   │   │   ├── benchmark-dossier.css
│   │   │   │   ├── benchmark-dossier.tsx
│   │   │   │   ├── benchmark-tables.tsx
│   │   │   │   ├── benchmark-workbench-actions.tsx
│   │   │   │   ├── benchmark-workbench.css
│   │   │   │   ├── creation-prompt.ts
│   │   │   │   ├── focus-v2-workbench.tsx
│   │   │   │   ├── navigation.ts
│   │   │   │   ├── research-blocks.tsx
│   │   │   │   ├── research-composer.tsx
│   │   │   │   ├── research-coverage.tsx
│   │   │   │   ├── research-labels.ts
│   │   │   │   ├── research-news.css
│   │   │   │   ├── research-news.tsx
│   │   │   │   ├── research-object-actions.tsx
│   │   │   │   ├── research-session.tsx
│   │   │   │   ├── research-share.tsx
│   │   │   │   ├── research-shell.tsx
│   │   │   │   ├── research-source-actions.tsx
│   │   │   │   ├── research-source-notes.tsx
│   │   │   │   ├── research-use-findings.tsx
│   │   │   │   ├── research.css
│   │   │   │   ├── teardown/
│   │   │   │   │   ├── teardown-workspace.tsx
│   │   │   │   │   └── teardown.css
│   │   │   │   ├── topic-opportunity-v2-panel.tsx
│   │   │   │   ├── trend-history-chart.tsx
│   │   │   │   ├── trend-refresh.tsx
│   │   │   │   ├── trend-related-search.tsx
│   │   │   │   ├── work-creation-action.tsx
│   │   │   │   ├── work-decision-view.tsx
│   │   │   │   ├── work-decision.css
│   │   │   │   ├── work-report-fragments.tsx
│   │   │   │   ├── work-research-controls.tsx
│   │   │   │   └── work-research-markdown.ts
│   │   │   ├── settings/
│   │   │   │   └── creator-profile-form.tsx
│   │   │   ├── settings-diagnostics.tsx
│   │   │   ├── settings-navigation.tsx
│   │   │   ├── settings-v1.css
│   │   │   ├── settings-window.tsx
│   │   │   ├── sidebar/
│   │   │   │   ├── command-surface.tsx
│   │   │   │   ├── folder-command-menu.tsx
│   │   │   │   ├── name-dialog.tsx
│   │   │   │   ├── new-project-dialog.tsx
│   │   │   │   ├── project-command-menu.tsx
│   │   │   │   ├── project-sections.tsx
│   │   │   │   └── sidebar-search.tsx
│   │   │   ├── sidebar-foundation.tsx
│   │   │   ├── sidebar-state.ts
│   │   │   ├── sidebar.tsx
│   │   │   ├── video-analytics-workspace.css
│   │   │   ├── video-analytics-workspace.tsx
│   │   │   ├── video-center.css
│   │   │   ├── video-center.tsx
│   │   │   ├── video-date-filter.css
│   │   │   ├── video-date-filter.tsx
│   │   │   ├── voice-input.css
│   │   │   ├── voice-input.tsx
│   │   │   └── workbench-start.tsx
│   │   ├── components.json
│   │   ├── e2e/
│   │   │   ├── ai-creation.spec.ts
│   │   │   ├── app-shell.spec.ts
│   │   │   ├── benchmark-studies.spec.ts
│   │   │   ├── canvas-node-ai.spec.ts
│   │   │   ├── content-discovery-trends.spec.ts
│   │   │   ├── content-discovery.spec.ts
│   │   │   ├── content-ingest.spec.ts
│   │   │   ├── content-project.spec.ts
│   │   │   ├── content-quality-review.spec.ts
│   │   │   ├── creation-agent.spec.ts
│   │   │   ├── creation-feedback.spec.ts
│   │   │   ├── creation-production-smoke.spec.ts
│   │   │   ├── creation-quality.spec.ts
│   │   │   ├── deep-content-package.spec.ts
│   │   │   ├── desktop-layout.spec.ts
│   │   │   ├── doubao-asr.spec.ts
│   │   │   ├── drafts.spec.ts
│   │   │   ├── foundation.spec.ts
│   │   │   ├── generic-artifact.spec.ts
│   │   │   ├── home-composer.spec.ts
│   │   │   ├── home-reference.spec.ts
│   │   │   ├── integration-secrets.spec.ts
│   │   │   ├── local-asr.spec.ts
│   │   │   ├── m12-shell.spec.ts
│   │   │   ├── material-analysis.spec.ts
│   │   │   ├── material-completion.spec.ts
│   │   │   ├── material-detail-functional-recovery.spec.ts
│   │   │   ├── material-detail-integrated-recovery.spec.ts
│   │   │   ├── material-distillation.spec.ts
│   │   │   ├── material-knowledge.spec.ts
│   │   │   ├── material-workflow-ux.spec.ts
│   │   │   ├── methods.spec.ts
│   │   │   ├── multi-user-security.spec.ts
│   │   │   ├── platform-content-factory.spec.ts
│   │   │   ├── pre-launch-product-closure.spec.ts
│   │   │   ├── product-simplification.spec.ts
│   │   │   ├── project-agent-core.spec.ts
│   │   │   ├── project-assistant.spec.ts
│   │   │   ├── project-materials-panel.spec.ts
│   │   │   ├── publishing-center.spec.ts
│   │   │   ├── qa-prelaunch.spec.ts
│   │   │   ├── redfox-ingest.spec.ts
│   │   │   ├── render-media-relay.spec.ts
│   │   │   ├── research-center.spec.ts
│   │   │   ├── sidebar-core.spec.ts
│   │   │   ├── sidebar-foundation.spec.ts
│   │   │   ├── sidebar-project-organization.spec.ts
│   │   │   ├── source-inputs.spec.ts
│   │   │   ├── source-workspace.spec.ts
│   │   │   ├── storage-access-security.spec.ts
│   │   │   ├── teardown.spec.ts
│   │   │   ├── today-recommendations.spec.ts
│   │   │   ├── upload-browser-stability.spec.ts
│   │   │   ├── v1-happy-path.spec.ts
│   │   │   ├── workbench-ux.spec.ts
│   │   │   └── workflow-skill.spec.ts
│   │   ├── instrumentation.ts
│   │   ├── lib/
│   │   │   ├── appearance.ts
│   │   │   ├── auth-client.ts
│   │   │   ├── auth-errors.ts
│   │   │   ├── auth.ts
│   │   │   ├── content-labels.ts
│   │   │   ├── content-production.ts
│   │   │   ├── contracts/
│   │   │   │   ├── artifacts.ts
│   │   │   │   ├── assistant.ts
│   │   │   │   ├── canvas.ts
│   │   │   │   ├── creation.ts
│   │   │   │   └── references.ts
│   │   │   ├── creation-prompts.ts
│   │   │   ├── format-metric-count.ts
│   │   │   ├── material-workspace-state.ts
│   │   │   ├── password-policy.ts
│   │   │   ├── platforms.ts
│   │   │   ├── project-next-action.ts
│   │   │   ├── research-creation-draft.ts
│   │   │   ├── source-processing-state.ts
│   │   │   ├── source-upload-client.ts
│   │   │   ├── transcription-usage.ts
│   │   │   └── video-analytics.ts
│   │   ├── next-env.d.ts
│   │   ├── next.config.ts
│   │   ├── package.json
│   │   ├── playwright.agent.config.ts
│   │   ├── playwright.config.ts
│   │   ├── playwright.creation.config.ts
│   │   ├── playwright.production-smoke.config.ts
│   │   ├── playwright.quality.config.ts
│   │   ├── playwright.teardown.config.ts
│   │   ├── playwright.ux.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── public/
│   │   │   ├── brand/
│   │   │   │   ├── ai-review-robot.png
│   │   │   │   ├── brand-mark.png
│   │   │   │   ├── xin-world-icon.svg
│   │   │   │   ├── xin-world-logo.svg
│   │   │   │   ├── xin-world-mark-dark.svg
│   │   │   │   └── xin-world-mark-light.svg
│   │   │   ├── fusion/
│   │   │   │   ├── THIRD_PARTY_LICENSE.txt
│   │   │   │   ├── founder-os-mark.png
│   │   │   │   └── workbench-planet.webp
│   │   │   └── home-reference/
│   │   │       ├── README.md
│   │   │       ├── blossom.png
│   │   │       ├── brand-mark.png
│   │   │       ├── cloud.png
│   │   │       ├── daily.png
│   │   │       ├── mascot.png
│   │   │       └── snow.png
│   │   ├── scripts/
│   │   │   ├── bootstrap-admin.ts
│   │   │   ├── bootstrap-experience.ts
│   │   │   └── fusion-bootstrap.ts
│   │   ├── server/
│   │   │   ├── access.ts
│   │   │   ├── account-api.ts
│   │   │   ├── account-delivery.ts
│   │   │   ├── account-security-api.ts
│   │   │   ├── account-security.ts
│   │   │   ├── account-sessions.ts
│   │   │   ├── account-space.ts
│   │   │   ├── admin/
│   │   │   │   ├── bootstrap.ts
│   │   │   │   ├── staging-bootstrap.ts
│   │   │   │   ├── system-providers.ts
│   │   │   │   ├── system-services.ts
│   │   │   │   ├── usage.ts
│   │   │   │   └── user-lifecycle.ts
│   │   │   ├── ai/
│   │   │   │   ├── ai-api.ts
│   │   │   │   ├── ai-run-service.ts
│   │   │   │   ├── control/
│   │   │   │   │   ├── action-permission.ts
│   │   │   │   │   ├── ai-control-service.ts
│   │   │   │   │   ├── context-builder-v2.ts
│   │   │   │   │   ├── contracts.ts
│   │   │   │   │   ├── fact-gate-v2.ts
│   │   │   │   │   ├── model-router.ts
│   │   │   │   │   ├── scope-gate.ts
│   │   │   │   │   └── video-orchestration.ts
│   │   │   │   ├── creation-context.ts
│   │   │   │   ├── draft-warnings.ts
│   │   │   │   ├── llm-api-status.ts
│   │   │   │   ├── llm-runtime.ts
│   │   │   │   ├── project-context.ts
│   │   │   │   ├── prompt-service.ts
│   │   │   │   ├── reference-safety.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   ├── skill-resolver.ts
│   │   │   │   └── writing-methods/
│   │   │   │       ├── ip-strategist.ts
│   │   │   │       └── source-overlap.ts
│   │   │   ├── api-access.ts
│   │   │   ├── artifacts/
│   │   │   │   ├── api.ts
│   │   │   │   ├── context-adapter.ts
│   │   │   │   ├── service.ts
│   │   │   │   └── view-model.ts
│   │   │   ├── assistant/
│   │   │   │   ├── api.ts
│   │   │   │   ├── cache.ts
│   │   │   │   ├── capacity.ts
│   │   │   │   ├── context-budget.ts
│   │   │   │   ├── creation-policy.ts
│   │   │   │   ├── media-link.ts
│   │   │   │   ├── memory.ts
│   │   │   │   ├── prompt.ts
│   │   │   │   ├── references.ts
│   │   │   │   ├── service.ts
│   │   │   │   ├── task-state.ts
│   │   │   │   └── web-search.ts
│   │   │   ├── auth-rate-limit.ts
│   │   │   ├── auth-response.ts
│   │   │   ├── benchmark-topics/
│   │   │   │   ├── schemas.ts
│   │   │   │   └── service.ts
│   │   │   ├── brief-service.ts
│   │   │   ├── canvas/
│   │   │   │   ├── api.ts
│   │   │   │   └── service.ts
│   │   │   ├── content-governance/
│   │   │   │   ├── policy.ts
│   │   │   │   └── service.ts
│   │   │   ├── creation/
│   │   │   │   ├── models.ts
│   │   │   │   └── sources.ts
│   │   │   ├── creation-feedback/
│   │   │   │   └── service.ts
│   │   │   ├── creator-methods/
│   │   │   │   └── service.ts
│   │   │   ├── creator-profile-service.ts
│   │   │   ├── dashboard.ts
│   │   │   ├── deep-content/
│   │   │   │   ├── api.ts
│   │   │   │   ├── context.ts
│   │   │   │   ├── gpt-draft-import.ts
│   │   │   │   ├── gpt-task-package.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   └── service.ts
│   │   │   ├── default-content-method/
│   │   │   │   ├── generation.ts
│   │   │   │   ├── internal-knowledge-v1.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   └── service.ts
│   │   │   ├── discovery/
│   │   │   │   ├── account-report-contract.ts
│   │   │   │   ├── account-report-tables.ts
│   │   │   │   ├── api.ts
│   │   │   │   ├── benchmark-cohort.ts
│   │   │   │   ├── benchmark-collection-contract.ts
│   │   │   │   ├── benchmark-collection-service.ts
│   │   │   │   ├── benchmark-creator-read-model.ts
│   │   │   │   ├── benchmark-inputs.ts
│   │   │   │   ├── benchmark-performance.ts
│   │   │   │   ├── benchmark-report.ts
│   │   │   │   ├── benchmark-study-service.ts
│   │   │   │   ├── comment-analysis-schema.ts
│   │   │   │   ├── comment-analysis.ts
│   │   │   │   ├── f2-collector.ts
│   │   │   │   ├── public-work-review.ts
│   │   │   │   ├── recommendations/
│   │   │   │   │   ├── api.ts
│   │   │   │   │   ├── context-builder.ts
│   │   │   │   │   ├── schemas.ts
│   │   │   │   │   └── service.ts
│   │   │   │   ├── research-library.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   ├── service.ts
│   │   │   │   └── trends/
│   │   │   │       ├── api.ts
│   │   │   │       ├── read-model.ts
│   │   │   │       ├── schemas.ts
│   │   │   │       ├── service.ts
│   │   │   │       └── topic-service.ts
│   │   │   ├── drafts/
│   │   │   │   ├── api.ts
│   │   │   │   └── service.ts
│   │   │   ├── embedded-worker.ts
│   │   │   ├── evidence-service.ts
│   │   │   ├── experience-account.ts
│   │   │   ├── feishu/
│   │   │   │   ├── policy.ts
│   │   │   │   ├── runtime.ts
│   │   │   │   └── service.ts
│   │   │   ├── integration-api.ts
│   │   │   ├── integration-test.ts
│   │   │   ├── integrations.ts
│   │   │   ├── internal-signup.ts
│   │   │   ├── knowledge/
│   │   │   │   ├── feishu-browse.ts
│   │   │   │   └── feishu-context.ts
│   │   │   ├── learning-suggestions/
│   │   │   │   ├── api.ts
│   │   │   │   └── service.ts
│   │   │   ├── library.ts
│   │   │   ├── local-asr.ts
│   │   │   ├── local-directory-picker.ts
│   │   │   ├── local-storage.ts
│   │   │   ├── material-analysis/
│   │   │   │   ├── api.ts
│   │   │   │   ├── brief-mapper.ts
│   │   │   │   ├── context-builder.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   └── service.ts
│   │   │   ├── material-detail/
│   │   │   │   ├── read-model.ts
│   │   │   │   ├── readable-content.ts
│   │   │   │   ├── service.ts
│   │   │   │   └── understanding.ts
│   │   │   ├── material-distillation/
│   │   │   │   └── service.ts
│   │   │   ├── material-knowledge/
│   │   │   │   ├── api.ts
│   │   │   │   └── service.ts
│   │   │   ├── methods/
│   │   │   │   └── service.ts
│   │   │   ├── mother-content-service.ts
│   │   │   ├── platforms/
│   │   │   │   ├── adapters.ts
│   │   │   │   ├── platform-api.ts
│   │   │   │   ├── platform-context.ts
│   │   │   │   ├── platform-template-service.ts
│   │   │   │   └── platform-variant-service.ts
│   │   │   ├── project-api.ts
│   │   │   ├── project-methods/
│   │   │   │   └── service.ts
│   │   │   ├── project-service.ts
│   │   │   ├── publishing/
│   │   │   │   ├── publish-api.ts
│   │   │   │   ├── publish-package.ts
│   │   │   │   ├── publish-task-service.ts
│   │   │   │   └── schemas.ts
│   │   │   ├── research/
│   │   │   │   ├── access.ts
│   │   │   │   ├── account-research-analysis.ts
│   │   │   │   ├── account-research-contract.ts
│   │   │   │   ├── account-research-evidence.ts
│   │   │   │   ├── account-research-run.ts
│   │   │   │   ├── account-research-service.ts
│   │   │   │   ├── account-v2-analysis.ts
│   │   │   │   ├── account-v2-contract.ts
│   │   │   │   ├── account-v2-evidence.ts
│   │   │   │   ├── account-v2-run.ts
│   │   │   │   ├── account-v2-service.ts
│   │   │   │   ├── api.ts
│   │   │   │   ├── benchmark-dossier-math.ts
│   │   │   │   ├── benchmark-dossier.ts
│   │   │   │   ├── benchmark-import.ts
│   │   │   │   ├── benchmark-workbench-math.ts
│   │   │   │   ├── benchmark-workbench.ts
│   │   │   │   ├── benchmarks.ts
│   │   │   │   ├── contracts.ts
│   │   │   │   ├── focus-v2-analysis.ts
│   │   │   │   ├── focus-v2-contract.ts
│   │   │   │   ├── focus-v2-evidence.ts
│   │   │   │   ├── focus-v2-run.ts
│   │   │   │   ├── focus-v2-service.ts
│   │   │   │   ├── inputs.ts
│   │   │   │   ├── legacy.ts
│   │   │   │   ├── mode-output.ts
│   │   │   │   ├── news/
│   │   │   │   │   ├── access.ts
│   │   │   │   │   ├── contracts.ts
│   │   │   │   │   ├── runtime.ts
│   │   │   │   │   ├── service.ts
│   │   │   │   │   ├── store.ts
│   │   │   │   │   ├── sync.ts
│   │   │   │   │   └── transport.ts
│   │   │   │   ├── preferences.ts
│   │   │   │   ├── read-model.ts
│   │   │   │   ├── service.ts
│   │   │   │   ├── sharing.ts
│   │   │   │   ├── teardown/
│   │   │   │   │   ├── material-capability.ts
│   │   │   │   │   └── service.ts
│   │   │   │   ├── topic-opportunity-v2-analysis.ts
│   │   │   │   ├── topic-opportunity-v2-contract.ts
│   │   │   │   ├── topic-opportunity-v2-evidence.ts
│   │   │   │   ├── topic-opportunity-v2-run.ts
│   │   │   │   ├── topic-opportunity-v2-service.ts
│   │   │   │   ├── trends.ts
│   │   │   │   ├── work-research-analysis.ts
│   │   │   │   ├── work-research-assets.ts
│   │   │   │   ├── work-research-contract.ts
│   │   │   │   ├── work-research-evidence.ts
│   │   │   │   ├── work-research-identity.ts
│   │   │   │   ├── work-research-recommendations.ts
│   │   │   │   ├── work-research-run.ts
│   │   │   │   └── work-research-service.ts
│   │   │   ├── reviews/
│   │   │   │   ├── quality-gate.ts
│   │   │   │   ├── review-api.ts
│   │   │   │   ├── review-service.ts
│   │   │   │   └── schemas.ts
│   │   │   ├── runtime/
│   │   │   │   ├── health.ts
│   │   │   │   └── readiness.ts
│   │   │   ├── settings-diagnostics.ts
│   │   │   ├── sidebar/
│   │   │   │   ├── api.ts
│   │   │   │   ├── basic-project.ts
│   │   │   │   ├── service.ts
│   │   │   │   └── view-model.ts
│   │   │   ├── source-metadata-service.ts
│   │   │   ├── source-service.ts
│   │   │   ├── source-upload.ts
│   │   │   ├── studio/
│   │   │   │   ├── creative-basis.ts
│   │   │   │   ├── creative-brief-prefill.ts
│   │   │   │   ├── fact-safety.ts
│   │   │   │   └── quick-actions.ts
│   │   │   ├── unified-analysis/
│   │   │   │   ├── context-builder.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   └── service.ts
│   │   │   ├── video-operations/
│   │   │   │   ├── policy.ts
│   │   │   │   └── service.ts
│   │   │   ├── workbench-page-data.ts
│   │   │   ├── workflow-skill/
│   │   │   │   └── contract.ts
│   │   │   └── workspace-context.ts
│   │   ├── tests/
│   │   │   ├── account-api-connection.test.ts
│   │   │   ├── account-browser.test.ts
│   │   │   ├── account-final-boundaries.test.ts
│   │   │   ├── account-http-isolation.test.ts
│   │   │   ├── account-report-tables.test.ts
│   │   │   ├── account-research-analysis.test.ts
│   │   │   ├── account-research-fixture.ts
│   │   │   ├── account-research-service.test.ts
│   │   │   ├── account-safety.test.ts
│   │   │   ├── account-security-http.test.ts
│   │   │   ├── account-security.test.ts
│   │   │   ├── account-sessions.test.ts
│   │   │   ├── account-space.test.ts
│   │   │   ├── account-v2-analysis.test.ts
│   │   │   ├── account-v2-service.test.ts
│   │   │   ├── ai-control.test.ts
│   │   │   ├── ai-creation.test.ts
│   │   │   ├── artifact-final-navigation-browser.test.ts
│   │   │   ├── artifacts.test.ts
│   │   │   ├── assistant-capacity.test.ts
│   │   │   ├── assistant-feishu-cache.test.ts
│   │   │   ├── assistant-media-link.test.ts
│   │   │   ├── assistant-memory.test.ts
│   │   │   ├── assistant-read-and-shortcut-browser.test.ts
│   │   │   ├── assistant-redis.integration.test.ts
│   │   │   ├── assistant-runtime.integration.test.ts
│   │   │   ├── assistant-stream-route.test.ts
│   │   │   ├── assistant-task-state.test.ts
│   │   │   ├── assistant-web-search.test.ts
│   │   │   ├── assistant-writing-real.test.ts
│   │   │   ├── auth-errors.test.ts
│   │   │   ├── auth.integration.test.ts
│   │   │   ├── benchmark-cohort.test.ts
│   │   │   ├── benchmark-collection-contract.test.ts
│   │   │   ├── benchmark-creator-profile.test.tsx
│   │   │   ├── benchmark-dossier-math.test.ts
│   │   │   ├── benchmark-dossier.test.ts
│   │   │   ├── benchmark-studies.test.ts
│   │   │   ├── benchmark-topics.test.ts
│   │   │   ├── benchmark-workbench-browser.test.ts
│   │   │   ├── benchmark-workbench.test.ts
│   │   │   ├── bootstrap-admin.test.ts
│   │   │   ├── canvas-node-ai.test.ts
│   │   │   ├── canvas-objects.test.ts
│   │   │   ├── canvas-ui-contract.test.ts
│   │   │   ├── connection-failures.test.ts
│   │   │   ├── content-discovery-trends.test.ts
│   │   │   ├── content-discovery.test.ts
│   │   │   ├── content-governance.test.ts
│   │   │   ├── content-production.test.ts
│   │   │   ├── content-projects.test.ts
│   │   │   ├── content-quality-review.test.ts
│   │   │   ├── creation-agent.test.ts
│   │   │   ├── creation-composer.test.ts
│   │   │   ├── creation-fact-safety.test.ts
│   │   │   ├── creation-feedback.test.ts
│   │   │   ├── creation-policy.test.ts
│   │   │   ├── creation-quality.test.ts
│   │   │   ├── creation-writing-real.test.ts
│   │   │   ├── creative-basis.test.ts
│   │   │   ├── creative-brief-prefill.test.ts
│   │   │   ├── creator-methods.test.ts
│   │   │   ├── deep-content-package.test.ts
│   │   │   ├── default-content-method-generation.test.ts
│   │   │   ├── default-content-method.test.ts
│   │   │   ├── draft-ui-contract.test.ts
│   │   │   ├── drafts.test.ts
│   │   │   ├── experience-research-permission.test.ts
│   │   │   ├── feishu-browse.test.ts
│   │   │   ├── feishu-knowledge-subscriptions.test.tsx
│   │   │   ├── feishu-wiki-browser.test.tsx
│   │   │   ├── feishu.test.ts
│   │   │   ├── fixtures/
│   │   │   │   ├── creation-cases.ts
│   │   │   │   ├── creation-prompt-before.txt
│   │   │   │   ├── creation-quality-cases.ts
│   │   │   │   └── material-files.ts
│   │   │   ├── format-metric-count.test.ts
│   │   │   ├── global-artifact-search.test.ts
│   │   │   ├── home-performance-browser.test.ts
│   │   │   ├── ingest-job-recovery.test.ts
│   │   │   ├── integration-card-browser.test.ts
│   │   │   ├── integration-external-policy.test.ts
│   │   │   ├── integrations.test.ts
│   │   │   ├── internal-signup.test.ts
│   │   │   ├── learning-suggestions.test.ts
│   │   │   ├── llm-runtime-vision.test.ts
│   │   │   ├── local-directory-picker.test.ts
│   │   │   ├── local-storage.test.ts
│   │   │   ├── material-analysis-to-brief-mapper.test.ts
│   │   │   ├── material-analysis.test.ts
│   │   │   ├── material-chain.integration.test.ts
│   │   │   ├── material-detail-read-model.test.ts
│   │   │   ├── material-detail-view.test.ts
│   │   │   ├── material-distillation.test.ts
│   │   │   ├── material-knowledge.test.ts
│   │   │   ├── material-processing-timeout.test.ts
│   │   │   ├── material-readable-content.test.ts
│   │   │   ├── material-storage-roundtrip.test.ts
│   │   │   ├── material-upload-api.test.ts
│   │   │   ├── material-workspace-state.test.ts
│   │   │   ├── methods.test.ts
│   │   │   ├── mother-confirmation.test.ts
│   │   │   ├── platform-content-factory.test.ts
│   │   │   ├── product-simplification.test.ts
│   │   │   ├── project-agent-core.test.ts
│   │   │   ├── project-assistant.test.ts
│   │   │   ├── project-materials-panel.test.ts
│   │   │   ├── project-methods-ai.test.ts
│   │   │   ├── project-methods.test.ts
│   │   │   ├── project-next-action.test.ts
│   │   │   ├── provider-v0-policy.test.ts
│   │   │   ├── publishing-center.test.ts
│   │   │   ├── qa-prelaunch-core.test.ts
│   │   │   ├── reference-safety.test.ts
│   │   │   ├── release-readiness.test.ts
│   │   │   ├── research-abc-flow.test.ts
│   │   │   ├── research-account-fixture.ts
│   │   │   ├── research-account-trend-browser.test.ts
│   │   │   ├── research-api.test.ts
│   │   │   ├── research-benchmarks.test.ts
│   │   │   ├── research-blocks.test.ts
│   │   │   ├── research-core-browser.test.ts
│   │   │   ├── research-creation-browser.test.ts
│   │   │   ├── research-creation-selection.test.ts
│   │   │   ├── research-creation.test.ts
│   │   │   ├── research-experience-browser.test.ts
│   │   │   ├── research-home-inputs.test.ts
│   │   │   ├── research-library.test.ts
│   │   │   ├── research-mode-output.test.ts
│   │   │   ├── research-navigation.test.tsx
│   │   │   ├── research-news-api.test.ts
│   │   │   ├── research-news-browser.test.ts
│   │   │   ├── research-news-runtime.test.ts
│   │   │   ├── research-news.test.ts
│   │   │   ├── research-project-handoff.test.ts
│   │   │   ├── research-queued-timeout.test.ts
│   │   │   ├── research-session.test.ts
│   │   │   ├── research-sharing.test.ts
│   │   │   ├── research-source-inbox.test.ts
│   │   │   ├── research-trends.test.ts
│   │   │   ├── review-asr-probes.test.ts
│   │   │   ├── review-external-boundaries.test.ts
│   │   │   ├── shared-artifact-editor-browser.test.ts
│   │   │   ├── sidebar-organization.test.ts
│   │   │   ├── sidebar-state.test.ts
│   │   │   ├── skill-resolver.test.ts
│   │   │   ├── source-metadata-refresh.test.ts
│   │   │   ├── source-processing-state.test.ts
│   │   │   ├── source-understanding.test.ts
│   │   │   ├── source-upload.test.ts
│   │   │   ├── staging-admin-bootstrap.test.ts
│   │   │   ├── starship-frontend-browser.test.ts
│   │   │   ├── studio-creation-context.test.ts
│   │   │   ├── studio-default-method.test.ts
│   │   │   ├── studio-fact-safety.test.ts
│   │   │   ├── teardown-chain.test.ts
│   │   │   ├── today-recommendations.test.ts
│   │   │   ├── topic-opportunity-v2.test.ts
│   │   │   ├── unified-creative-analysis.test.ts
│   │   │   ├── usage.test.ts
│   │   │   ├── user-lifecycle.test.ts
│   │   │   ├── video-analytics-browser.test.ts
│   │   │   ├── video-analytics.test.ts
│   │   │   ├── video-link-ingest.test.ts
│   │   │   ├── video-operations.test.ts
│   │   │   ├── voice-input-api.test.ts
│   │   │   ├── voice-input-browser.test.ts
│   │   │   ├── voice-recording-roundtrip.test.ts
│   │   │   ├── voice-transcription.test.ts
│   │   │   ├── work-research-analysis.test.ts
│   │   │   ├── work-research-collect.test.ts
│   │   │   ├── work-research-fixture.ts
│   │   │   ├── work-research-markdown.test.ts
│   │   │   ├── work-research-recommendations.test.ts
│   │   │   ├── work-research-service.test.ts
│   │   │   ├── workflow-skill.test.ts
│   │   │   └── writing-method.test.ts
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── vitest.research-navigation.config.ts
│   └── worker/
│       ├── Dockerfile
│       ├── package.json
│       ├── src/
│       │   ├── benchmark-analysis.test.ts
│       │   ├── benchmark-analysis.ts
│       │   ├── benchmark-collection-utils.test.ts
│       │   ├── benchmark-collection-utils.ts
│       │   ├── benchmark-collection.ts
│       │   ├── benchmark-creator-profile-v2.test.ts
│       │   ├── benchmark-creator-profile-v3.test.ts
│       │   ├── benchmark-creator-profile-v4.test.ts
│       │   ├── benchmark-creator-profile.test.ts
│       │   ├── benchmark-creator-profile.ts
│       │   ├── benchmark-playbook.test.ts
│       │   ├── benchmark-playbook.ts
│       │   ├── experience-limits.test.ts
│       │   ├── experience-limits.ts
│       │   ├── free-runtime.test.ts
│       │   ├── free-runtime.ts
│       │   ├── index.ts
│       │   ├── ingest.integration.test.ts
│       │   ├── ingest.ts
│       │   ├── integrations.test.ts
│       │   ├── integrations.ts
│       │   ├── job-recovery.integration.test.ts
│       │   ├── job-recovery.ts
│       │   ├── llm-runtime.ts
│       │   ├── material-analysis-request.ts
│       │   ├── material-analysis.test.ts
│       │   ├── material-analysis.ts
│       │   ├── material-distillation.test.ts
│       │   ├── material-distillation.ts
│       │   ├── queue-producer.ts
│       │   ├── queue.test.ts
│       │   ├── queue.ts
│       │   ├── redfox-ingest.ts
│       │   ├── redis-connection.test.ts
│       │   ├── redis-connection.ts
│       │   ├── source-content.ts
│       │   ├── teardown/
│       │   │   ├── capabilities.ts
│       │   │   ├── queue.ts
│       │   │   ├── worker.test.ts
│       │   │   └── worker.ts
│       │   ├── test-fixtures/
│       │   │   └── recovery-process.ts
│       │   ├── transcription-chunks.test.ts
│       │   ├── transcription-chunks.ts
│       │   ├── transcription-policy.test.ts
│       │   ├── transcription-queue.ts
│       │   ├── transcription.integration.test.ts
│       │   ├── transcription.test.ts
│       │   ├── transcription.ts
│       │   ├── video-preview.ts
│       │   └── worker-mode.ts
│       └── tsconfig.json
├── config/
│   └── environments/
│       ├── README.md
│       ├── feishu.env.example
│       ├── local-real.env.example
│       ├── local-test.env.example
│       └── workbench-review.env.example
├── packages/
│   ├── config/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── media.test.ts
│   │   │   └── media.ts
│   │   ├── tsconfig/
│   │   │   └── base.json
│   │   └── tsconfig.json
│   ├── core/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── content-project-state.test.ts
│   │   │   ├── content-project-state.ts
│   │   │   ├── discovery-query.test.ts
│   │   │   ├── discovery-query.ts
│   │   │   ├── index.ts
│   │   │   ├── rbac.test.ts
│   │   │   ├── rbac.ts
│   │   │   ├── research.ts
│   │   │   ├── slug.test.ts
│   │   │   ├── slug.ts
│   │   │   ├── source-capability.test.ts
│   │   │   ├── source-capability.ts
│   │   │   ├── source-content.test.ts
│   │   │   ├── source-content.ts
│   │   │   ├── source-domain.test.ts
│   │   │   ├── source-domain.ts
│   │   │   ├── source-url.test.ts
│   │   │   ├── source-url.ts
│   │   │   ├── tag-slug.test.ts
│   │   │   ├── teardown.test.ts
│   │   │   ├── teardown.ts
│   │   │   ├── today-recommendation.test.ts
│   │   │   ├── today-recommendation.ts
│   │   │   ├── trend.test.ts
│   │   │   └── trend.ts
│   │   └── tsconfig.json
│   ├── db/
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   │   ├── 20260901053107_foundation/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901053500_auth_account_issuer/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901054200_integration_publishing_provider/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901055711_content_ingest/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901065124_integration_secrets/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901080000_redfox_provider/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901163000_doubao_asr/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901170000_content_projects/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901180000_ai_creation_engine/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901190000_platform_content_factory/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901200000_deep_content_package/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901201000_deep_content_package_models/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901210000_content_quality_review_enums/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901211000_content_quality_review_models/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260901220000_publishing_center/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902010000_local_transcription_configuration/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902130000_content_discovery_v1/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902150000_content_discovery_trends/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902150100_topic_prompt_template/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902170000_today_recommendations/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902170100_today_recommendation_prompt/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902190000_smart_material_analysis/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902190100_smart_material_analysis_prompt/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902210000_material_analysis_studio_handoff/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902220000_unified_creative_analysis/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260902220100_unified_creative_analysis_prompt/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260903120000_product_simplification_v1/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260903170000_multi_user_system_role/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260903180000_product_closure/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260907120000_m1_material_analysis_async/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260907150000_my_methods/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260907170000_studio_method_usage/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260907180000_benchmark_studies/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260907180100_benchmark_study_prompt/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260907190000_creation_feedback/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260907200000_material_distillation/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260908113000_benchmark_sample_optional_analysis/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260909043000_default_content_method_marker/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260912150000_canvas_free_objects/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260913120000_draft_branches_revisions/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260913150000_draft_working_state/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260913180000_project_assistant_thread/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260913190000_canvas_node_ai/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260913200000_material_knowledge_candidates/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260913213000_method_profile_suggestions/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260917100000_document_source_assets/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260918090000_workflow_skill_contract/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260921150000_generic_text_artifact/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260921194000_sidebar_project_organization/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260923120000_benchmark_research_organization/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260923153000_benchmark_input_evidence/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260924100000_benchmark_collection_runs/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260925200500_core_creation_idempotency/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260926090000_creation_composer/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260926160000_source_understanding/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260927120000_research_sessions/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260927143000_research_object_preferences/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260927150000_research_artifact_source/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260927153000_research_legacy_artifact_source/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260928090000_account_space/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20260928142000_web_search_provider/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20261004143000_research_fk_index_alignment/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20261007140000_content_governance/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20261007141000_knowledge_versions/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20261007142000_private_project_conversations/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20261008040000_video_operations/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20261008060000_feishu_library/
│   │   │   │   │   └── migration.sql
│   │   │   │   ├── 20261009083000_feishu_wiki_subscriptions/
│   │   │   │   │   └── migration.sql
│   │   │   │   └── migration_lock.toml
│   │   │   └── schema.prisma
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── projects.test.ts
│   │   │   ├── projects.ts
│   │   │   ├── review-target.test.ts
│   │   │   ├── review-target.ts
│   │   │   ├── sources.test.ts
│   │   │   ├── sources.ts
│   │   │   ├── test-target.test.ts
│   │   │   ├── test-target.ts
│   │   │   ├── workspaces.test.ts
│   │   │   └── workspaces.ts
│   │   └── tsconfig.json
│   ├── integrations/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── encryption.test.ts
│   │   │   ├── encryption.ts
│   │   │   ├── feishu/
│   │   │   │   ├── client.test.ts
│   │   │   │   ├── client.ts
│   │   │   │   ├── contracts.ts
│   │   │   │   ├── docx.test.ts
│   │   │   │   ├── docx.ts
│   │   │   │   ├── policy.ts
│   │   │   │   ├── service-boundary.test.ts
│   │   │   │   └── service.ts
│   │   │   ├── index.ts
│   │   │   ├── kimi-model-policy.test.ts
│   │   │   ├── kimi-model-policy.ts
│   │   │   ├── knowledge/
│   │   │   │   ├── feishu-access.ts
│   │   │   │   ├── feishu-service.ts
│   │   │   │   ├── feishu-wiki.test.ts
│   │   │   │   └── feishu-wiki.ts
│   │   │   ├── model-catalog.test.ts
│   │   │   ├── model-catalog.ts
│   │   │   ├── schemas.test.ts
│   │   │   ├── schemas.ts
│   │   │   ├── service.integration.test.ts
│   │   │   ├── service.ts
│   │   │   ├── system-config.test.ts
│   │   │   ├── system-config.ts
│   │   │   ├── system-provider-policy.test.ts
│   │   │   ├── system-provider-policy.ts
│   │   │   ├── tester.test.ts
│   │   │   └── tester.ts
│   │   ├── tsconfig.json
│   │   └── vitest.feishu.config.ts
│   ├── providers/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── benchmark-analysis.ts
│   │   │   ├── benchmark-creator-profile.ts
│   │   │   ├── benchmark-playbook.ts
│   │   │   ├── contracts.ts
│   │   │   ├── docx-text.test.ts
│   │   │   ├── docx-text.ts
│   │   │   ├── doubao/
│   │   │   │   ├── client.test.ts
│   │   │   │   ├── client.ts
│   │   │   │   ├── errors.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── normalize.ts
│   │   │   │   ├── provider.ts
│   │   │   │   ├── recording-file-client.test.ts
│   │   │   │   ├── recording-file-client.ts
│   │   │   │   ├── recording-file-provider.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   ├── streaming-client.test.ts
│   │   │   │   └── streaming-client.ts
│   │   │   ├── ffmpeg-media-processor.test.ts
│   │   │   ├── ffmpeg-media-processor.ts
│   │   │   ├── generation-quality.test.ts
│   │   │   ├── generation-quality.ts
│   │   │   ├── image-validation.test.ts
│   │   │   ├── image-validation.ts
│   │   │   ├── index.ts
│   │   │   ├── ingest-error.ts
│   │   │   ├── local-asr/
│   │   │   │   ├── client.test.ts
│   │   │   │   ├── client.ts
│   │   │   │   ├── errors.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── provider.ts
│   │   │   │   ├── quality-resolver.test.ts
│   │   │   │   ├── quality-resolver.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   └── types.ts
│   │   │   ├── material-analysis.ts
│   │   │   ├── material-distillation.ts
│   │   │   ├── media-fetcher.test.ts
│   │   │   ├── media-fetcher.ts
│   │   │   ├── minio-storage.test.ts
│   │   │   ├── minio-storage.ts
│   │   │   ├── mocks.test.ts
│   │   │   ├── mocks.ts
│   │   │   ├── openai-compatible/
│   │   │   │   ├── errors.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── provider.test.ts
│   │   │   │   ├── provider.ts
│   │   │   │   └── schemas.ts
│   │   │   ├── pdf-text.test.ts
│   │   │   ├── pdf-text.ts
│   │   │   ├── provider-fetch-review.test.ts
│   │   │   ├── provider-fetch.ts
│   │   │   ├── redfox/
│   │   │   │   ├── client.test.ts
│   │   │   │   ├── client.ts
│   │   │   │   ├── discovery-adapters.test.ts
│   │   │   │   ├── discovery-adapters.ts
│   │   │   │   ├── discovery-normalize.test.ts
│   │   │   │   ├── discovery-normalize.ts
│   │   │   │   ├── discovery.ts
│   │   │   │   ├── errors.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── normalize.ts
│   │   │   │   ├── platform.test.ts
│   │   │   │   ├── platform.ts
│   │   │   │   ├── provider.ts
│   │   │   │   ├── schemas.ts
│   │   │   │   ├── trend-normalize.test.ts
│   │   │   │   ├── trend-normalize.ts
│   │   │   │   ├── trend-provider.test.ts
│   │   │   │   ├── trend-provider.ts
│   │   │   │   └── trends.ts
│   │   │   ├── render-media-relay.test.ts
│   │   │   ├── render-media-relay.ts
│   │   │   ├── review-policy.test.ts
│   │   │   ├── review-policy.ts
│   │   │   ├── s3-compatible-storage.test.ts
│   │   │   ├── s3-compatible-storage.ts
│   │   │   ├── safe-url.test.ts
│   │   │   ├── safe-url.ts
│   │   │   ├── source-external-metadata.test.ts
│   │   │   ├── source-external-metadata.ts
│   │   │   ├── source-index.test.ts
│   │   │   ├── source-index.ts
│   │   │   ├── source-providers.test.ts
│   │   │   ├── source-providers.ts
│   │   │   ├── storage-object-key.test.ts
│   │   │   ├── storage-object-key.ts
│   │   │   ├── storage-path.test.ts
│   │   │   ├── storage-path.ts
│   │   │   ├── storage.ts
│   │   │   ├── teardown-analysis.ts
│   │   │   └── types.ts
│   │   └── tsconfig.json
│   └── ui/
│       ├── package.json
│       ├── src/
│       │   ├── badge.tsx
│       │   ├── button.tsx
│       │   ├── card.tsx
│       │   ├── console-card.tsx
│       │   ├── console-kpi.tsx
│       │   ├── index.ts
│       │   ├── input.tsx
│       │   └── utils.ts
│       └── tsconfig.json
├── scripts/
│   ├── check-client-boundaries.mjs
│   ├── check-client-boundaries.test.mjs
│   ├── content-governance-smoke.mjs
│   ├── dev-down.ps1
│   ├── dev-up.ps1
│   ├── doctor.ps1
│   ├── fusion-config.mjs
│   ├── fusion-config.test.mjs
│   ├── fusion-local.mjs
│   ├── fusion-regression.mjs
│   ├── local-profile.mjs
│   ├── local-profile.test.mjs
│   ├── local-release-profile.mjs
│   ├── local-release.mjs
│   ├── local-web.mjs
│   ├── release-build-network.mjs
│   ├── release-profile.test.mjs
│   ├── runtime-env.mjs
│   ├── start-free-experience.mjs
│   ├── test-database-setup.ts
│   ├── testing/
│   │   └── doubao-stream-fixture.ts
│   └── verify-research-migrations.ps1
├── services/
│   └── local-asr/
│       ├── benchmark/
│       │   ├── audio/
│       │   │   ├── background_music.wav
│       │   │   ├── fast_speech.wav
│       │   │   ├── mixed_english.wav
│       │   │   ├── names_brands.wav
│       │   │   ├── normal_zh.wav
│       │   │   ├── numbers.wav
│       │   │   └── synthetic_accent.wav
│       │   ├── benchmark_model.py
│       │   ├── fixtures.json
│       │   ├── generate_fixtures.py
│       │   ├── results/
│       │   │   ├── fun_asr_nano.json
│       │   │   ├── paraformer_zh.json
│       │   │   └── sensevoice_small.json
│       │   └── run_benchmark.py
│       ├── bounded_runtime.py
│       ├── hardware.py
│       ├── model-profile.json
│       ├── model_registry.py
│       ├── requirements.txt
│       ├── runtime.py
│       ├── server.py
│       └── test_bounded_runtime.py
└── vendor/
    └── ip-strategist/
        └── v2.2.0/
            ├── SOURCE.md
            └── references/
                ├── 03-脚本骨架.md
                ├── 04-口播文案.md
                └── task-script.md
```

## 页面索引（含隐藏、兼容、实验入口）

| 逻辑路径 | 文件 | 静态行为 | 组件/服务导入 |
| --- | --- | --- | --- |
| /about | `apps/web/app/(app)/@settings/(.)settings/about/page.tsx:1` | 重导出/拦截复用 | ../../../settings/about/page |
| /account | `apps/web/app/(app)/@settings/(.)settings/account/page.tsx:1` | 重导出/拦截复用 | ../../../settings/account/page |
| /creator-profile | `apps/web/app/(app)/@settings/(.)settings/creator-profile/page.tsx:1` | 重导出/拦截复用 | ../../../settings/creator-profile/page |
| /diagnostics | `apps/web/app/(app)/@settings/(.)settings/diagnostics/page.tsx:1` | 重导出/拦截复用 | ../../../settings/diagnostics/page |
| /integrations | `apps/web/app/(app)/@settings/(.)settings/integrations/page.tsx:1` | 重导出/拦截复用 | ../../../settings/integrations/page |
| /members | `apps/web/app/(app)/@settings/(.)settings/members/page.tsx:1` | 重导出/拦截复用 | ../../../settings/members/page |
| / | `apps/web/app/(app)/@settings/(.)settings/page.tsx:1` | 重导出/拦截复用 | ../../settings/page |
| /storage | `apps/web/app/(app)/@settings/(.)settings/storage/page.tsx:1` | 重导出/拦截复用 | ../../../settings/storage/page |
| /workspace | `apps/web/app/(app)/@settings/(.)settings/workspace/page.tsx:1` | 重导出/拦截复用 | ../../../settings/workspace/page |
| /[...catchAll] | `apps/web/app/(app)/@settings/[...catchAll]/page.tsx:1` | 页面/容器 |  |
| /admin | `apps/web/app/(app)/admin/page.tsx:1` | 跳转兼容 | next/navigation |
| /admin/system | `apps/web/app/(app)/admin/system/page.tsx:1` | 页面/容器 | @content-center/ui、@/components/page、@/components/admin/system-doubao-config-form、@/server/access、@/server/admin/system-providers、@/server/admin/system-services |
| /admin/usage | `apps/web/app/(app)/admin/usage/page.tsx:1` | 页面/容器 | @content-center/ui、next/link、@/components/page、@/server/access、@/server/admin/usage |
| /admin/users | `apps/web/app/(app)/admin/users/page.tsx:1` | 页面/容器 | next/link、@content-center/db、@content-center/ui、@/components/admin/create-user-form、@/components/admin/user-lifecycle-actions、@/components/page、@/server/access |
| /calendar | `apps/web/app/(app)/calendar/page.tsx:1` | 页面/容器 | @content-center/ui、lucide-react、next/link、@/components/page、@/lib/platforms、@/server/access、@/server/publishing/publish-task-service、@/server/publishing/schemas |
| /calendar/tasks/[id] | `apps/web/app/(app)/calendar/tasks/[id]/page.tsx:1` | 页面/容器 | lucide-react、next/link、next/navigation、@/components/publishing/publish-task-workspace、@/server/access、@/server/publishing/publish-task-service |
| /content-review | `apps/web/app/(app)/content-review/page.tsx:1` | 页面/容器 | @/components/content-hub |
| /dashboard | `apps/web/app/(app)/dashboard/page.tsx:1` | 跳转兼容 | @/server/creation/models、next/navigation、@/components/projects/studio-shell、@/components/fusion-overview、@/components/workbench-start、@/server/access、@/server/workbench-page-data、@/server/artifacts/service |
| /discovery/benchmarks/[id] | `apps/web/app/(app)/discovery/benchmarks/[id]/page.tsx:1` | 跳转兼容 | next/navigation |
| /discovery/ideas/[id] | `apps/web/app/(app)/discovery/ideas/[id]/page.tsx:1` | 页面/容器 | next/navigation、@/components/discovery/idea-workspace、@/server/access、@/server/discovery/service |
| /discovery/ideas | `apps/web/app/(app)/discovery/ideas/page.tsx:1` | 页面/容器 | lucide-react、next/link、@/server/access、@/server/discovery/service |
| /discovery | `apps/web/app/(app)/discovery/page.tsx:1` | 跳转兼容 | next/navigation |
| /discovery/recommendations/[id] | `apps/web/app/(app)/discovery/recommendations/[id]/page.tsx:1` | 页面/容器 | @content-center/ui、lucide-react、next/link、next/navigation、@/components/discovery/recommendation-detail-actions、@/server/access、@/server/discovery/recommendations/service |
| /discovery/trends/[key] | `apps/web/app/(app)/discovery/trends/[key]/page.tsx:1` | 页面/容器 | @content-center/db、next/navigation、@/components/discovery/trend-detail-workspace、@/server/access、@/server/integrations、@/server/discovery/trends/read-model |
| /discovery/trends | `apps/web/app/(app)/discovery/trends/page.tsx:1` | 页面/容器 | @/components/discovery/trend-workspace、@/server/access、@/server/integrations、@/server/discovery/trends/read-model、@/server/discovery/trends/service |
| /home | `apps/web/app/(app)/home/page.tsx:1` | 页面/容器 | @/components/video-analytics-workspace、@/server/access |
| /ip-context | `apps/web/app/(app)/ip-context/page.tsx:1` | 页面/容器 | @/components/content-hub |
| /knowledge/facts | `apps/web/app/(app)/knowledge/facts/page.tsx:1` | 页面/容器 | @/components/content-hub |
| /knowledge | `apps/web/app/(app)/knowledge/page.tsx:1` | 页面/容器 | @/components/content-hub |
| /library/[id] | `apps/web/app/(app)/library/[id]/page.tsx:1` | 页面/容器 | next/navigation、@/components/material-detail/source-workspace、@/server/access、@/server/material-detail/read-model |
| /library/feishu | `apps/web/app/(app)/library/feishu/page.tsx:1` | 页面/容器 | @/server/access、@/components/library/feishu-library |
| /library/methods/[id] | `apps/web/app/(app)/library/methods/[id]/page.tsx:1` | 页面/容器 | lucide-react、next/link、next/navigation、@/components/library/method-detail、@/server/access、@/server/methods/service |
| /library/methods | `apps/web/app/(app)/library/methods/page.tsx:1` | 页面/容器 | @/components/library/skill-management、lucide-react、next/link、@/components/library/workflow-skill-import、@/server/access、@/server/methods/service |
| /library | `apps/web/app/(app)/library/page.tsx:1` | 页面/容器 | lucide-react、next/link、@/components/library/ingest-dialog、@/components/library/library-card-controls、@/components/library/library-poller、@/components/library/library-toolbar、@/components/library/asset-thumbnail、@/lib/content-production、@/lib/source-processing-state、@/server/access、@/server/library |
| /projects/[id] | `apps/web/app/(app)/projects/[id]/page.tsx:1` | 跳转兼容 | next/navigation |
| /projects/[id]/review/[platform] | `apps/web/app/(app)/projects/[id]/review/[platform]/page.tsx:1` | 页面/容器 | lucide-react、next/link、next/navigation、zod、@content-center/integrations、@/components/projects/platform-review-workspace、@/lib/platforms、@/server/access、@/server/reviews/review-service |
| /projects/[id]/studio | `apps/web/app/(app)/projects/[id]/studio/page.tsx:1` | 跳转兼容 | next/navigation |
| /projects/methods | `apps/web/app/(app)/projects/methods/page.tsx:1` | 跳转兼容 | next/navigation |
| /projects/new | `apps/web/app/(app)/projects/new/page.tsx:1` | 跳转兼容 | @content-center/ui、lucide-react、next/link、next/navigation、@/components/projects/project-form、@/server/access |
| /projects | `apps/web/app/(app)/projects/page.tsx:1` | 页面/容器 | @content-center/ui、lucide-react、@content-center/db、next/link、next/navigation、@/components/projects/folder-library、@/components/projects/project-library-sync、@/server/sidebar/service、@/server/sidebar/view-model、@/components/projects/project-card-menu-with-lifecycle、@/components/projects/new-project-button、@/components/library/asset-thumbnail、@/components/projects/project-filter-menu、@/server/access、@/server/project-service |
| /research/benchmarks/[id] | `apps/web/app/(app)/research/benchmarks/[id]/page.tsx:1` | 页面/容器 | next/link、@content-center/providers、next/navigation、@/server/access、@/server/experience-account、@/server/research/benchmark-workbench、@/server/research/read-model、@/components/research/benchmark-workbench-actions、@/components/research/research-labels |
| /research/benchmarks/[id]/works/[workId] | `apps/web/app/(app)/research/benchmarks/[id]/works/[workId]/page.tsx:1` | 页面/容器 | next/link、@content-center/providers、next/navigation、@/server/access、@/server/research/access、@/server/research/work-research-service、@/components/research/work-research-controls、@/components/research/research-use-findings、@/components/research/work-decision-view、@/components/research/work-report-fragments、@/components/research/benchmark-workbench-actions、@/server/research/benchmark-workbench-math、@/server/research/benchmark-workbench、@/server/research/read-model、@content-center/db |
| /research/benchmarks | `apps/web/app/(app)/research/benchmarks/page.tsx:1` | 页面/容器 | next/link、@content-center/providers、@/server/access、@/server/experience-account、@/server/research/benchmark-workbench、@/server/research/read-model、@/components/research/benchmark-account-add、@/components/research/benchmark-workbench-actions、@/components/research/research-labels |
| /research/focus/[runId] | `apps/web/app/(app)/research/focus/[runId]/page.tsx:1` | 页面/容器 | next/link、next/navigation、@/server/access、@/server/research/access、@/server/research/focus-v2-service、@/components/research/research-use-findings、@/components/research/focus-v2-workbench |
| /research/focus | `apps/web/app/(app)/research/focus/page.tsx:1` | 页面/容器 | next/link、@/server/access、@/server/research/focus-v2-service、@/components/research/focus-v2-workbench |
| /research/new | `apps/web/app/(app)/research/new/page.tsx:1` | 页面/容器 | next/link、@/server/access、@/server/research/service、@/server/research/read-model、@/components/research/research-composer |
| /research | `apps/web/app/(app)/research/page.tsx:1` | 跳转兼容 | next/link、@/server/research/access、next/navigation、@/server/access、@/server/research/news/service、@/components/research/research-news |
| /research/results/[kind]/[id] | `apps/web/app/(app)/research/results/[kind]/[id]/page.tsx:1` | 跳转兼容 | next/link、next/navigation、react、@content-center/core、@/server/access、@/server/research/read-model、@/server/research/access、@/components/research/research-blocks、@/server/research/legacy、@/components/research/research-use-findings、@/server/research/work-research-service、@/components/research/work-creation-action、@/server/research/contracts、@/components/research/research-coverage、@content-center/core |
| /research/results | `apps/web/app/(app)/research/results/page.tsx:1` | 页面/容器 | @/server/research/service、@/components/research/research-labels、next/link、@/server/access、@/server/research/read-model、@content-center/core、@content-center/db |
| /research/session/[id] | `apps/web/app/(app)/research/session/[id]/page.tsx:1` | 跳转兼容 | next/navigation、@/server/research/teardown/service、@/server/access、@/server/research/service、@/server/research/read-model、@/server/research/access、@/server/research/work-research-service、@/components/research/research-session |
| /research/sources/[id] | `apps/web/app/(app)/research/sources/[id]/page.tsx:1` | 页面/容器 | @/components/research/research-source-notes、next/link、next/navigation、@/server/access、@/server/research/access、@/server/research/read-model、@/components/research/research-source-actions、@/components/research/research-labels |
| /research/sources | `apps/web/app/(app)/research/sources/page.tsx:1` | 跳转兼容 | next/link、next/navigation、@/server/access、@/server/research/read-model、@/components/research/research-source-actions、@/components/research/research-labels |
| /research/teardown | `apps/web/app/(app)/research/teardown/page.tsx:1` | 页面/容器 | @/server/access、@/server/research/teardown/service、@/server/research/read-model、@/components/research/teardown/teardown-workspace、next/navigation、@/server/research/access |
| /research/trends/[stableKey] | `apps/web/app/(app)/research/trends/[stableKey]/page.tsx:1` | 页面/容器 | next/link、next/navigation、@/server/access、@/server/research/access、@/server/research/trends、@/server/research/preferences、@/server/research/topic-opportunity-v2-service、@/components/research/topic-opportunity-v2-panel、@/components/research/research-object-actions、@/components/research/trend-related-search、@/components/research/research-labels、@/components/research/trend-history-chart |
| /research/trends | `apps/web/app/(app)/research/trends/page.tsx:1` | 页面/容器 | next/link、@/server/access、@/server/research/trends、@/components/research/trend-refresh、@/components/research/research-labels |
| /research/works | `apps/web/app/(app)/research/works/page.tsx:1` | 页面/容器 | next/link、@content-center/providers、@/server/access、@/server/research/read-model、@/components/research/benchmark-workbench-actions、@/components/research/research-labels |
| /settings/about | `apps/web/app/(app)/settings/about/page.tsx:1` | 页面/容器 | @/components/page、../../../../package.json |
| /settings/account | `apps/web/app/(app)/settings/account/page.tsx:1` | 页面/容器 | @/components/page、@/components/account-settings、@/server/access |
| /settings/creator-profile | `apps/web/app/(app)/settings/creator-profile/page.tsx:1` | 页面/容器 | @content-center/ui、@/components/settings/creator-profile-form、@/components/page、@/server/access、@/server/creator-profile-service、@/server/learning-suggestions/service、@/components/learning-suggestion-panels |
| /settings/diagnostics | `apps/web/app/(app)/settings/diagnostics/page.tsx:1` | 页面/容器 | @/components/page、@/components/settings-diagnostics |
| /settings/integrations | `apps/web/app/(app)/settings/integrations/page.tsx:1` | 页面/容器 | @content-center/core、@content-center/integrations、@/components/page、@/components/integrations/integration-card、@/components/integrations/transcription-settings-card、@/server/access、@/server/integrations、@/server/local-asr |
| /settings/members | `apps/web/app/(app)/settings/members/page.tsx:1` | 页面/容器 | @content-center/db、@/components/page、@/components/member-settings、@/server/access |
| /settings | `apps/web/app/(app)/settings/page.tsx:1` | 页面/容器 | next/link、@/server/access |
| /settings/storage | `apps/web/app/(app)/settings/storage/page.tsx:1` | 页面/容器 | @/components/page、@/server/access、@/components/local-storage-settings |
| /settings/workspace | `apps/web/app/(app)/settings/workspace/page.tsx:1` | 页面/容器 | @content-center/db、@/components/page、@/components/account-settings、@/server/access |
| /short-video | `apps/web/app/(app)/short-video/page.tsx:1` | 页面/容器 | @/components/video-analytics-workspace、@/server/access |
| /short-video/tasks/[id] | `apps/web/app/(app)/short-video/tasks/[id]/page.tsx:1` | 页面/容器 | @/components/video-center、@/server/access |
| /short-video/tasks | `apps/web/app/(app)/short-video/tasks/page.tsx:1` | 页面/容器 | @/components/video-center、@/server/access |
| /topics | `apps/web/app/(app)/topics/page.tsx:1` | 页面/容器 | @/components/content-hub |
| /account/invite | `apps/web/app/(auth)/account/invite/page.tsx:1` | 页面/容器 | next/headers、@/lib/auth、@/server/account-delivery、@/components/account-security-form |
| /account/recovery | `apps/web/app/(auth)/account/recovery/page.tsx:1` | 页面/容器 | next/headers、@/lib/auth、@/server/account-delivery、@/components/account-security-form |
| /account/reset | `apps/web/app/(auth)/account/reset/page.tsx:1` | 页面/容器 | next/headers、@/lib/auth、@/server/account-delivery、@/components/account-security-form |
| /account/verify | `apps/web/app/(auth)/account/verify/page.tsx:1` | 页面/容器 | next/headers、@/lib/auth、@/server/account-delivery、@/components/account-security-form |
| /login | `apps/web/app/(auth)/login/page.tsx:1` | 跳转兼容 | next/navigation、@/components/auth-form、@/lib/auth-errors |
| /register | `apps/web/app/(auth)/register/page.tsx:1` | 跳转兼容 | next/navigation、@/components/auth-form |
| /__runtime | `apps/web/app/__runtime/page.tsx:1` | 页面/容器 | next/navigation、@/server/runtime/health |
| /experience | `apps/web/app/experience/page.tsx:1` | 页面/容器 | react |
| /onboarding | `apps/web/app/onboarding/page.tsx:1` | 跳转兼容 | @content-center/ui、@content-center/db、next/navigation、@/components/onboarding-form、@/server/access |
| / | `apps/web/app/page.tsx:1` | 跳转兼容 | @content-center/db、next/headers、next/navigation、@/lib/auth |
| /platform/accounts | `apps/web/app/platform/accounts/page.tsx:1` | 重导出/拦截复用 | ../../(app)/admin/users/page |
| /platform/spaces | `apps/web/app/platform/spaces/page.tsx:1` | 页面/容器 | @content-center/db、@/server/access、@/server/account-delivery、@/components/admin/customer-spaces |
| /workspace-unavailable | `apps/web/app/workspace-unavailable/page.tsx:1` | 页面/容器 | next/link、@content-center/db、@/server/access、@/components/account-settings |

## 全 API 路由索引

以下为真实 route.ts 的方法和导入映射。共享 service 的 schema、权限、业务能力在矩阵及链路报告解释。导入包装器的路径可以继续追到鉴权；不因 route 文件未写明 role 判断就认定漏洞。API 未动态调用，所有运行成功状态均为未验证；不能由此索引推断每个 API 已被当前 UI 使用。

| API | 方法 | 路由文件 | 对应代码导入 | 直接权限线索 |
| --- | --- | --- | --- | --- |
| /api/account/invitation | POST | `apps/web/app/api/account/invitation/route.ts:1` | @/server/account-api、@/server/account-security、@/server/account-security-api | accountApi |
| /api/account/recovery | POST,PATCH | `apps/web/app/api/account/recovery/route.ts:1` | @/server/account-api、@/server/account-delivery、@/server/account-security、@/server/account-security-api | accountApi |
| /api/account/verification | POST,PATCH | `apps/web/app/api/account/verification/route.ts:1` | zod、@/server/account-api、@/server/api-access、@/server/account-delivery、@/server/account-security、@/server/account-security-api | accountApi |
| /api/admin/system/providers/[provider] | GET,PUT | `apps/web/app/api/admin/system/providers/[provider]/route.ts:1` | next/server、@/server/api-access、@/server/admin/system-providers、@/server/integration-api | getSystemAdminApiContext |
| /api/admin/system | GET | `apps/web/app/api/admin/system/route.ts:1` | next/server、@/server/admin/system-services、@/server/api-access | getSystemAdminApiContext |
| /api/admin/usage | GET | `apps/web/app/api/admin/usage/route.ts:1` | next/server、@/server/admin/usage、@/server/api-access | getSystemAdminApiContext |
| /api/admin/users/[id] | PATCH | `apps/web/app/api/admin/users/[id]/route.ts:1` | next/server、zod、@/server/api-access、@/server/admin/user-lifecycle、@/server/account-api | getSystemAdminApiContext |
| /api/admin/users | GET,POST | `apps/web/app/api/admin/users/route.ts:1` | @content-center/db、next/server、zod、@/server/account-space、@/server/account-api、@/server/api-access、@/server/account-api | getSystemAdminApiContext,accountApi |
| /api/admin/workspaces | GET,POST | `apps/web/app/api/admin/workspaces/route.ts:1` | @content-center/db、@/server/account-api、@/server/api-access、@/server/account-delivery、@/server/account-security | getSystemAdminApiContext,accountApi |
| /api/auth/[...all] | POST | `apps/web/app/api/auth/[...all]/route.ts:1` | ../../../../server/experience-account、better-auth/next-js、next/server、@content-center/db、../../../../server/account-api、../../../../lib/auth-errors、../../../../server/account-security-api、../../../../lib/auth、../../../../server/auth-response、../../../../server/internal-signup | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |
| /api/benchmark-topics/[runId]/select | POST | `apps/web/app/api/benchmark-topics/[runId]/select/route.ts:1` | next/server、zod、@/server/api-access、@/server/benchmark-topics/service | getApiWorkspaceContext |
| /api/benchmark-topics | POST | `apps/web/app/api/benchmark-topics/route.ts:1` | next/server、@/server/api-access、@/server/benchmark-topics/service、@/server/benchmark-topics/schemas | getApiWorkspaceContext |
| /api/collections | GET,POST | `apps/web/app/api/collections/route.ts:1` | @content-center/db、next/server、zod、@/server/api-access | getApiWorkspaceContext |
| /api/content-hub | GET,POST | `apps/web/app/api/content-hub/route.ts:1` | @/server/api-access、@/server/content-governance/service、@/server/content-governance/policy | getApiWorkspaceContext |
| /api/creation/models | GET | `apps/web/app/api/creation/models/route.ts:1` | @/server/api-access、@/server/creation/models | getApiWorkspaceContext |
| /api/creation/sources | POST | `apps/web/app/api/creation/sources/route.ts:1` | zod、@/server/api-access、@/server/creation/sources | getApiWorkspaceContext |
| /api/creator-profile | GET,PUT | `apps/web/app/api/creator-profile/route.ts:1` | @/server/experience-account、next/server、zod、@/server/api-access、@/server/creator-profile-service | getApiWorkspaceContext |
| /api/creator-profile/suggestions/[suggestionId] | PATCH | `apps/web/app/api/creator-profile/suggestions/[suggestionId]/route.ts:1` | @/server/experience-account、next/server、zod、@/server/api-access、@/server/learning-suggestions/api、@/server/learning-suggestions/service | getApiWorkspaceContext |
| /api/creator-profile/suggestions | GET,POST | `apps/web/app/api/creator-profile/suggestions/route.ts:1` | @/server/experience-account、next/server、@/server/api-access、@/server/learning-suggestions/api、@/server/learning-suggestions/service | getApiWorkspaceContext |
| /api/dev/runtime-health | GET | `apps/web/app/api/dev/runtime-health/route.ts:1` | next/server、@/server/runtime/health | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |
| /api/discovery/benchmarks/[id]/collection-runs/[runId] | GET | `apps/web/app/api/discovery/benchmarks/[id]/collection-runs/[runId]/route.ts:1` | next/server、@/server/api-access、@/server/discovery/benchmark-collection-service | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/collection-runs | GET,POST | `apps/web/app/api/discovery/benchmarks/[id]/collection-runs/route.ts:1` | next/server、@/server/api-access、@/server/discovery/benchmark-collection-service | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/comments/analyze | POST | `apps/web/app/api/discovery/benchmarks/[id]/comments/analyze/route.ts:1` | next/server、@/server/api-access、@/server/discovery/research-library、@/server/discovery/comment-analysis | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/comments/collect | POST | `apps/web/app/api/discovery/benchmarks/[id]/comments/collect/route.ts:1` | zod、next/server、@/server/api-access、@/server/discovery/f2-collector、@/server/discovery/research-library | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/inputs | GET,POST | `apps/web/app/api/discovery/benchmarks/[id]/inputs/route.ts:1` | next/server、zod、@/server/api-access、@/server/discovery/research-library、@/server/discovery/benchmark-inputs | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/method-suggestions/[suggestionId] | PATCH | `apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/[suggestionId]/route.ts:1` | next/server、zod、@/server/api-access、@/server/learning-suggestions/api、@/server/learning-suggestions/service | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/method-suggestions | GET,POST | `apps/web/app/api/discovery/benchmarks/[id]/method-suggestions/route.ts:1` | next/server、zod、@/server/api-access、@/server/learning-suggestions/api、@/server/learning-suggestions/service | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/organization | PATCH | `apps/web/app/api/discovery/benchmarks/[id]/organization/route.ts:1` | next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/research-library | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/report | GET | `apps/web/app/api/discovery/benchmarks/[id]/report/route.ts:1` | next/server、@/server/api-access、@/server/discovery/benchmark-creator-read-model、@/server/discovery/account-report-contract | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id] | GET,DELETE | `apps/web/app/api/discovery/benchmarks/[id]/route.ts:1` | next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/benchmarks/[id]/studies | GET,POST | `apps/web/app/api/discovery/benchmarks/[id]/studies/route.ts:1` | next/server、@/server/api-access | getApiWorkspaceContext |
| /api/discovery/benchmarks | GET,POST | `apps/web/app/api/discovery/benchmarks/route.ts:1` | @/server/experience-account、next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/schemas、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/collect | POST | `apps/web/app/api/discovery/collect/route.ts:1` | next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/schemas、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/ideas/[id]/references | POST | `apps/web/app/api/discovery/ideas/[id]/references/route.ts:1` | next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/schemas、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/ideas/[id] | GET,PATCH | `apps/web/app/api/discovery/ideas/[id]/route.ts:1` | next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/schemas、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/ideas/[id]/start | POST | `apps/web/app/api/discovery/ideas/[id]/start/route.ts:1` | next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/schemas、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/ideas | GET,POST | `apps/web/app/api/discovery/ideas/route.ts:1` | next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/schemas、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/projects | POST | `apps/web/app/api/discovery/projects/route.ts:1` | next/server、@/server/api-access、@/server/discovery/api、@/server/discovery/schemas、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/recommendations/[id] | GET,POST | `apps/web/app/api/discovery/recommendations/[id]/route.ts:1` | next/server、@/server/api-access、@/server/discovery/recommendations/api、@/server/discovery/recommendations/schemas、@/server/discovery/recommendations/service | getApiWorkspaceContext |
| /api/discovery/recommendations | GET,POST | `apps/web/app/api/discovery/recommendations/route.ts:1` | next/server、@/server/api-access、@/server/discovery/recommendations/api、@/server/discovery/recommendations/service | getApiWorkspaceContext |
| /api/discovery/search | POST | `apps/web/app/api/discovery/search/route.ts:1` | next/server、@content-center/core、@/server/api-access、@/server/discovery/api、@/server/discovery/schemas、@/server/discovery/service | getApiWorkspaceContext |
| /api/discovery/trends/[key]/ideas | POST | `apps/web/app/api/discovery/trends/[key]/ideas/route.ts:1` | next/server、@/server/api-access、@/server/discovery/trends/api、@/server/discovery/trends/read-model、@/server/discovery/trends/schemas、@/server/discovery/trends/topic-service | getApiWorkspaceContext |
| /api/discovery/trends/[key]/related | POST | `apps/web/app/api/discovery/trends/[key]/related/route.ts:1` | next/server、@/server/api-access、@/server/discovery/service、@/server/discovery/trends/api、@/server/discovery/trends/read-model、@/server/discovery/trends/service | getApiWorkspaceContext |
| /api/discovery/trends/[key]/topics | POST | `apps/web/app/api/discovery/trends/[key]/topics/route.ts:1` | next/server、@/server/api-access、@/server/discovery/trends/api、@/server/discovery/trends/read-model、@/server/discovery/trends/schemas、@/server/discovery/trends/topic-service | getApiWorkspaceContext |
| /api/discovery/trends | GET,POST | `apps/web/app/api/discovery/trends/route.ts:1` | next/server、@/server/api-access、@/server/discovery/trends/api、@/server/discovery/trends/read-model、@/server/discovery/trends/schemas、@/server/discovery/trends/service | getApiWorkspaceContext |
| /api/experience/start | POST | `apps/web/app/api/experience/start/route.ts:1` | next/server、@/lib/auth | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |
| /api/feishu/browse | POST | `apps/web/app/api/feishu/browse/route.ts:1` | @/server/api-access、@/server/knowledge/feishu-browse、@content-center/integrations | getApiWorkspaceContext |
| /api/feishu | GET,POST | `apps/web/app/api/feishu/route.ts:1` | @/server/api-access、@/server/feishu/service、@/server/feishu/policy、@content-center/integrations | getApiWorkspaceContext |
| /api/health/live | GET,HEAD | `apps/web/app/api/health/live/route.ts:1` |  | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |
| /api/health/ready | GET,HEAD | `apps/web/app/api/health/ready/route.ts:1` | @/server/runtime/readiness | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |
| /api/ingest-jobs/[id]/cancel | POST | `apps/web/app/api/ingest-jobs/[id]/cancel/route.ts:1` | @content-center/db、@content-center/worker/job-recovery、next/server、@/server/api-access | getApiWorkspaceContext |
| /api/ingest-jobs/[id]/retry | POST | `apps/web/app/api/ingest-jobs/[id]/retry/route.ts:1` | @content-center/db、@content-center/worker/queue-producer、@content-center/worker/job-recovery、@content-center/worker/transcription、next/server、@/server/api-access | getApiWorkspaceContext |
| /api/ingest-jobs/[id] | GET | `apps/web/app/api/ingest-jobs/[id]/route.ts:1` | @content-center/db、next/server、@/server/api-access | getApiWorkspaceContext |
| /api/integrations/LLM/models | GET | `apps/web/app/api/integrations/LLM/models/route.ts:1` | @content-center/integrations、@content-center/providers、@/server/api-access、@/server/integration-api | getApiWorkspaceContext |
| /api/integrations/[provider]/disable | POST | `apps/web/app/api/integrations/[provider]/disable/route.ts:1` | @/server/account-api、@content-center/core、@content-center/integrations、next/server、@/server/api-access、@/server/integration-api、@/server/integrations | getApiWorkspaceContext |
| /api/integrations/[provider]/enable | POST | `apps/web/app/api/integrations/[provider]/enable/route.ts:1` | @/server/account-api、@content-center/core、@content-center/integrations、next/server、@/server/api-access、@/server/integration-api、@/server/integrations | getApiWorkspaceContext |
| /api/integrations/[provider] | GET,PUT,DELETE | `apps/web/app/api/integrations/[provider]/route.ts:1` | @/server/account-api、@content-center/core、@content-center/integrations、next/server、@/server/api-access、@/server/integration-api、@/server/integrations | getApiWorkspaceContext |
| /api/integrations/[provider]/test | POST | `apps/web/app/api/integrations/[provider]/test/route.ts:1` | @content-center/providers、@content-center/integrations、zod、@/server/api-access、@/server/account-api、@/server/integration-api、@/server/integration-test | getApiWorkspaceContext |
| /api/integrations | GET | `apps/web/app/api/integrations/route.ts:1` | @content-center/core、@content-center/integrations、next/server、@/server/api-access、@/server/integrations | getApiWorkspaceContext |
| /api/internal-signup | POST | `apps/web/app/api/internal-signup/route.ts:1` | @/server/internal-signup | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |
| /api/internal/media-storage/[assetId] | GET | `apps/web/app/api/internal/media-storage/[assetId]/route.ts:1` | node:fs、node:fs/promises、node:path、node:stream、node:stream/web、node:stream/promises、@content-center/db、@/server/local-storage、next/server | configuredRelay,hasValidMediaRelayInternalAuthorization |
| /api/local-asr/models/initialize | POST | `apps/web/app/api/local-asr/models/initialize/route.ts:1` | @content-center/core、@content-center/providers、next/server、@/server/api-access、@/server/local-asr | getApiWorkspaceContext |
| /api/local-asr/status | GET | `apps/web/app/api/local-asr/status/route.ts:1` | next/server、@/server/api-access、@/server/local-asr | getApiWorkspaceContext |
| /api/media/[token] | GET | `apps/web/app/api/media/[token]/route.ts:1` | node:fs、node:fs/promises、node:stream、@content-center/db、@content-center/providers、@/server/local-storage | verifyMediaRelayToken |
| /api/methods/[id] | GET,PUT,PATCH,DELETE | `apps/web/app/api/methods/[id]/route.ts:1` | next/server、zod、@/server/api-access、@/server/methods/service | getApiWorkspaceContext |
| /api/methods/default | GET,POST,PUT,PATCH | `apps/web/app/api/methods/default/route.ts:1` | next/server、@content-center/providers、@/server/api-access、@/server/default-content-method/generation | getApiWorkspaceContext |
| /api/methods/import | POST | `apps/web/app/api/methods/import/route.ts:1` | next/server、zod、@/server/api-access、@/server/methods/service、@/server/workflow-skill/contract | getApiWorkspaceContext |
| /api/methods | GET,POST | `apps/web/app/api/methods/route.ts:1` | next/server、@/server/api-access、@/server/methods/service | getApiWorkspaceContext |
| /api/projects/[id]/ai/run | POST | `apps/web/app/api/projects/[id]/ai/run/route.ts:1` | next/server、zod、@/server/api-access、@/server/ai/ai-api、@/server/ai/ai-run-service、@/server/ai/schemas、@/server/unified-analysis/service、@/server/studio/quick-actions | getApiWorkspaceContext |
| /api/projects/[id]/ai/runs/[runId]/apply | POST | `apps/web/app/api/projects/[id]/ai/runs/[runId]/apply/route.ts:1` | next/server、zod、@/server/api-access、@/server/ai/ai-api、@/server/ai/ai-run-service、@/server/studio/quick-actions | getApiWorkspaceContext |
| /api/projects/[id]/ai/runs/[runId]/discard | POST | `apps/web/app/api/projects/[id]/ai/runs/[runId]/discard/route.ts:1` | next/server、@/server/api-access、@/server/ai/ai-api、@/server/ai/ai-run-service | getApiWorkspaceContext |
| /api/projects/[id]/artifacts/[artifactId]/history | GET,POST | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/history/route.ts:1` | zod、@/server/api-access、@/server/artifacts/api、@/server/artifacts/service | getApiWorkspaceContext |
| /api/projects/[id]/artifacts/[artifactId]/revisions | POST | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/revisions/route.ts:1` | zod、@/server/api-access、@/server/artifacts/api、@/server/artifacts/service | getApiWorkspaceContext |
| /api/projects/[id]/artifacts/[artifactId] | PATCH,GET,PUT | `apps/web/app/api/projects/[id]/artifacts/[artifactId]/route.ts:1` | @/server/api-access、@/server/artifacts/api、zod、@/server/artifacts/service | getApiWorkspaceContext |
| /api/projects/[id]/artifacts | GET,POST | `apps/web/app/api/projects/[id]/artifacts/route.ts:1` | zod、@/server/api-access、@/server/artifacts/api、@/server/artifacts/service | getApiWorkspaceContext |
| /api/projects/[id]/assistant/messages/[messageId]/save | POST | `apps/web/app/api/projects/[id]/assistant/messages/[messageId]/save/route.ts:1` | zod、@/server/api-access、@/server/assistant/api、@/server/assistant/service | getApiWorkspaceContext |
| /api/projects/[id]/assistant/models | GET | `apps/web/app/api/projects/[id]/assistant/models/route.ts:1` | @content-center/integrations、@/server/api-access、@/server/assistant/references、@/server/assistant/api | getApiWorkspaceContext |
| /api/projects/[id]/assistant/references | GET | `apps/web/app/api/projects/[id]/assistant/references/route.ts:1` | @/server/api-access、@/server/assistant/references、@/server/assistant/api | getApiWorkspaceContext |
| /api/projects/[id]/assistant | PATCH,GET,POST | `apps/web/app/api/projects/[id]/assistant/route.ts:1` | zod、@/lib/contracts/creation、@/server/creator-profile-service、@/server/research/contracts、@/server/api-access、@/server/assistant/api、@/server/assistant/service | getApiWorkspaceContext |
| /api/projects/[id]/brief | PUT | `apps/web/app/api/projects/[id]/brief/route.ts:1` | next/server、zod、@/server/api-access、@/server/brief-service、@/server/project-api | getApiWorkspaceContext |
| /api/projects/[id]/canvas/objects/[objectId]/assistant | GET,POST | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/assistant/route.ts:1` | zod、@/server/api-access、@/server/assistant/api、@/server/assistant/service | getApiWorkspaceContext |
| /api/projects/[id]/canvas/objects/[objectId]/restore | POST | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/restore/route.ts:1` | next/server、zod、@/server/api-access、@/server/canvas/api、@/server/canvas/service | getApiWorkspaceContext |
| /api/projects/[id]/canvas/objects/[objectId] | PATCH,DELETE | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/route.ts:1` | next/server、zod、@/server/api-access、@/server/canvas/api、@/server/canvas/service | getApiWorkspaceContext |
| /api/projects/[id]/canvas/objects | GET,POST | `apps/web/app/api/projects/[id]/canvas/objects/route.ts:1` | next/server、zod、@/server/api-access、@/server/canvas/api、@/server/canvas/service | getApiWorkspaceContext |
| /api/projects/[id]/creative-basis | POST | `apps/web/app/api/projects/[id]/creative-basis/route.ts:1` | next/server、zod、@content-center/db、@/server/api-access | getApiWorkspaceContext |
| /api/projects/[id]/deep-content-package/apply | POST | `apps/web/app/api/projects/[id]/deep-content-package/apply/route.ts:1` | next/server、zod、@/server/api-access、@/server/deep-content/api、@/server/deep-content/service | getApiWorkspaceContext |
| /api/projects/[id]/deep-content-package/generate | POST | `apps/web/app/api/projects/[id]/deep-content-package/generate/route.ts:1` | next/server、@/server/api-access、@/server/deep-content/api、@/server/deep-content/service | getApiWorkspaceContext |
| /api/projects/[id]/deep-content-package | GET,PUT | `apps/web/app/api/projects/[id]/deep-content-package/route.ts:1` | next/server、zod、@/server/api-access、@/server/deep-content/api、@/server/deep-content/service | getApiWorkspaceContext |
| /api/projects/[id]/drafts/[draftId]/checkpoint | POST | `apps/web/app/api/projects/[id]/drafts/[draftId]/checkpoint/route.ts:1` | next/server、zod、@/server/api-access、@/server/drafts/api、@/server/drafts/service | getApiWorkspaceContext |
| /api/projects/[id]/drafts/[draftId]/confirm | POST | `apps/web/app/api/projects/[id]/drafts/[draftId]/confirm/route.ts:1` | next/server、zod、@/server/api-access、@/server/ai/draft-warnings、@/server/drafts/api、@/server/drafts/service | getApiWorkspaceContext |
| /api/projects/[id]/drafts/[draftId]/history | GET | `apps/web/app/api/projects/[id]/drafts/[draftId]/history/route.ts:1` | next/server、@/server/api-access、@/server/drafts/api、@/server/drafts/service | getApiWorkspaceContext |
| /api/projects/[id]/drafts/[draftId]/primary | POST | `apps/web/app/api/projects/[id]/drafts/[draftId]/primary/route.ts:1` | next/server、zod、@/server/api-access、@/server/drafts/api、@/server/drafts/service | getApiWorkspaceContext |
| /api/projects/[id]/drafts/[draftId] | GET,PUT,PATCH,DELETE | `apps/web/app/api/projects/[id]/drafts/[draftId]/route.ts:1` | next/server、zod、@/server/api-access、@/server/drafts/api、@/server/drafts/service | getApiWorkspaceContext |
| /api/projects/[id]/drafts | GET,POST | `apps/web/app/api/projects/[id]/drafts/route.ts:1` | next/server、zod、@/server/api-access、@/server/drafts/api、@/server/drafts/service | getApiWorkspaceContext |
| /api/projects/[id]/evidence/[evidenceId] | PATCH,DELETE | `apps/web/app/api/projects/[id]/evidence/[evidenceId]/route.ts:1` | next/server、zod、@/server/api-access、@/server/evidence-service、@/server/project-api | getApiWorkspaceContext |
| /api/projects/[id]/evidence | POST | `apps/web/app/api/projects/[id]/evidence/route.ts:1` | next/server、zod、@/server/api-access、@/server/evidence-service、@/server/project-api | getApiWorkspaceContext |
| /api/projects/[id]/feedback | GET,PUT | `apps/web/app/api/projects/[id]/feedback/route.ts:1` | next/server、@/server/api-access、@/server/creation-feedback/service | getApiWorkspaceContext |
| /api/projects/[id]/gpt-task-package/copied | POST | `apps/web/app/api/projects/[id]/gpt-task-package/copied/route.ts:1` | next/server、zod、@/server/api-access、@/server/deep-content/api、@/server/deep-content/gpt-task-package | getApiWorkspaceContext |
| /api/projects/[id]/gpt-task-package | GET | `apps/web/app/api/projects/[id]/gpt-task-package/route.ts:1` | next/server、zod、@/server/api-access、@/server/deep-content/api、@/server/deep-content/gpt-task-package | getApiWorkspaceContext |
| /api/projects/[id]/import-gpt-draft | POST | `apps/web/app/api/projects/[id]/import-gpt-draft/route.ts:1` | next/server、zod、@/server/api-access、@/server/deep-content/api、@/server/deep-content/gpt-draft-import | getApiWorkspaceContext |
| /api/projects/[id]/methods | GET,PUT | `apps/web/app/api/projects/[id]/methods/route.ts:1` | next/server、@/server/api-access、@/server/project-methods/service | getApiWorkspaceContext |
| /api/projects/[id]/mother-content/confirm | POST | `apps/web/app/api/projects/[id]/mother-content/confirm/route.ts:1` | next/server、zod、@/server/api-access、@/server/ai/draft-warnings、@/server/mother-content-service、@content-center/db | getApiWorkspaceContext |
| /api/projects/[id]/mother-content/confirmation | PUT | `apps/web/app/api/projects/[id]/mother-content/confirmation/route.ts:1` | next/server、zod、@/server/api-access、@/server/mother-content-service | getApiWorkspaceContext |
| /api/projects/[id]/mother-content | GET,PUT | `apps/web/app/api/projects/[id]/mother-content/route.ts:1` | next/server、zod、@/server/api-access、@/server/mother-content-service、@/server/project-api | getApiWorkspaceContext |
| /api/projects/[id]/mother-content/warnings | POST | `apps/web/app/api/projects/[id]/mother-content/warnings/route.ts:1` | next/server、zod、@/server/api-access、@/server/ai/draft-warnings | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/[platform]/apply | POST | `apps/web/app/api/projects/[id]/platform-variants/[platform]/apply/route.ts:1` | next/server、zod、@/server/api-access、@/lib/platforms、@/server/platforms/platform-api、@/server/platforms/platform-variant-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/[platform]/review/ai | POST | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/ai/route.ts:1` | next/server、zod、@/lib/platforms、@/server/api-access、@/server/reviews/review-api、@/server/reviews/review-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/[platform]/review/approve | POST | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/approve/route.ts:1` | next/server、zod、@/lib/platforms、@/server/api-access、@/server/reviews/review-api、@/server/reviews/review-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/[platform]/review/reject | POST | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/reject/route.ts:1` | next/server、zod、@/lib/platforms、@/server/api-access、@/server/reviews/review-api、@/server/reviews/review-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/[platform]/review/request-changes | POST | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/request-changes/route.ts:1` | next/server、zod、@/lib/platforms、@/server/api-access、@/server/reviews/review-api、@/server/reviews/review-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/[platform]/review/submit | POST | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/submit/route.ts:1` | next/server、zod、@/lib/platforms、@/server/api-access、@/server/reviews/review-api、@/server/reviews/review-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/[platform]/reviews | GET | `apps/web/app/api/projects/[id]/platform-variants/[platform]/reviews/route.ts:1` | next/server、zod、@/lib/platforms、@/server/api-access、@/server/reviews/review-api、@/server/reviews/review-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/[platform] | GET,PUT | `apps/web/app/api/projects/[id]/platform-variants/[platform]/route.ts:1` | next/server、zod、@/server/api-access、@/lib/platforms、@/server/platforms/platform-api、@/server/platforms/platform-variant-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants/generate | POST | `apps/web/app/api/projects/[id]/platform-variants/generate/route.ts:1` | next/server、zod、@/server/api-access、@/lib/platforms、@/server/platforms/platform-api、@/server/platforms/platform-variant-service | getApiWorkspaceContext |
| /api/projects/[id]/platform-variants | GET | `apps/web/app/api/projects/[id]/platform-variants/route.ts:1` | next/server、@/server/api-access、@/server/platforms/platform-api、@/server/platforms/platform-variant-service | getApiWorkspaceContext |
| /api/projects/[id]/restore | POST | `apps/web/app/api/projects/[id]/restore/route.ts:1` | next/server、@/server/api-access、@/server/project-service、@/server/project-api | getApiWorkspaceContext |
| /api/projects/[id] | GET,PATCH,DELETE | `apps/web/app/api/projects/[id]/route.ts:1` | next/server、zod、@/server/api-access、@/server/project-service、@/server/project-api | getApiWorkspaceContext |
| /api/projects/[id]/sources/[sourceId] | DELETE | `apps/web/app/api/projects/[id]/sources/[sourceId]/route.ts:1` | next/server、@/server/api-access、@/server/project-api、@/server/project-service | getApiWorkspaceContext |
| /api/projects/[id]/sources | POST | `apps/web/app/api/projects/[id]/sources/route.ts:1` | next/server、zod、@/server/api-access、@/server/project-api、@/server/project-service | getApiWorkspaceContext |
| /api/projects/[id]/transition | POST | `apps/web/app/api/projects/[id]/transition/route.ts:1` | @content-center/core、next/server、zod、@/server/api-access、@/server/project-api、@/server/project-service | getApiWorkspaceContext |
| /api/projects | GET,POST | `apps/web/app/api/projects/route.ts:1` | next/server、zod、@/server/api-access、@/server/project-service、@/server/project-api、@/server/creation/models | getApiWorkspaceContext |
| /api/publish-tasks/[id]/cancel | POST | `apps/web/app/api/publish-tasks/[id]/cancel/route.ts:1` | next/server、@/server/api-access、@/server/publishing/publish-api、@/server/publishing/publish-task-service、@/server/publishing/schemas | getApiWorkspaceContext |
| /api/publish-tasks/[id]/failed | POST | `apps/web/app/api/publish-tasks/[id]/failed/route.ts:1` | next/server、@/server/api-access、@/server/publishing/publish-api、@/server/publishing/publish-task-service、@/server/publishing/schemas | getApiWorkspaceContext |
| /api/publish-tasks/[id]/package/copied | POST | `apps/web/app/api/publish-tasks/[id]/package/copied/route.ts:1` | next/server、@/server/api-access、@/server/publishing/publish-api、@/server/publishing/publish-task-service | getApiWorkspaceContext |
| /api/publish-tasks/[id]/package | GET | `apps/web/app/api/publish-tasks/[id]/package/route.ts:1` | next/server、@/server/api-access、@/server/publishing/publish-api、@/server/publishing/publish-task-service | getApiWorkspaceContext |
| /api/publish-tasks/[id]/published | POST | `apps/web/app/api/publish-tasks/[id]/published/route.ts:1` | next/server、@/server/api-access、@/server/publishing/publish-api、@/server/publishing/publish-task-service、@/server/publishing/schemas | getApiWorkspaceContext |
| /api/publish-tasks/[id] | GET,PATCH | `apps/web/app/api/publish-tasks/[id]/route.ts:1` | next/server、@/server/api-access、@/server/publishing/publish-api、@/server/publishing/publish-task-service、@/server/publishing/schemas | getApiWorkspaceContext |
| /api/publish-tasks/[id]/schedule | POST | `apps/web/app/api/publish-tasks/[id]/schedule/route.ts:1` | next/server、@/server/api-access、@/server/publishing/publish-api、@/server/publishing/publish-task-service、@/server/publishing/schemas | getApiWorkspaceContext |
| /api/publish-tasks | GET,POST | `apps/web/app/api/publish-tasks/route.ts:1` | next/server、zod、@/lib/platforms、@/server/api-access、@/server/publishing/publish-api、@/server/publishing/publish-task-service、@/server/publishing/schemas | getApiWorkspaceContext |
| /api/research/benchmarks/[id]/research-v2 | POST | `apps/web/app/api/research/benchmarks/[id]/research-v2/route.ts:1` | next/server、@/server/research/api、@/server/research/account-v2-service、@/server/research/service | researchApiActor |
| /api/research/benchmarks/[id]/research | POST | `apps/web/app/api/research/benchmarks/[id]/research/route.ts:1` | next/server、@/server/research/api、@/server/research/account-research-service、@/server/research/service | researchApiActor |
| /api/research/benchmarks/[id]/sync | POST | `apps/web/app/api/research/benchmarks/[id]/sync/route.ts:1` | @content-center/providers、@/server/api-access、@/server/experience-account、@/server/discovery/service、@/server/discovery/api | getApiWorkspaceContext |
| /api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export | GET | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/export/route.ts:1` | @/server/research/api、@/server/research/work-research-service、@/components/research/work-research-markdown | researchApiActor |
| /api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation | POST | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/[runId]/prepare-creation/route.ts:1` | zod、@/server/research/api、@/server/research/work-research-service | researchApiActor |
| /api/research/benchmarks/[id]/works/[workId]/analysis | POST | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/analysis/route.ts:1` | next/server、@/server/research/api、@/server/research/work-research-service、@/server/research/service | researchApiActor |
| /api/research/benchmarks/[id]/works/[workId]/collect | POST | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/collect/route.ts:1` | @/server/research/api、@/server/research/work-research-service、@/server/research/access、@/server/discovery/api | researchApiActor |
| /api/research/benchmarks/[id]/works/[workId]/media | GET | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/media/route.ts:1` | @content-center/db、@content-center/providers、@/server/api-access、@/server/research/api、@/server/research/access | researchApiActor |
| /api/research/benchmarks/[id]/works/[workId] | GET | `apps/web/app/api/research/benchmarks/[id]/works/[workId]/route.ts:1` | @/server/research/api、@/server/research/benchmark-dossier | researchApiActor |
| /api/research/benchmarks/import | POST | `apps/web/app/api/research/benchmarks/import/route.ts:1` | @/server/experience-account、@/server/api-access、@/server/research/api、@/server/research/benchmark-import | getApiWorkspaceContext |
| /api/research/creation | GET,POST | `apps/web/app/api/research/creation/route.ts:1` | zod、@content-center/db、@/server/research/api、@/server/research/read-model、@/server/research/legacy、@/server/research/sharing、@/server/artifacts/service、@/server/research/contracts | researchApiActor |
| /api/research/focus-v2 | POST | `apps/web/app/api/research/focus-v2/route.ts:1` | next/server、@/server/research/api、@/server/research/focus-v2-service、@/server/research/service | researchApiActor |
| /api/research/materials | GET | `apps/web/app/api/research/materials/route.ts:1` | @/server/research/api、@/server/research/service | researchApiActor |
| /api/research/news | GET,POST | `apps/web/app/api/research/news/route.ts:1` | next/server、@/server/research/api、@/server/research/news/service、@/server/research/news/transport | researchApiActor |
| /api/research/preferences | POST | `apps/web/app/api/research/preferences/route.ts:1` | @/server/research/api、@/server/research/preferences | researchApiActor |
| /api/research/results/[runId]/share | GET,POST | `apps/web/app/api/research/results/[runId]/share/route.ts:1` | zod、@/server/research/contracts、@/server/research/api、@/server/research/sharing、@/server/research/read-model | researchApiActor |
| /api/research/results/study/[studyId]/share | POST | `apps/web/app/api/research/results/study/[studyId]/share/route.ts:1` | zod、@/server/research/contracts、@/server/research/api、@/server/research/sharing | researchApiActor |
| /api/research/sessions/[id] | GET | `apps/web/app/api/research/sessions/[id]/route.ts:1` | @/server/research/api、@/server/research/service | researchApiActor |
| /api/research/sessions/[id]/runs/[runId] | GET,POST | `apps/web/app/api/research/sessions/[id]/runs/[runId]/route.ts:1` | @/server/research/api、@/server/research/service | researchApiActor |
| /api/research/sessions/[id]/runs | POST | `apps/web/app/api/research/sessions/[id]/runs/route.ts:1` | next/server、@/server/research/api、@/server/research/service | researchApiActor |
| /api/research/sessions | GET,POST | `apps/web/app/api/research/sessions/route.ts:1` | @/server/research/api、@/server/research/service | researchApiActor |
| /api/research/sources/[id]/clippings | POST | `apps/web/app/api/research/sources/[id]/clippings/route.ts:1` | @/server/research/api、@/server/research/service | researchApiActor |
| /api/research/sources/[id]/topic | POST | `apps/web/app/api/research/sources/[id]/topic/route.ts:1` | zod、@/server/research/api、@/server/research/access、@/server/research/read-model、@/server/discovery/service | researchApiActor |
| /api/research/teardown/[runId]/export | GET | `apps/web/app/api/research/teardown/[runId]/export/route.ts:1` | @/server/research/api、@/server/research/teardown/service | researchApiActor |
| /api/research/teardown/[runId]/history | DELETE | `apps/web/app/api/research/teardown/[runId]/history/route.ts:1` | @/server/research/api、@/server/research/teardown/service | researchApiActor |
| /api/research/teardown/[runId] | GET,DELETE,POST | `apps/web/app/api/research/teardown/[runId]/route.ts:1` | @/server/research/api、@/server/research/teardown/service | researchApiActor |
| /api/research/teardown | GET,POST | `apps/web/app/api/research/teardown/route.ts:1` | @/server/research/api、@/server/research/teardown/service | researchApiActor |
| /api/research/trends/[stableKey]/opportunity-v2 | POST | `apps/web/app/api/research/trends/[stableKey]/opportunity-v2/route.ts:1` | next/server、@/server/research/api、@/server/research/topic-opportunity-v2-service、@/server/research/service | researchApiActor |
| /api/research/trends/[stableKey]/related | POST | `apps/web/app/api/research/trends/[stableKey]/related/route.ts:1` | @/server/discovery/service、@/server/discovery/service、@/server/discovery/api、@content-center/providers、@/server/research/api、@/server/research/access、@/server/research/trends | researchApiActor |
| /api/search | GET | `apps/web/app/api/search/route.ts:1` | next/server、@content-center/db、@/server/api-access | getApiWorkspaceContext |
| /api/settings/diagnostics | GET | `apps/web/app/api/settings/diagnostics/route.ts:1` | @/server/api-access、@/server/settings-diagnostics | getApiWorkspaceContext |
| /api/settings/invitations | GET,POST,DELETE | `apps/web/app/api/settings/invitations/route.ts:1` | zod、@/server/account-api、@/server/api-access、@/server/account-delivery、@/server/account-security | getApiWorkspaceContext,accountApi |
| /api/settings/members/[id] | PATCH,DELETE | `apps/web/app/api/settings/members/[id]/route.ts:1` | @/server/api-access、@/server/account-api、@/server/account-space | getApiWorkspaceContext,accountApi |
| /api/settings/members | GET,POST | `apps/web/app/api/settings/members/route.ts:1` | @content-center/core、@content-center/db、@/server/api-access、@/server/account-api、@/server/account-space | getApiWorkspaceContext,accountApi |
| /api/settings/owner | POST | `apps/web/app/api/settings/owner/route.ts:1` | zod、@/server/account-api、@/server/api-access、@/server/account-space | getApiWorkspaceContext,accountApi |
| /api/settings/sessions | GET,DELETE | `apps/web/app/api/settings/sessions/route.ts:1` | next/headers、@content-center/db、zod、@/lib/auth、@/server/api-access、@/server/account-api、@/server/account-sessions | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |
| /api/settings/storage | GET,POST | `apps/web/app/api/settings/storage/route.ts:1` | @/server/local-directory-picker、@content-center/db、zod、@/server/api-access、@/server/account-api、@/server/local-storage | getApiWorkspaceContext |
| /api/settings/workspace | POST,PATCH | `apps/web/app/api/settings/workspace/route.ts:1` | @/server/experience-account、@content-center/db、next/headers、zod、@/lib/auth、@/server/api-access、@/server/account-api | getApiWorkspaceContext |
| /api/sidebar/folders/[folderId] | PATCH,DELETE | `apps/web/app/api/sidebar/folders/[folderId]/route.ts:1` | next/server、zod、@/server/api-access、@/server/sidebar/api、@/server/sidebar/service | getApiWorkspaceContext |
| /api/sidebar/folders | POST | `apps/web/app/api/sidebar/folders/route.ts:1` | next/server、zod、@/server/api-access、@/server/sidebar/api、@/server/sidebar/service | getApiWorkspaceContext |
| /api/sidebar/projects/[projectId]/opened | POST | `apps/web/app/api/sidebar/projects/[projectId]/opened/route.ts:1` | next/server、@/server/api-access、@/server/sidebar/api、@/server/sidebar/service | getApiWorkspaceContext |
| /api/sidebar/projects/[projectId]/preference | PATCH | `apps/web/app/api/sidebar/projects/[projectId]/preference/route.ts:1` | next/server、zod、@/server/api-access、@/server/sidebar/api、@/server/sidebar/service | getApiWorkspaceContext |
| /api/sidebar/projects | POST | `apps/web/app/api/sidebar/projects/route.ts:1` | zod、@/server/api-access、@/server/sidebar/basic-project | getApiWorkspaceContext |
| /api/sidebar | GET | `apps/web/app/api/sidebar/route.ts:1` | next/server、@/server/api-access、@/server/sidebar/service | getApiWorkspaceContext |
| /api/source-items/[id]/assets/[assetId]/access | GET | `apps/web/app/api/source-items/[id]/assets/[assetId]/access/route.ts:1` | @content-center/db、@content-center/providers、next/server、@/server/api-access、@content-center/worker/video-preview | getApiWorkspaceContext |
| /api/source-items/[id]/assets/[assetId]/preview | GET | `apps/web/app/api/source-items/[id]/assets/[assetId]/preview/route.ts:1` | @content-center/db、@content-center/providers、@/server/api-access | getApiWorkspaceContext |
| /api/source-items/[id]/collections | POST,DELETE | `apps/web/app/api/source-items/[id]/collections/route.ts:1` | @content-center/db、next/server、zod、@/server/api-access | getApiWorkspaceContext |
| /api/source-items/[id]/distillation | GET,POST | `apps/web/app/api/source-items/[id]/distillation/route.ts:1` | next/server、@/server/api-access、@/server/material-distillation/service | getApiWorkspaceContext |
| /api/source-items/[id]/knowledge/candidates/[candidateId] | PATCH | `apps/web/app/api/source-items/[id]/knowledge/candidates/[candidateId]/route.ts:1` | zod、@/server/api-access、@/server/material-knowledge/api、@/server/material-knowledge/service | getApiWorkspaceContext |
| /api/source-items/[id]/knowledge | GET,POST | `apps/web/app/api/source-items/[id]/knowledge/route.ts:1` | @/server/api-access、@/server/material-knowledge/api、@/server/material-knowledge/service | getApiWorkspaceContext |
| /api/source-items/[id]/material-analysis/[analysisId] | PUT | `apps/web/app/api/source-items/[id]/material-analysis/[analysisId]/route.ts:1` | next/server、@/server/api-access、@/server/material-analysis/api、@/server/material-analysis/service | getApiWorkspaceContext |
| /api/source-items/[id]/material-analysis/project | POST | `apps/web/app/api/source-items/[id]/material-analysis/project/route.ts:1` | next/server、@/server/api-access、@/server/material-analysis/api、@/server/material-analysis/service | getApiWorkspaceContext |
| /api/source-items/[id]/material-analysis | GET,POST | `apps/web/app/api/source-items/[id]/material-analysis/route.ts:1` | next/server、@/server/api-access、@/server/material-analysis/api、@/server/material-analysis/service | getApiWorkspaceContext |
| /api/source-items/[id]/metadata/refresh | POST | `apps/web/app/api/source-items/[id]/metadata/refresh/route.ts:1` | next/server、@content-center/providers、@/server/api-access | getApiWorkspaceContext |
| /api/source-items/[id]/processing | GET | `apps/web/app/api/source-items/[id]/processing/route.ts:1` | @content-center/worker/job-recovery、@content-center/db、next/server、@/server/api-access、@/server/material-detail/understanding、@/lib/source-processing-state | getApiWorkspaceContext |
| /api/source-items/[id] | GET,PATCH,DELETE | `apps/web/app/api/source-items/[id]/route.ts:1` | @content-center/integrations、@content-center/db、next/server、zod、@/server/api-access、@content-center/providers | getApiWorkspaceContext |
| /api/source-items/[id]/tags | POST,DELETE | `apps/web/app/api/source-items/[id]/tags/route.ts:1` | @content-center/db、next/server、zod、@/server/api-access | getApiWorkspaceContext |
| /api/source-items/[id]/transcribe | POST | `apps/web/app/api/source-items/[id]/transcribe/route.ts:1` | @content-center/db、@content-center/providers、@content-center/worker/transcription、next/server、@/server/api-access | getApiWorkspaceContext |
| /api/source-items/[id]/transcript | PUT | `apps/web/app/api/source-items/[id]/transcript/route.ts:1` | @content-center/db、next/server、zod、@/server/api-access | getApiWorkspaceContext |
| /api/source-items/[id]/understanding | POST | `apps/web/app/api/source-items/[id]/understanding/route.ts:1` | next/server、@/server/api-access、@/server/material-detail/understanding | getApiWorkspaceContext |
| /api/source-items | GET,POST | `apps/web/app/api/source-items/route.ts:1` | @content-center/core、@content-center/db、next/server、zod、@/server/api-access、@/server/library、@/server/source-service、@content-center/providers | getApiWorkspaceContext |
| /api/source-items/upload | POST | `apps/web/app/api/source-items/upload/route.ts:1` | @content-center/worker/experience-limits、@content-center/db、@content-center/providers、next/server、@/server/api-access、@/server/source-upload | getApiWorkspaceContext |
| /api/system/health/queue | POST | `apps/web/app/api/system/health/queue/route.ts:1` | @content-center/worker/queue、next/headers、next/server、@/lib/auth | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |
| /api/tags | GET,POST | `apps/web/app/api/tags/route.ts:1` | @content-center/core、@content-center/db、next/server、zod、@/server/api-access | getApiWorkspaceContext |
| /api/video-data | GET,POST | `apps/web/app/api/video-data/route.ts:1` | @/server/api-access、@/server/video-operations/service、@/server/video-operations/policy | getApiWorkspaceContext |
| /api/voice-input | GET,POST | `apps/web/app/api/voice-input/route.ts:1` | node:fs/promises、node:os、node:path、next/server、@content-center/db、@content-center/providers、@content-center/worker/transcription、@content-center/worker/job-recovery、@content-center/worker/experience-limits、@/server/api-access、@/server/source-upload | getApiWorkspaceContext |
| /api/workspaces/[workspaceId] | GET | `apps/web/app/api/workspaces/[workspaceId]/route.ts:1` | @content-center/db、next/headers、next/server、@/lib/auth | 见导入的 API 包装器/特殊入口；不能据空值判无权限 |

## 数据模型索引

| 模型 | Schema 位置 |
| --- | --- |
| User | `packages/db/prisma/schema.prisma:405` |
| Session | `packages/db/prisma/schema.prisma:476` |
| Account | `packages/db/prisma/schema.prisma:491` |
| Verification | `packages/db/prisma/schema.prisma:512` |
| Workspace | `packages/db/prisma/schema.prisma:523` |
| WorkspaceMember | `packages/db/prisma/schema.prisma:596` |
| IntegrationConfig | `packages/db/prisma/schema.prisma:611` |
| AuditLog | `packages/db/prisma/schema.prisma:628` |
| SourceItem | `packages/db/prisma/schema.prisma:644` |
| SourceUnderstanding | `packages/db/prisma/schema.prisma:696` |
| SourceAsset | `packages/db/prisma/schema.prisma:718` |
| ApiUsage | `packages/db/prisma/schema.prisma:742` |
| IngestJob | `packages/db/prisma/schema.prisma:765` |
| Transcript | `packages/db/prisma/schema.prisma:793` |
| ContentTag | `packages/db/prisma/schema.prisma:813` |
| SourceItemTag | `packages/db/prisma/schema.prisma:827` |
| Collection | `packages/db/prisma/schema.prisma:838` |
| CollectionItem | `packages/db/prisma/schema.prisma:854` |
| ContentProject | `packages/db/prisma/schema.prisma:865` |
| ProjectFolder | `packages/db/prisma/schema.prisma:921` |
| UserProjectPreference | `packages/db/prisma/schema.prisma:937` |
| DraftBranch | `packages/db/prisma/schema.prisma:959` |
| DraftRevision | `packages/db/prisma/schema.prisma:997` |
| CanvasObject | `packages/db/prisma/schema.prisma:1026` |
| CanvasObjectSnapshot | `packages/db/prisma/schema.prisma:1067` |
| CanvasRelation | `packages/db/prisma/schema.prisma:1093` |
| CanvasMaterialReference | `packages/db/prisma/schema.prisma:1117` |
| BenchmarkAccount | `packages/db/prisma/schema.prisma:1141` |
| BenchmarkContentSnapshot | `packages/db/prisma/schema.prisma:1171` |
| BenchmarkComment | `packages/db/prisma/schema.prisma:1196` |
| BenchmarkMetricObservation | `packages/db/prisma/schema.prisma:1211` |
| BenchmarkCollectionRun | `packages/db/prisma/schema.prisma:1225` |
| BenchmarkCollectionRunItem | `packages/db/prisma/schema.prisma:1256` |
| BenchmarkStudy | `packages/db/prisma/schema.prisma:1275` |
| BenchmarkStudySample | `packages/db/prisma/schema.prisma:1308` |
| ContentIdea | `packages/db/prisma/schema.prisma:1326` |
| ContentIdeaReference | `packages/db/prisma/schema.prisma:1350` |
| TrendSnapshot | `packages/db/prisma/schema.prisma:1373` |
| ResearchObjectPreference | `packages/db/prisma/schema.prisma:1395` |
| RecommendationBatch | `packages/db/prisma/schema.prisma:1418` |
| RecommendationItem | `packages/db/prisma/schema.prisma:1437` |
| RecommendationEvidence | `packages/db/prisma/schema.prisma:1469` |
| ProjectSource | `packages/db/prisma/schema.prisma:1484` |
| MaterialAnalysis | `packages/db/prisma/schema.prisma:1499` |
| MaterialDistillation | `packages/db/prisma/schema.prisma:1537` |
| MethodAsset | `packages/db/prisma/schema.prisma:1565` |
| MethodSuggestion | `packages/db/prisma/schema.prisma:1583` |
| MethodVersion | `packages/db/prisma/schema.prisma:1619` |
| ProjectMethodSelection | `packages/db/prisma/schema.prisma:1658` |
| MethodUsage | `packages/db/prisma/schema.prisma:1676` |
| EvidenceItem | `packages/db/prisma/schema.prisma:1696` |
| CreativeBrief | `packages/db/prisma/schema.prisma:1735` |
| MotherContent | `packages/db/prisma/schema.prisma:1762` |
| CreationFeedback | `packages/db/prisma/schema.prisma:1787` |
| MethodUsageFeedback | `packages/db/prisma/schema.prisma:1811` |
| CreatorProfile | `packages/db/prisma/schema.prisma:1831` |
| CreatorProfileSuggestion | `packages/db/prisma/schema.prisma:1865` |
| DeepContentPackage | `packages/db/prisma/schema.prisma:1894` |
| PromptTemplate | `packages/db/prisma/schema.prisma:1924` |
| PlatformTemplate | `packages/db/prisma/schema.prisma:1943` |
| PlatformVariant | `packages/db/prisma/schema.prisma:1962` |
| ReviewRecord | `packages/db/prisma/schema.prisma:1995` |
| PublishTask | `packages/db/prisma/schema.prisma:2020` |
| AIRun | `packages/db/prisma/schema.prisma:2051` |
| AssistantThread | `packages/db/prisma/schema.prisma:2101` |
| AssistantMessage | `packages/db/prisma/schema.prisma:2121` |
| Artifact | `packages/db/prisma/schema.prisma:2142` |
| CanvasGenerateRun | `packages/db/prisma/schema.prisma:2175` |
| UnifiedCreativeAnalysis | `packages/db/prisma/schema.prisma:2203` |
| ResearchSession | `packages/db/prisma/schema.prisma:2237` |
| ResearchRun | `packages/db/prisma/schema.prisma:2257` |
| WorkspaceContentPolicy | `packages/db/prisma/schema.prisma:2295` |
| ContentTopic | `packages/db/prisma/schema.prisma:2303` |
| ContentTopicVersion | `packages/db/prisma/schema.prisma:2319` |
| ContentTopicDecision | `packages/db/prisma/schema.prisma:2333` |
| KnowledgeEntry | `packages/db/prisma/schema.prisma:2344` |
| FactRecord | `packages/db/prisma/schema.prisma:2364` |
| FactConfirmation | `packages/db/prisma/schema.prisma:2379` |
| FactApproval | `packages/db/prisma/schema.prisma:2391` |
| IPContextVersion | `packages/db/prisma/schema.prisma:2402` |
| VideoAccount | `packages/db/prisma/schema.prisma:2419` |
| VideoDailyMetric | `packages/db/prisma/schema.prisma:2436` |
| VideoContent | `packages/db/prisma/schema.prisma:2462` |
| VideoTask | `packages/db/prisma/schema.prisma:2480` |
| FeishuConnection | `packages/db/prisma/schema.prisma:2503` |
| FeishuDocument | `packages/db/prisma/schema.prisma:2524` |
| FeishuChunk | `packages/db/prisma/schema.prisma:2551` |
| FeishuSubscription | `packages/db/prisma/schema.prisma:2565` |
| FeishuSubscriptionNode | `packages/db/prisma/schema.prisma:2592` |

## 测试与验证边界

仓库存在与 Artifact、creation-agent、research-project-handoff、teardown-chain、workspace、scope、storage、转录恢复相关的测试；本轮仅查看定义。未运行当前测试，无“通过率”。建议后续按模块 V1/V2 验证，正式收口才 V3。直接相关用例可见：

- apps/web/tests/artifacts.test.ts：手工修订、重开、旧版本与跨项目拒绝。
- apps/web/tests/creation-agent.test.ts：局部编辑、锁定、恢复、同版本并发、token-limit、跨空间资料。
- apps/web/tests/research-project-handoff.test.ts：原子创建/分享、并发重试、权限及持续引用。
- apps/web/tests/teardown-chain.test.ts、apps/worker/src/teardown/worker.test.ts：拆解 API 与后台阶段。
- apps/worker/src/transcription*.test.ts、job-recovery*.test.ts：转录和恢复。

## 工作树边界

原有工作树状态仅用来说明审计快照不等于 HEAD；未改变上述文件。新增六份文档应单独审核，不带入原有业务改动。没有 git add/commit/push、分支操作或 migration deploy。


## 静态路由和接口使用核查补充

对app/components的静态href、href对象与router.push/replace文本扫描得到233个字面路径片段。3个未匹配是 `/research/session/`、`/research/results/run/` 后拼接ID的动态链接，不是失效路由；其余匹配已有页面/接口模式。未发现该有限扫描范围中的确定失效链接；动态模板、条件redirect、查询参数上下文、部署rewrite和运行权限仍需验收。没有把只含链接的兼容page认成独立业务。

对生产TS/TSX/MJS中的引号/模板API URL标准化动态ID后，196条API中155条有字面调用匹配，41条未匹配（下表）。**这41条不是确认未使用接口**：变量拼URL、服务端直接调用Service、health/签名/外部接口、框架转发均会漏匹配，测试调用也不算生产消费。旧页面redirect不自动证明相关API没人用，删除前需调用日志和契约审核。

| API模式 | 位置 | 影响范围/证据限制 | 建议 |
| --- | --- | --- | --- |
| /api/account/invitation | `apps/web/app/api/account/invitation/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/account/recovery | `apps/web/app/api/account/recovery/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/admin/system/providers/* | `apps/web/app/api/admin/system/providers/[provider]/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/admin/system | `apps/web/app/api/admin/system/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/admin/usage | `apps/web/app/api/admin/usage/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/auth/* | `apps/web/app/api/auth/[...all]/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/dev/runtime-health | `apps/web/app/api/dev/runtime-health/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/discovery/benchmarks/*/comments/analyze | `apps/web/app/api/discovery/benchmarks/[id]/comments/analyze/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/discovery/benchmarks/*/comments/collect | `apps/web/app/api/discovery/benchmarks/[id]/comments/collect/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/discovery/benchmarks/*/inputs | `apps/web/app/api/discovery/benchmarks/[id]/inputs/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/discovery/benchmarks/*/organization | `apps/web/app/api/discovery/benchmarks/[id]/organization/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/discovery/benchmarks/*/report | `apps/web/app/api/discovery/benchmarks/[id]/report/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/health/live | `apps/web/app/api/health/live/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/ingest-jobs/*/cancel | `apps/web/app/api/ingest-jobs/[id]/cancel/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/integrations | `apps/web/app/api/integrations/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/internal/media-storage/* | `apps/web/app/api/internal/media-storage/[assetId]/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/local-asr/status | `apps/web/app/api/local-asr/status/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/media/* | `apps/web/app/api/media/[token]/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/mother-content/confirm | `apps/web/app/api/projects/[id]/mother-content/confirm/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/mother-content/confirmation | `apps/web/app/api/projects/[id]/mother-content/confirmation/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/mother-content | `apps/web/app/api/projects/[id]/mother-content/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/platform-variants/*/review/ai | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/ai/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/platform-variants/*/review/approve | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/approve/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/platform-variants/*/review/reject | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/reject/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/platform-variants/*/review/request-changes | `apps/web/app/api/projects/[id]/platform-variants/[platform]/review/request-changes/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/platform-variants/*/reviews | `apps/web/app/api/projects/[id]/platform-variants/[platform]/reviews/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/projects/*/platform-variants | `apps/web/app/api/projects/[id]/platform-variants/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/publish-tasks/*/cancel | `apps/web/app/api/publish-tasks/[id]/cancel/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/publish-tasks/*/failed | `apps/web/app/api/publish-tasks/[id]/failed/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/publish-tasks/*/package | `apps/web/app/api/publish-tasks/[id]/package/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/publish-tasks/*/published | `apps/web/app/api/publish-tasks/[id]/published/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/publish-tasks/* | `apps/web/app/api/publish-tasks/[id]/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/publish-tasks/*/schedule | `apps/web/app/api/publish-tasks/[id]/schedule/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/research/benchmarks/*/sync | `apps/web/app/api/research/benchmarks/[id]/sync/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/research/sessions/* | `apps/web/app/api/research/sessions/[id]/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/research/sources/*/clippings | `apps/web/app/api/research/sources/[id]/clippings/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/research/sources/*/topic | `apps/web/app/api/research/sources/[id]/topic/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/source-items/*/distillation | `apps/web/app/api/source-items/[id]/distillation/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/source-items/*/material-analysis/* | `apps/web/app/api/source-items/[id]/material-analysis/[analysisId]/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/system/health/queue | `apps/web/app/api/system/health/queue/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |
| /api/workspaces/* | `apps/web/app/api/workspaces/[workspaceId]/route.ts:1` | VERIFY：无标准字面量匹配，变量URL/外部调用/框架/服务端读取未消除 | 查真实调用与公开契约；当前不删接口 |

## 配置、运行策略与前后端边界补充

- runtime-env.mjs、local-profile/local-release及docker-compose.*.yml区分LOCAL_REAL/LOCAL_TEST与embedded/standalone依赖；真实密钥与用户数据本轮未读取。配置样例的存在不能证明安装/启用/授权成功。
- packages/providers有真实LLM/RedFox/Doubao/LocalASR/Storage适配及Mock实现；llm-runtime.ts:54在MOCK_MODE=true且未正常配置的分支可用Mock。推荐DETERMINISTIC是基于真实候选的规则建议，不能将其同模拟数据混淆。
- services/local-asr/server.py:21限制监听loopback，使用本机模型和有界推理；没有读取实际模型文件或调用ASR health，因此当前硬件/模型可用性未验证。
- 浏览器若import type服务DTO会擦除；content-hub/video-analytics导入的policy函数/常量属于纯计算。不能只凭路径中server就认定Prisma泄露到前端。关键contract已有lib/contracts；scripts/check-client-boundaries.mjs提供bundle边界校验，但本轮未运行（V0）。
- package依赖Web→core/db/integrations/providers/ui/worker，Worker→config/core/db/integrations/providers；有意embedded执行导致A15耦合。A27是API目录依赖UI位置中的纯工具，不是已确认安全漏洞。
- 共发现311个JS/TS测试定义文件（web单元170、web E2E56、Worker21、共享包与scripts其余64）；Python ASR benchmark/测试和QA历史另见结构树。测试数量不等于用例总数、覆盖率或当前通过数。

## 审计完成与待验内容

共登记27项问题/风险/VERIFY候选；详情给出源码位置、影响半径及建议。全文完整文件复制扫描0组（>400字符口径）；13个无生产挂载UI候选1045行，33处同一JSON辅助片段，不可据此承诺大比例删代码。纯目标占位与真实能力组严格分开统计，详见矩阵。

交付仅六个V4文档。停止业务施工、迁移、删除和Git提交。动态可用性、实际使用频率、运行授权范围、外部API真实成功、数据量、部署Schema一致性、恢复质量、全系统安全通过均未做结论，留待审核后阶段化验收。
