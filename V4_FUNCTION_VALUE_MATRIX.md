# V4.0 功能价值矩阵

审计日期：2026-10-10（Asia/Singapore）。对象：当前工作树，HEAD `242f7b911e369d4c93d0deccc02ee368cfd90137`。这不是 Governance Update，不改变 PRODUCT.md / ARCHITECTURE.md / LEGACY.md / AGENTS.md。

验证等级 **V0**：仅读取代码、配置样例、Schema、路由、测试定义及 Git 状态。未启动服务、未调用外部 Provider、未执行测试/typecheck/build、未查询或修改数据库，未运行 migration。存在大量既有未提交修改和未跟踪新模块，本轮包含它们，但不把历史 QA 报告视为当前通过结果。

证据强度：**确定**=代码直接可见；**风险**=存在条件性失败路径，未复现；**VERIFY**=静态扫描候选。矩阵“已完整实现”仅指所列狭义能力具备代码闭环，**不代表当前环境 API 调用成功或上线可用**。外部数据、模型、转录、队列、邮件等仍需配置和运行验收。

## 计数与评分方法

按“可独立解释价值、输入、输出和保存边界的能力组”计数；不是按钮数、页面数、API数或未来对象数。92组当前范围包括基础设施、契约桩和UI，4组纯目标为F70/F73/F93/F96。页面复用和 redirect 不重复计为业务域，兼容行为另列为能力组。每个能力组覆盖相邻 CRUD 或同一工作流操作；完整82页面/196API的对应源码索引见 V4_CODE_ARCHITECTURE_AUDIT.md。矩阵覆盖当前导航外的旧口播、GPT导入、默认方法、深度内容包、旧推荐、内容审批、飞书订阅、节点助手与后台恢复。

四维评分均为1–5：V=核心业务价值，F=使用频率，N=链路必要性，C=实现维护成本（越高成本越高）。**总分 = (40V + 25F + 25N + 10(6−C)) / 5**，范围20–100。无用户分析/遥测数据，F为基于场景的估计，需审核；成本同样是代码复杂度估计，不是工时。P0/P1/P2/P3综合权威方向和依赖，不机械按分数删功能。高价值FUTURE可能为P3“本阶段暂缓”，不意味着不重要。

功能状态按用户指定五类输出。为避免混淆：

- 已完整实现：狭义代码闭环存在，当前运行成功未验证。
- 部分实现：配置外部依赖/多个分支缺口/尚未形成完整目标行为。
- 仅有前端 UI：指该行声称的真实能力没有对应后端链路；同页面其他能力可完整。
- 已实现但未接入：旧能力有服务而当前主UI无挂载；接口桩或目标能力统一标不可用，不伪装为已实现后端。
- 已废弃或不可用：本轮无完整可运行实现，或未来规划，保留具体原因；不是删除决定。

“合并”为入口或编排收敛，**不等于合并数据库表**；“降级”为二级/上下文/高级入口；“暂缓”为保留现有代码和规划、暂缓新的施工。核心价值通过V和场景表达。

| ID | 模块 | 子功能 | 页面路径/入口 | 相关代码与位置 | 对应API（路径组） | 数据来源 | 功能状态 | V/F/N/C → 总分 | 优先级 | 使用场景 | 处理建议类别 | 具体建议 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | 入口 | 首页找到工作与最近工作 | /home | `apps/web/app/(app)/home/page.tsx:4` | —（演示分支） | createVideoDemo | 部分实现 | 5/5/5/2 → 98 | P0 | 回到持续项目 | 保留 | A01：恢复 Home 定位，运营看板迁出默认首页 |
| F02 | 入口 | 快速开始/附资料/模型/Skill | /dashboard | `apps/web/components/home-composer.tsx:26` | /api/projects；/api/creation/sources；/api/creation/models | ContentProject/ProjectSource/MethodVersion | 部分实现 | 5/5/5/3 → 96 | P0 | 新任务开始 | 保留 | A03/A16：复用创建编排，统一多 Skill |
| F03 | 项目 | 基础创建（侧栏） | 侧栏新建 | `apps/web/server/sidebar/basic-project.ts:13` | /api/sidebar/projects | ContentProject/DraftBranch | 已完整实现 | 5/5/5/2 → 98 | P0 | 建立长期工作容器 | 保留 | 复核事务内成员停用状态；保留简洁创建 |
| F04 | 项目 | 列表/筛选/归档恢复 | /projects | `apps/web/server/project-service.ts:49` | /api/projects；/api/projects/[id]/restore | ContentProject | 已完整实现 | 5/5/5/2 → 98 | P0 | 找回现有工作 | 保留 | 不以最近列表替代完整项目管理 |
| F05 | 项目 | 文件夹/置顶/排序/最近打开 | 侧栏与 /projects | `apps/web/server/sidebar/service.ts:153` | /api/sidebar/folders；/api/sidebar/projects/[projectId]/preference；opened | ProjectFolder/UserProjectPreference | 已完整实现 | 4/5/4/2 → 85 | P1 | 组织与返回工作 | 保留 | 共享 view-model，保留最近项目快捷入口 |
| F06 | 项目 | 详情/Studio 路由兼容 | /projects/[id]；/projects/[id]/studio | `apps/web/app/(app)/projects/[id]/studio/page.tsx:3` | 跳转 dashboard | ContentProject | 已完整实现 | 2/2/3/1 → 51 | P2 | 旧收藏链接 | 降级 | LEGACY COMPATIBILITY：保留 redirect，退出主导航 |
| F07 | 项目 | 目标/描述/Brief 补充 | /dashboard?project= | `apps/web/server/brief-service.ts:30` | /api/projects/[id]/brief | CreativeBrief/ContentProject | 已完整实现 | 4/4/4/2 → 80 | P1 | 表达任务与已有事实 | 保留 | 保留项目任务信息；固定文稿字段后续弱化 |
| F08 | 项目 | 项目资料绑定/移除 | 项目工作区 | `apps/web/server/project-service.ts:49` | /api/projects/[id]/sources | ProjectSource/SourceItem | 已完整实现 | 5/5/5/2 → 98 | P0 | 保持资料关联 | 保留 | 同 Workspace 校验、已归档来源提示 |
| F09 | 对话 | 流式生成/停止/重试 | 项目工作区 | `apps/web/server/assistant/service.ts:212` | /api/projects/[id]/assistant | AssistantThread/Message/AIRun | 已完整实现 | 5/5/5/3 → 96 | P0 | AI 持续协作 | 保留 | 保留生成终态与部分文本；A02 改 scope |
| F10 | 对话 | 任务锚点/多轮约束 | 项目工作区 | `apps/web/server/assistant/task-state.ts:6` | assistant 同上 | 用户消息 metadata.taskState | 已完整实现 | 5/5/5/3 → 96 | P0 | 后续修改不丢需求 | 保留 | 关键词识别需语义负例，保留原始任务 |
| F11 | 对话 | 重开历史与记忆召回 | 项目工作区 | `apps/web/server/assistant/memory.ts:11` | assistant GET | AssistantMessage/召回缓存 | 部分实现 | 5/5/5/3 → 96 | P0 | 长项目继续工作 | 保留 | A25：最近80条加分页；缓存不得作数据权威 |
| F12 | 对话 | @资料/研究/成果引用 | 项目工作区 | `apps/web/server/assistant/references.ts:22` | /api/projects/[id]/assistant/references | SourceItem/ResearchRun/Artifact | 已完整实现 | 5/5/5/3 → 96 | P0 | 将上下文交给 Agent | 保留 | A06：区分逐轮与持续引用并显示版本 |
| F13 | 对话 | 网页搜索与媒体链接采集 | 项目工作区 | `apps/web/server/assistant/web-search.ts:8` | assistant 编排；source/ingest API | 搜索证据/SourceItem/Transcript | 部分实现 | 4/4/4/4 → 76 | P1 | 查资料后继续生成 | 保留 | 外部依赖实测；保留权限重查和搜索来源 |
| F14 | 对话 | 创作控制与局部修改 | 项目工作区 | `apps/web/server/assistant/creation-policy.ts:3` | assistant POST | creationOptions/editScope | 已完整实现 | 5/5/5/3 → 96 | P0 | 精简/改段落/表达调整 | 保留 | expectedVersion + 原段落边界测试 |
| F15 | 对话 | 检查卡片/候选行动 | 项目工作区 | `apps/web/server/assistant/service.ts:212` | assistant + messages/[messageId]/save | structuredResult/ContentIdea | 部分实现 | 4/3/4/3 → 73 | P1 | 检查内容或保存选题 | 保留 | A24：标明候选；不能代替事实确认 |
| F16 | 对话 | 节点级 Assistant | Canvas 对象 | `apps/web/app/api/projects/[id]/canvas/objects/[objectId]/assistant/route.ts:9` | /api/projects/[id]/canvas/objects/[objectId]/assistant | CanvasObject/AssistantThread | 已完整实现 | 3/2/2/4 → 48 | P2 | 高级局部上下文 | 降级 | 保留高级能力，默认 Conversation 独立 |
| F17 | 成果 | 对话保存文本成果 | 项目成果窗 | `apps/web/server/artifacts/service.ts:66` | /api/projects/[id]/artifacts | Artifact/DraftBranch/DraftRevision | 已完整实现 | 5/5/5/2 → 98 | P0 | 持久化输出 | 保留 | 现有事务与消息幂等复用 |
| F18 | 成果 | 手动编辑与 AI 应用修订 | 项目成果窗 | `apps/web/server/artifacts/service.ts:66` | artifacts/[artifactId]；revisions | Artifact + expectedVersion | 已完整实现 | 5/5/5/3 → 96 | P0 | 连续改稿 | 保留 | 同版本并发拒绝，保留编辑内容 |
| F19 | 成果 | 重开/历史/恢复/锁定 | 项目成果窗 | `apps/web/components/projects/use-artifact-editor.tsx:31` | artifacts/[artifactId]/history；PATCH | DraftRevision/confirmedRevisionId | 已完整实现 | 5/5/5/3 → 96 | P0 | 回滚内容/继续工作 | 保留 | 历史恢复追加新版本；A25 分页 |
| F20 | 成果 | 导出 Markdown/文本 | 项目成果窗 | `apps/web/components/projects/use-artifact-editor.tsx:31` | 读取 Artifact 后浏览器导出 | 已保存 Artifact 内容 | 已完整实现 | 4/4/4/1 → 82 | P1 | 外部使用 | 保留 | 准确提示导出已保存版本 |
| F21 | 旧创作 | 母稿生成/应用/确认 | 项目工作区 | `apps/web/server/mother-content-service.ts:36` | mother-content；ai/run；ai/runs/[runId]/apply | MotherContent/AIRun | 已完整实现 | 3/3/3/4 → 58 | P2 | 兼容旧口播任务 | 降级 | LEGACY_COMPAT：不删数据、不扩张为新中心 |
| F22 | 旧创作 | 稿件分支/主稿/checkpoint | 项目工作区 | `apps/web/server/drafts/service.ts:190` | /api/projects/[id]/drafts/** | DraftBranch/DraftRevision/MotherContent投影 | 已完整实现 | 4/4/5/3 → 83 | P1 | 旧主稿与版本复用 | 保留 | 存储能力供 Artifact 复用，减少双写面 |
| F23 | 旧创作 | Canvas 自由文本/连线/快照 | 项目工作区 | `apps/web/server/canvas/service.ts:119` | /api/projects/[id]/canvas/objects/** | CanvasObject/Snapshot/Relation | 已完整实现 | 3/2/2/5 → 46 | P2 | 高级可视组织 | 降级 | VERIFY：作为高级视图，默认不依赖它 |
| F24 | 旧创作 | 深度内容包 | 旧高级入口 | `apps/web/server/deep-content/service.ts:17` | deep-content-package；generate；apply | DeepContentPackage/AIRun | 已实现但未接入（旧独立UI无生产导入候选） | 2/1/2/4 → 35 | P3 | 深度创作准备 | 暂缓 | 旧独立 UI 无生产导入候选；API保留，先证明使用 |
| F25 | 旧创作 | GPT任务包/复制/导入稿 | 项目兼容流程 | `apps/web/server/mother-content-service.ts:36` | gpt-task-package；copied；import-gpt-draft | 项目上下文/母稿/GPT_WEB | 部分实现 | 3/2/2/3 → 50 | P2 | 外部模型手动创作 | 降级 | 有真实接口；人工复制链降为外部交换 |
| F26 | 旧创作 | 平台适配生成/编辑 | 项目平台窗 | `apps/web/server/platforms/platform-variant-service.ts:41` | /api/projects/[id]/platform-variants/** | PlatformVariant/MotherContent | 已完整实现 | 4/3/4/3 → 73 | P1 | 旧多平台稿 | 保留 | 保留已用能力；A07 未来 Artifact 适配 |
| F27 | 旧创作 | 创作反馈/方法使用反馈 | 项目工作区 | `apps/web/server/creation-feedback/service.ts:114` | /api/projects/[id]/feedback | CreationFeedback/MethodUsageFeedback | 部分实现 | 3/2/3/3 → 55 | P2 | 记录创作效果与方法经验 | 合并 | 归项目历史；目前依赖母稿而非通用成果 |
| F28 | 资料 | URL收录/粘贴文本 | /library | `apps/web/server/source-service.ts:44` | /api/source-items | SourceItem/IngestJob | 已完整实现 | 5/5/5/2 → 98 | P0 | 原始输入 | 保留 | 保持输入读取与研究分工 |
| F29 | 资料 | 上传文件/图片/音视频/PDF | /library；composer | `apps/web/server/source-upload.ts:74` | /api/source-items/upload | SourceAsset/SourceItem/Storage | 部分实现 | 5/5/5/4 → 94 | P0 | 本地资料供给 | 保留 | 不同类型解析和Provider配置要单独实测 |
| F30 | 资料 | 采集队列/重试/取消/进度 | 资料列表与详情 | `apps/web/server/source-service.ts:44` | /api/ingest-jobs/[id]/**；source-items/[id]/processing | IngestJob/BullMQ/Redis | 已完整实现 | 5/4/5/3 → 91 | P0 | 异步输入恢复 | 保留 | 保留DB任务记录与队列补偿 |
| F31 | 资料 | 原文/转录/机器识别统一读取 | /library/[id] | `apps/web/server/material-detail/readable-content.ts:8` | source-items/[id]/transcript；understanding | rawText/Transcript/SourceUnderstanding | 已完整实现 | 5/5/5/3 → 96 | P0 | 真实正文进入上下文 | 保留 | 读取优先级、来源版本和标记是核心 |
| F32 | 资料 | 转录/分块/云与本地ASR | 资料详情 | `apps/web/server/local-asr.ts:57` | source-items/[id]/transcribe；local-asr/status | Transcript/分块任务/Doubao/local-asr | 部分实现 | 5/4/5/5 → 87 | P0 | 视频音频转文字 | 保留 | 外部请求、模型文件、FFmpeg配置运行待验 |
| F33 | 资料 | 资源预览/下载/签名URL | 资料详情 | `apps/web/server/material-detail/read-model.ts:118` | source-items/[id]/assets/[assetId]/**；media/[token] | SourceAsset/Storage | 已完整实现 | 5/4/5/3 → 91 | P0 | 查看与复用附件 | 保留 | 保留签名用途、路径与权限校验 |
| F34 | 资料 | 标签/集合/过滤/元数据刷新 | /library | `apps/web/server/library.ts:22` | /api/tags；source-items/[id]/tags；collections；metadata/refresh | ContentTag/Collection/SourceItem | 已完整实现 | 4/4/4/2 → 80 | P1 | 找回资料 | 保留 | 复用现有搜索，避免第二份资料索引 |
| F35 | 资料 | 素材理解 MaterialAnalysis | 资料详情 | `apps/web/server/material-analysis/service.ts:59` | source-items/[id]/material-analysis/** | MaterialAnalysis/AIRun/worker | 已完整实现 | 4/3/3/4 → 66 | P2 | 理解材料 | 合并 | 并入Research模式；不是删除读取结果 |
| F36 | 资料 | 内容提炼 MaterialDistillation | 资料详情 | `apps/web/server/material-distillation/service.ts:56` | source-items/[id]/distillation | MaterialDistillation/AIRun | 已完整实现 | 3/3/3/4 → 58 | P2 | 方法与观点提炼 | 合并 | Research承接主动提炼，保留版本追溯 |
| F37 | 资料 | 知识候选抽取/确认拒绝 | 资料详情 | `apps/web/server/material-knowledge/service.ts:29` | source-items/[id]/knowledge/** | EvidenceItem | 已完整实现 | 4/3/4/3 → 73 | P1 | 从资料形成证据候选 | 合并 | 并入知识证据工作流；不要与KnowledgeEntry假定同表 |
| F38 | 知识 | 知识条目创建/修订/保密/归档 | /knowledge | `apps/web/server/content-governance/service.ts:25` | /api/content-hub（knowledge.*） | KnowledgeEntry/Source快照 | 已完整实现 | 4/3/4/3 → 73 | P1 | 团队审核知识 | 合并 | 资料下的知识视图，保留来源和保密边界 |
| F39 | 知识 | 事实创建/双身份确认/有效期 | /knowledge/facts | `apps/web/server/content-governance/service.ts:25` | /api/content-hub（fact.*） | FactRecord/Confirmation/Approval | 已完整实现 | 5/4/5/4 → 89 | P0 | 个人事实和业务声明 | 保留 | 服务端确认不可用Prompt替代；A05补通用上下文 |
| F40 | 知识 | 通用 KNOWLEDGE 上下文检索 | 项目引用 | `apps/web/server/assistant/references.ts:22` | assistant 引用 | KnowledgeContextAdapter unsupported | 已废弃或不可用（当前为unsupported桩，待接入） | 5/4/5/3 → 91 | P0 | 跨知识库引用 | 保留 | A04：接口桩未实现；复用现有读取能力补接 |
| F41 | 知识 | 飞书连接/文档索引/搜索同步 | /library/feishu | `apps/web/server/feishu/service.ts:2` | /api/feishu | FeishuConnection/Document/Chunk/SourceItem | 部分实现 | 4/4/4/4 → 76 | P1 | 授权企业知识 | 保留 | 真实授权与外部同步未运行验证 |
| F42 | 知识 | 飞书知识空间浏览/订阅 | /library/feishu | `apps/web/server/knowledge/feishu-browse.ts:10` | /api/feishu/browse | FeishuSubscription/Node | 部分实现 | 4/3/4/4 → 71 | P1 | 订阅目录内文档 | 保留 | 新增未跟踪代码/迁移，部署与Schema一致性待验 |
| F43 | 知识 | 飞书上下文检索/缓存复核 | 项目对话 | `apps/web/server/knowledge/feishu-context.ts:13` | assistant 内部能力 | 授权Chunk/来源状态/TTL cache | 已完整实现 | 5/4/5/3 → 91 | P0 | 生成引用业务资料 | 保留 | 已有独立接入；避免泛称知识全未实现 |
| F44 | 身份 | 个人创作者画像与表达偏好 | /settings/creator-profile | `apps/web/server/creator-profile-service.ts:25` | /api/creator-profile | CreatorProfile | 已完整实现 | 4/4/4/2 → 80 | P1 | 个性化创作 | 保留 | 与平台CreatorAccount区分；用户scope |
| F45 | 身份 | IP背景版本/发布/项目快照 | /ip-context | `apps/web/server/content-governance/service.ts:25` | /api/content-hub（context.*） | IPContextVersion/Project.ipContextSnapshot | 已完整实现 | 3/3/3/3 → 60 | P2 | 团队背景与项目重放 | 降级 | 移资料/项目设置；A16统一创建快照 |
| F46 | Skill | Markdown导入/列表/编辑/禁用 | /library/methods/** | `apps/web/server/methods/service.ts:208` | /api/methods；import；[id] | MethodAsset/MethodVersion | 已完整实现 | 5/4/5/3 → 91 | P0 | 可选专业能力 | 保留 | 复用Method存储；不强制默认Method |
| F47 | Skill | 项目选取与版本绑定 | 项目设置 | `apps/web/server/project-methods/service.ts:98` | /api/projects/[id]/methods | ProjectMethodSelection | 部分实现 | 5/4/5/3 → 91 | P0 | 0个或多个专业能力 | 保留 | A03：创建1、设置3、模型当前单参数需统一 |
| F48 | Skill | Resolver激活/冲突/执行建议 | 项目运行 | `apps/web/server/ai/skill-resolver.ts:98` | AIControl 内部 | SkillMetadata/SkillResolution | 部分实现 | 4/3/4/4 → 71 | P1 | 决定本轮适用能力 | 保留 | DryRun/计划不等于通用工具执行器 |
| F49 | Skill | 旧默认方法候选/发布/fallback | 旧兼容配置 | `apps/web/server/default-content-method/service.ts:116` | /api/methods/default | MethodVersion/Workspace 默认 | 已完整实现 | 2/2/3/3 → 47 | P2 | 旧母稿路径 | 降级 | DEPRECATE 通用必选语义；fallback LEGACY_COMPAT |
| F50 | Skill | 从分析/提炼/对标保存方法 | 资料/研究高级入口 | `apps/web/server/methods/service.ts:208` | source/methods；benchmark method-suggestions | MethodAsset/Source/BenchmarkStudy | 已完整实现 | 4/2/4/3 → 68 | P1 | 复盘复用专业方法 | 合并 | 统一到Research“保存为Skill”动作 |
| F51 | 研究 | 会话创建/问题/范围/研究运行 | /research/new；session/[id] | `apps/web/server/research/service.ts:32` | /api/research/sessions/** | ResearchSession/ResearchRun/AIRun | 已完整实现 | 5/4/5/4 → 89 | P0 | 主动分析与综合 | 保留 | 保存输入、证据、局限、版本 |
| F52 | 研究 | 热点趋势快照/榜单/历史 | /research/trends/** | `apps/web/server/research/trends.ts:6` | /api/discovery/trends；research/trends/[stableKey]/related | TrendSnapshot/Provider | 部分实现 | 4/4/4/4 → 76 | P1 | 找研究方向 | 保留 | 依赖外部数据；缺失不能按零 |
| F53 | 研究 | 旧趋势页与今日推荐 | /discovery/trends/**；recommendations/[id] | `apps/web/server/discovery/recommendations/service.ts:29` | /api/discovery/recommendations/** | RecommendationBatch/Item/Evidence | 部分实现 | 3/3/3/4 → 58 | P2 | 个性化线索 | 合并 | Research入口收敛；A11先审读取scope |
| F54 | 研究 | 旧Discovery首页/账号详情兼容 | /discovery；discovery/benchmarks/[id] | `apps/web/app/(app)/discovery/page.tsx:2` | 跳转 Research | 已有研究基础 | 已完整实现 | 2/1/2/1 → 41 | P2 | 旧URL兼容 | 降级 | 保留跳转，不扩大旧一级产品中心 |
| F55 | 研究 | 来源收件箱/已读收藏/摘录 | /research/sources/** | `apps/web/server/research/read-model.ts:16` | /api/research/preferences；sources/[id]/clippings | SourceItem/ResearchObjectPreference/ResearchRun | 已完整实现 | 4/3/3/2 → 70 | P2 | 阅读资料后研究 | 合并 | Research内子视图；不与研究记录互删 |
| F56 | 研究 | 研究记录/保存结果/来源结论 | /research/results/** | `apps/web/server/research/read-model.ts:16` | sessions/[id]/runs/[runId] | ResearchRun.blocks/sourceRefs/savedAt | 已完整实现 | 5/4/5/3 → 91 | P0 | 追溯与再次使用 | 保留 | 保留私人研究归属与来源引用 |
| F57 | 研究 | 研究入已有项目/新建项目 | 结果页与作品页 | `apps/web/server/research/sharing.ts:25` | /api/research/results/[runId]/share；study/[studyId]/share | Artifact/DraftRevision/来源Run或Study | 已完整实现 | 5/4/5/3 → 91 | P0 | 免复制进入创作 | 保留 | 原子创建与分享；快照不是冗余旧报告 |
| F58 | 研究 | 对标账号添加/分类/同步 | /research/benchmarks/** | `apps/web/server/research/benchmark-workbench.ts:6` | /api/discovery/benchmarks/**；research/benchmarks/import；sync | BenchmarkAccount/CollectionRun | 部分实现 | 4/4/4/4 → 76 | P1 | 学习老师与比较账号 | 保留 | 区分对标账号和自己经营账号 |
| F59 | 研究 | 对标作品收集/素材转录/趋势观察 | /research/works；benchmarks/[id]/works/[workId] | `apps/web/server/research/work-research-service.ts:18` | research/benchmarks/[id]/works/[workId]/** | Snapshot/MetricObservation/SourceItem | 部分实现 | 4/4/4/4 → 76 | P1 | 研究单作品与账号窗口 | 保留 | 外部公开字段有限，不能保证全量 |
| F60 | 研究 | 账号研究旧版和V2 | 对标详情/研究结果 | `apps/web/server/research/account-v2-service.ts:14` | benchmarks/[id]/research；research-v2 | ResearchRun/账号研究coverage | 部分实现 | 4/2/3/4 → 61 | P2 | 账号表现和方法研究 | 合并 | 统一运行外壳与契约，保留版本解析 |
| F61 | 研究 | 焦点研究 Focus V2 | /research/focus/** | `apps/web/server/research/focus-v2-service.ts:17` | /api/research/focus-v2 | ResearchRun/证据coverage | 部分实现 | 4/3/4/4 → 71 | P1 | 跨材料综合问题 | 合并 | 归Research模式，不创建第二通用Runtime |
| F62 | 研究 | 热点选题机会 V2 | 趋势详情 | `apps/web/server/research/topic-opportunity-v2-service.ts:18` | trends/[stableKey]/opportunity-v2 | ResearchRun/TrendSnapshot | 部分实现 | 4/3/4/4 → 71 | P1 | 热点到选题 | 合并 | 共用Research运行/证据读取 |
| F63 | 研究 | 抖音作品拆解/阶段重试/停止/导出 | /research/teardown | `apps/web/server/research/teardown/service.ts:28` | /api/research/teardown/** | ResearchRun/SourceItem/Transcript/worker | 部分实现 | 4/4/4/5 → 74 | P1 | 拆解单作品 | 保留 | 真实后端已建，需LLM/RedFox/ASR/Worker验收 |
| F64 | 研究 | 对标Study报告/评论采集分析 | 旧研究结果兼容 | `apps/web/server/discovery/benchmark-study-service.ts:174` | /api/discovery/benchmarks/[id]/studies；comments/**；report | BenchmarkStudy/Sample/Comment | 部分实现 | 3/2/3/4 → 53 | P2 | 已有跨作品研究 | 合并 | 合并展示与执行外壳，保留旧报告解析 |
| F65 | 研究 | 资讯日刊/公共新闻缓存 | /research | `apps/web/server/research/news/service.ts:8` | /api/research/news | NewsStore磁盘文件/个人Preference | 部分实现 | 3/2/2/3 → 50 | P2 | 资讯浏览 | 降级 | A20：当前固定管理员实验，普通用户不能宣称可用 |
| F66 | 选题 | ContentIdea线索/引用/启动项目 | /discovery/ideas/** | `apps/web/server/discovery/service.ts:134` | /api/discovery/ideas/** | ContentIdea/Reference | 已完整实现 | 4/3/4/3 → 73 | P2 | 从线索到项目 | 合并 | A10/A23：统一入口，事务和幂等需补 |
| F67 | 选题 | ContentTopic评分/一票否决/审批 | /topics；/content-review | `apps/web/server/content-governance/service.ts:25` | /api/content-hub（topic.*） | ContentTopic/Version/Decision | 已完整实现 | 3/2/3/4 → 53 | P2 | 团队创作审批 | 降级 | 可选团队流程，不能强制所有项目走审批 |
| F68 | 审核 | 内容审核中心（选题审核） | /content-review | `apps/web/components/content-hub.tsx:33` | /api/content-hub | ContentTopicDecision | 已完整实现 | 3/2/3/2 → 57 | P2 | 团队候选审批 | 合并 | 并入候选/项目审批；不是稿件审核中心 |
| F69 | 审核 | 平台稿AI检查与人工审核 | /projects/[id]/review/[platform] | `apps/web/server/reviews/review-service.ts:82` | platform-variants/[platform]/review/** | ReviewRecord/PlatformVariant/AIRun | 已完整实现 | 4/3/4/3 → 73 | P1 | 旧发布前审核 | 保留 | AI建议与人工批准保持独立 |
| F70 | 审核 | 通用Artifact审核转发布 | 通用成果窗 | `apps/web/server/artifacts/service.ts:66` | 无对应发布关系 | Artifact锁定≠ReviewRecord | 已废弃或不可用（目标能力未完整实现） | 4/2/3/5 → 59 | P3 | 通用成果经营闭环 | 暂缓 | CURRENT IMPLEMENTATION GAP/FUTURE：保留锁定，不提前施工经营域 |
| F71 | 发布 | 任务/排期/发布包/复制 | /calendar；calendar/tasks/[id] | `apps/web/server/publishing/publish-task-service.ts:76` | /api/publish-tasks/** | PublishTask/contentSnapshot | 已完整实现 | 4/3/4/3 → 73 | P1 | 已有人工发布流程 | 保留 | 保留快照、审核前置和stale拒绝 |
| F72 | 发布 | 人工记录已发/失败/取消 | 发布任务详情 | `apps/web/server/publishing/publish-task-service.ts:76` | publish-tasks/[id]/published；failed；cancel | externalUrl/externalPostId | 已完整实现 | 4/3/4/2 → 75 | P1 | 追踪人工执行 | 保留 | 标记已发不等于实际调用平台发布成功 |
| F73 | 发布 | 平台授权自动发布 | 无真实完整入口 | `apps/web/server/publishing/publish-task-service.ts:76` | 未见自动发布Adapter | 无正式CreatorAccount/PublishedWork链 | 已废弃或不可用（FUTURE当前未实现；非授权删除） | 4/2/3/5 → 59 | P3 | 未来经营闭环 | 暂缓 | FUTURE：不把排期字段推断为自动发布已做 |
| F74 | 运营 | 账号登记/归档 | /short-video?tab=accounts | `apps/web/server/video-operations/service.ts:19` | /api/video-data（account.*） | VideoAccount | 已完整实现 | 3/3/3/2 → 62 | P1 | 手工经营台账 | 降级 | 保留局部基础，移运营二级入口 |
| F75 | 运营 | 每日数据手工/CSV预览与写入 | /short-video?tab=records | `apps/web/server/video-operations/service.ts:19` | /api/video-data（csv.preview/metrics.save） | VideoDailyMetric | 已完整实现 | 4/3/4/3 → 73 | P1 | 实际经营数据录入 | 保留 | 账号日唯一、并发版本与审计；不是作品快照 |
| F76 | 运营 | 运营内容阶段与项目关联 | /short-video?tab=content | `apps/web/server/video-operations/service.ts:19` | /api/video-data（content.*） | VideoContent/projectId | 已完整实现 | 3/3/3/2 → 62 | P2 | 经营台账 | 降级 | A22：保留关联；暂不扩张为PublishedWork |
| F77 | 运营 | 今日任务/负责人/延期/完成 | /short-video/tasks/** | `apps/web/server/video-operations/service.ts:19` | /api/video-data（task.*） | VideoTask/Assignee/Content | 已完整实现 | 3/4/3/3 → 65 | P1 | 运营执行 | 降级 | 保留运营任务，不把AIRun/项目状态等同任务 |
| F78 | 运营 | 账号趋势/缺失覆盖/异常规则 | /short-video | `apps/web/lib/video-analytics.ts:18` | /api/video-data GET | VideoDailyMetric/本地计算 | 已完整实现 | 3/3/3/2 → 62 | P1 | 分析手工日记录 | 降级 | 保持缺失空档与账号口径 |
| F79 | 运营 | 真实作品表现/粉丝画像 | /short-video works/audience | `apps/web/lib/video-analytics.ts:18` | 真实API无对应数据映射 | DEMO有数据；真实works/audiences空 | 仅有前端 UI | 3/2/2/5 → 46 | P3 | 观察作品与人群 | 暂缓 | A08：仅展示壳与演示数据，真实能力FUTURE |
| F80 | 运营 | AI复盘（模型生成与留存） | /short-video review | `apps/web/components/video-analytics-workspace.tsx:114` | 没有该流程LLM/Review API | 规则insight/浏览器复制 | 仅有前端 UI | 4/2/3/5 → 59 | P3 | 复盘反馈下一项目 | 暂缓 | A09：当前规则建议；真实Review持久闭环待立项 |
| F81 | 搜索 | 全局项目/资料/Skill搜索 | 顶栏 | `apps/web/components/global-search.tsx:19` | /api/search | DB搜索与导航项 | 已完整实现 | 4/5/4/2 → 85 | P1 | 快速寻找工作 | 保留 | 复用一处搜索；明确私人研究范围 |
| F82 | 导航 | 当前侧栏/最近项目/锁定状态机 | 全站 | `apps/web/components/sidebar-foundation.tsx:40` | /api/sidebar/** | ProjectListView/cookie/local偏好 | 已完整实现 | 5/5/5/2 → 98 | P0 | 导航与返回项目 | 保留 | 17个静态目的地压缩到5个；保留项目快捷项 |
| F83 | 导航 | 顶部文件/编辑/视图/窗口/帮助 | 全站 | `apps/web/components/app-shell.tsx:29` | 链接或浏览器命令 | 无独立业务数据 | 已完整实现 | 2/3/2/2 → 49 | P2 | 快捷操作 | 合并 | 视图/窗口重复命令统一；上下文无目标时禁用编辑命令 |
| F84 | 账户 | 登录/注册开关/会话退出 | /login；/register | `apps/web/lib/auth.ts:24` | /api/auth/[...all]；internal-signup | User/Session/Account | 已完整实现 | 5/5/5/3 → 96 | P0 | 系统登录 | 保留 | 保护账号/会话停用；注册依赖开关 |
| F85 | 账户 | 邮件邀请/验证/找回/会话撤销 | /account/**；settings/account | `apps/web/server/account-security.ts:20` | /api/account/**；settings/sessions | Verification/Session/邮件服务 | 部分实现 | 5/3/5/3 → 86 | P0 | 安全恢复 | 保留 | 邮件可用性必须实测；不展示未配置可发送 |
| F86 | 账户 | Workspace选择/停用/成员RBAC | /settings/workspace；members | `apps/web/server/workspace-context.ts:4` | /api/settings/workspace；members；owner | Workspace/Member/activeWorkspaceId | 已完整实现 | 5/5/5/3 → 96 | P0 | 公司范围隔离 | 保留 | 服务端选择scope；权限不能靠菜单隐藏 |
| F87 | 设置 | 第三方API/模型/转录配置 | /settings/integrations | `apps/web/server/integration-api.ts:12` | /api/integrations/**；local-asr/** | IntegrationConfig/加密配置 | 已完整实现 | 5/4/5/3 → 91 | P0 | 配置真实能力 | 保留 | 系统托管与Workspace credential边界保持 |
| F88 | 设置 | 本地目录/搬迁/对象存储 | /settings/storage | `apps/web/server/local-storage.ts:11` | /api/settings/storage | Workspace目录/SourceAsset/Storage | 部分实现 | 4/3/4/4 → 71 | P1 | 本地文件管理 | 保留 | 是服务器/当前机器存储，不等于桌面交付完成 |
| F89 | 设置 | 诊断/健康/关于/外观 | /settings/diagnostics；about | `apps/web/server/settings-diagnostics.ts:6` | settings/diagnostics；health/** | runtime状态/浏览器偏好 | 已完整实现 | 4/3/4/2 → 75 | P1 | 排查依赖与配置 | 保留 | 不暴露秘密值；样式设置与存储区分 |
| F90 | 管理 | 系统用户/客户空间/停用 | /admin/users；platform/accounts；spaces | `apps/web/app/api/admin/users/[id]/route.ts:10` | /api/admin/users/**；workspaces | User/Workspace/AuditLog | 已完整实现 | 5/2/5/3 → 81 | P0 | 账号交付基础 | 保留 | SYSTEM_ADMIN服务端限制；不等于License |
| F91 | 管理 | 系统服务配置/用量审计 | /admin/system；usage | `apps/web/server/admin/usage.ts:14` | /api/admin/system/**；usage | ApiUsage/系统Provider/AuditLog | 已完整实现 | 4/3/4/3 → 73 | P1 | 运维与成本追踪 | 保留 | 保留审计，确认秘密脱敏 |
| F92 | 基础 | AI权限/事实门/模型路由/运行记录 | 内部能力 | `apps/web/server/ai/control/ai-control-service.ts:68` | AIControl + AIRun API | AIRun/ApiUsage/Manifest | 已完整实现 | 5/5/5/4 → 94 | P0 | 受控Agent执行 | 保留 | A02改业务scope不破坏INVARIANT安全scope |
| F93 | 基础 | Tool Registry/通用Research Runtime | 未成统一入口 | `apps/web/server/ai/control/contracts.ts:142` | 固定API/worker调用 | 现有能力分散 | 已废弃或不可用（目标能力未完整实现） | 4/2/3/5 → 59 | P3 | 通用工具执行 | 暂缓 | TARGET ARCHITECTURE缺口；先复用现有能力，无必要新Runtime |
| F94 | 基础 | Worker模式锁/恢复/任务对账 | 后台 | `apps/web/server/embedded-worker.ts:9` | queue producers/health | Redis/BullMQ/DB终态 | 已完整实现 | 5/4/5/4 → 89 | P0 | 任务恢复 | 保留 | embedded/standalone资源与部署边界A15 |
| F95 | 基础 | 体验空间/自动登录限制 | /experience | `apps/web/server/experience-account.ts:1` | /api/experience/start | 体验User/Workspace/配额 | 部分实现 | 2/2/2/3 → 42 | P2 | 受控演示 | 降级 | 配置开关，不能把演示库数据当真实经营数据 |
| F96 | 未来 | 完整经营域/许可证/桌面交付 | 无完整当前页面 | `PRODUCT.md:1` | 未实现完整契约 | 现有局部模型不是完整FUTURE对象 | 已废弃或不可用（FUTURE当前未实现；非授权删除） | 5/1/3/5 → 62 | P3 | 正式后续交付 | 暂缓 | FUTURE：暂缓本轮施工，不能删除规划或把账户基础当许可证 |

## 数量汇总

- 能力组总数：**96**（含明确列出的未实现目标组；不表示96个已可用功能）。
- 保留：**59**；合并：**15**；降级：**15**；暂缓：**7**。
- 建议立即删除的功能：**0**。13个无生产引用UI候选属于VERIFY，不能进入确认删除总数。
- 优先级：P0 **35**、P1 **32**、P2 **22**、P3 **7**。

**严格当前口径为92个现存功能/界面/契约能力组**，另4个纯目标占位F70/F73/F93/F96不计已存在功能。92组中仍含UI与unsupported桩，不能理解成92个真正可用功能。现存处置为保留59、合并15、降级15、暂缓3；其余4个目标组均暂缓。

四类处置互斥，因此全部盘点项保留+合并+降级+暂缓=96；P0/P1核心基础全部必须保证安全和历史可读。删除只可在专项核查使用日志、动态引用、数据依赖、授权及回滚后提出。

## 核心功能边界

必须保留的基础：Project CRUD与归属、Conversation持续协作、Material真实读取、Research来源与报告、可选Skill、Artifact版本与重开、服务端scope/RBAC/凭据、Provider配置、存储与任务恢复。Skill本身可0个，不是每项目必选。资料库、知识事实、研究报告之间有不同证据和权限语义，不可仅凭名称合并数据。

核心业务价值与当前可用性互相独立：通用知识检索、事实上下文、多Skill和通用任务scope属于高价值实现差距，应优先补齐；平台自动发布、真实作品表现/粉丝画像、模型复盘、许可证、完整桌面交付是FUTURE，本报告只列依赖和验收，不授权实施。

## 合并/降级的依赖、数据与替代方案

以下均需先审核；业务代码没有改变。每个非保留能力组已在矩阵给出动作；相同处置机制归为下表，避免逐接口重复写迁移说明。

| 能力组 | 业务理由 | 必须检查的代码依赖 | 数据影响 | 替代方案 |
| --- | --- | --- | --- | --- |
| F06、旧Discovery/Method跳转 | 兼容入口占位，不需要并列中心 | dashboard/research/method真实目标及查询参数 | 无迁移，旧URL保留 | redirects + 主入口 |
| 旧母稿、节点Assistant、Canvas、默认Method、GPT交换 | 专业口播与高级编辑不是所有任务默认 | StudioShell/drafts/PlatformVariant/PublishTask/ContextBuilder | 母稿和快照继续可读；禁止本轮删表 | 项目高级视图/兼容适配 |
| 深度包和未挂载旧UI | 缺少当前主入口使用证据，维护优先级低 | API、历史外部调用、配置、动态导入 | DeepContentPackage仍保存；暂缓新增 | Research结果/项目上下文；VERIFY后再清UI |
| MaterialAnalysis/Distillation/方法提炼 | 主动分析放Research，资料页聚焦读出来 | material-detail/worker/methods/context/read-model | 原结果保留，只收敛编排与展示 | Research模式 + 原始Material引用 |
| KnowledgeEntry/知识候选/事实 | 条目、候选、确认不同阶段，入口可统一 | content-governance/material-knowledge/FactGate/保密规则 | 不合并FactRecord与EvidenceItem；保留版本和审批记录 | 资料知识子视图 + 服务端事实确认 |
| 旧推荐、账号V1/V2、Focus/Opportunity/Study | 同属研究模式，共用会话执行外壳 | 每个contract/evidence/run/analysis与旧结果解析 | ResearchRun与Study不可无映射删除 | 单Research导航、模式特有分析插件化复用 |
| 研究来源、研究记录 | 阅读原文与保存结论不同，减少应用导航负担 | read-model/preferences/sharing | 保留SourceItem和私有ResearchRun | Research的来源/历史子视图 |
| ContentIdea/ContentTopic/审核中心 | 灵感和审批两阶段，默认无需强审批 | discovery/startIdeaProject/content-governance/topic.project | 两套状态与历史均保留；先定义线索到审批关系 | 一个候选入口，可选团队审批 |
| IP背景/创作反馈 | 项目上下文与经验应贴近工作 | createProject/ipContextSnapshot/CreationFeedback | 保留原快照与版本，不能同步覆盖历史项目 | 项目设置/资料背景/项目历史 |
| 运营账号/今日任务/看板 | 局部经营能力有真实数据，非核心首页职责 | video-operations/VideoAccount/VideoTask/CSV权限 | 保留每日记录、任务；不与PublishTask强合表 | 运营二级入口；项目相关记录链接 |
| 顶部视图/窗口命令 | 浏览器命令重复，无独立后台能力 | AppTopbar与菜单目标焦点 | 无业务数据变更 | 一个视图菜单/上下文动作 |
| FUTURE目标组 | 依赖CreatorAccount/作品快照/Review或桌面/许可证契约 | 先Product模块任务，不靠旧Account或VideoAccount推断完成 | 只保留规划；无本轮Schema变化 | 后续单独交付单元 |

导航预计17→5的口径、候选UI的静态引用证据、每项“重复不等于冗余”的比较见 V4_DUPLICATION_REPORT.md。
