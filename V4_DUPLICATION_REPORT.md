# V4.0 重复与冗余分析

审计日期：2026-10-10（Asia/Singapore）。对象：当前工作树，HEAD `242f7b911e369d4c93d0deccc02ee368cfd90137`。这不是 Governance Update，不改变 PRODUCT.md / ARCHITECTURE.md / LEGACY.md / AGENTS.md。

验证等级 **V0**：仅读取代码、配置样例、Schema、路由、测试定义及 Git 状态。未启动服务、未调用外部 Provider、未执行测试/typecheck/build、未查询或修改数据库，未运行 migration。存在大量既有未提交修改和未跟踪新模块，本轮包含它们，但不把历史 QA 报告视为当前通过结果。

证据强度：**确定**=代码直接可见；**风险**=存在条件性失败路径，未复现；**VERIFY**=静态扫描候选。矩阵“已完整实现”仅指所列狭义能力具备代码闭环，**不代表当前环境 API 调用成功或上线可用**。外部数据、模型、转录、队列、邮件等仍需配置和运行验收。

## 判断原则

重复入口不等于重复功能；相同文字输出也不意味着数据可合表。只把可复现的相同职责、可替代实现或无挂载UI列为收敛候选。A编号对应代码审计问题，F编号对应功能矩阵。未观察实际使用频率，不使用“从来没人用”的判断。

## 九组重点比较

| 比较项 | 源码位置 | 真实职责差异 | 依赖与数据影响 | 建议与替代方案 |
| --- | --- | --- | --- | --- |
| 资料库 / 知识中心 | `apps/web/server/material-detail/readable-content.ts:8`；`apps/web/server/content-governance/service.ts:67` | 读取原始输入 vs 来源快照后的条目、保密及修订 | SourceItem/Transcript/Asset 与 KnowledgeEntry 不是同物；A04尚未统一检索 | 合并导航层级：资料下“原文/知识/事实”；保留领域与权限服务。不得删知识数据。 |
| 今日任务 / 项目任务 | `apps/web/server/video-operations/service.ts:174`；`apps/web/server/assistant/task-state.ts:11` | 运营执行任务 vs 对话任务状态、AIRun或项目状态 | VideoTask有负责人、截止、contentId；没有等价独立ProjectTask模型 | 今日任务降运营二级，项目中显示关联运营记录；不把AIRun强行合并VideoTask。 |
| 项目管理 / 最近项目 | `apps/web/server/project-service.ts:49`；`apps/web/server/sidebar/service.ts:153` | 完整筛选/生命周期 vs 回到最近/置顶/文件夹 | 相同ContentProject，UserProjectPreference是个人视图 | 保留两种入口，复用读取与view-model；近期入口不计新增业务域。 |
| 创作方法 / Agent配置 | `apps/web/server/methods/service.ts:221`；`apps/web/server/ai/control/model-router.ts:1` | 专业Skill版本 vs 模型、参数、执行策略 | MethodAsset/Version与IntegrationConfig/creationOptions不同 | Skill一级；模型/模式在项目composer，密钥在设置；合并展示入口不合并存储。 |
| 事实确认 / 内容审核 | `apps/web/server/content-governance/service.ts:134`；`apps/web/server/reviews/review-service.ts:164` | 核验声明的真实性/身份/期限 vs 审核某版平台内容 | FactApproval和ReviewRecord必须独立；content-review目前主要ContentTopic审批 | 事实留资料/项目确认入口；审核是成果/平台上下文动作。不能删FactGate和双确认。 |
| 作品拆解 / 对标研究 | `apps/web/server/research/teardown/service.ts:28`；`apps/web/server/research/work-research-service.ts:18`；`apps/web/server/research/account-v2-service.ts:14` | 临时抖音作品的语义段落/阶段处理 vs 账号窗口和长期观察 | 部分共用SourceItem、Transcript、Benchmark，ResearchRun模式和样本范围不同 | 共用输入与运行外壳，保留单作品/账号研究模式；不重复下载和转录已可复用资料。 |
| 研究记录 / 已保存来源 | `apps/web/server/research/read-model.ts:20`；`apps/web/server/research/read-model.ts:142` | Research结论历史 vs 原始资料收件箱 | ResearchRun/Study 与 SourceItem/Preference不同 | Research子视图：历史、来源；重复侧栏入口收敛，不删除原文或研究报告。 |
| 热点趋势 / 资讯日刊 | `apps/web/server/research/trends.ts:19`；`apps/web/server/research/news/service.ts:8` | 榜单指标/采样机会 vs 精选新闻文本/日刊 | TrendSnapshot在DB；NewsStore是公共磁盘缓存与个人Preference | Research“发现”内两种筛选，资讯权限按A20保留实验；暂不强并数据仓。 |
| 顶栏快捷菜单 / 左侧导航 | `apps/web/components/app-shell.tsx:216`；`apps/web/components/sidebar-foundation.tsx:14` | 快捷命令与全局目的地重叠 | 只是链接，没重复创建后端服务；视图/窗口命令相同 | 主导航明确；顶栏保留搜索、项目上下文、视图和帮助；文件菜单作为快捷动作，去重复命令。 |

## 重复逻辑与编排候选

| 范围 | 证据 | 影响 | 处置与替代 |
| --- | --- | --- | --- |
| 项目创建三路径 | project-service.ts:createProject；sidebar/basic-project.ts:createBasicProject；content-governance/service.ts:topic.project（A16） | 事务、成员停用检查、主稿初始化、IP snapshot、幂等行为不同 | 先复用最小基础创建事务，入口编排保留；ContentTopic审批不能被普通创建绕过 |
| Research账号V1/V2/Work/Focus/Opportunity | server/research下 *_contract/evidence/run/analysis/service；service.ts reserve/execute总调度 | 重复运行状态/权限/报告外壳，特有采样与证据不相同 | 复用现有ResearchSession/Run；只抽相同生命周期，不生成ResearchRuntimeV3 |
| 材料分析/提炼/深度包/通用研究 | material-detail/service、material-analysis、material-distillation、unified-analysis、deep-content、research/inputs | 多份生成结果和多个上下文聚合 | 主动研究入口收敛；原始读取单一；历史分析是派生产物，不能按“有文本”删除 |
| ProjectContextBuilder / ContextBuilderV2 | ai/project-context与ai/control/context-builder-v2:154,217 | 通用分支已独立但事实/历史语义不同；旧分支嵌套 | 复用可见性/读取能力，按场景生成manifest；不在通用入口继续堆口播规则 |
| 主稿 / 通用成果编辑 | mother-content-editor、StudioShell、artifact-editor、use-artifact-editor、drafts/service | UI状态、保存/版本/确认有交叉；存储原语已经复用 | 先统一expectedVersion、dirty、恢复等共用行为；保留主稿兼容投影 |
| API响应处理 | 多个 jsonRequest / request / draftRequest 包装器 | 重复错误、abort、403/409与JSON失败处理 | 先检查现有请求工具，按语义扩展；不能只为少量重复新建ClientV2 |
| 顶栏视图/窗口 | app-shell.tsx AppTopbar二分支共享内容 | 相同折叠/全屏/回顶 | 一个视图菜单；保留页面焦点与快捷键 |
| Markdown/报告渲染 | research-blocks、work-research-markdown、renderTeardownMarkdown | 结构化来源、provenance、缺失值存在差异 | 提取安全相同格式片段；不丢弃来源、局限、来源类型 |
| 三层缓存 | Discovery/Feishu/search/memory缓存；news磁盘；React state与local偏好 | TTL、scope、失效与刷新不统一；并非都存相同数据 | 相同来源复用cache key/invalidation；读授权后命中；UI偏好不当业务权威 |

## 重复组件与未引用代码候选

搜索范围：apps/packages/services/scripts源文件，检索组件文件stem及导出的符号。路径零命中只作初筛；旧Sidebar额外检查生产import和JSX挂载。没有建立完整TS AST/运行时调用图，没有对外部脚本、插件动态拼接装配做消除证明。

| 组件位置 | 导出符号 | 生产符号引用数 | 测试符号引用数 | 行数 | 处理 |
| --- | --- | --- | --- | --- | --- |
| `apps/web/components/discovery/discovery-workspace.tsx:1` | DiscoveryWorkspace | 0 | 0 | 236 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/library/metadata-refresh-button.tsx:1` | MetadataRefreshButton | 0 | 0 | 42 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/library/retry-ingest-button.tsx:1` | RetryIngestButton | 0 | 0 | 10 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/library/source-asset-download-button.tsx:1` | SourceAssetDownloadButton | 0 | 0 | 26 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/projects/ai-creation-panel.tsx:1` | AICreationPanel | 0 | 0 | 146 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/projects/deep-content-workspace.tsx:1` | DeepContentWorkspace | 0 | 0 | 181 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/projects/evidence-board.tsx:1` | EvidenceBoard | 0 | 0 | 60 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/projects/project-archive-button.tsx:1` | ProjectArchiveButton | 0 | 0 | 18 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/projects/project-cover-image.tsx:1` | ProjectCoverImage | 0 | 0 | 9 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/projects/project-status-panel.tsx:1` | ProjectStatusPanel | 0 | 0 | 82 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/projects/project-tree-extension.tsx:1` | ProjectTreeExtension | 0 | 0 | 44 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/research/benchmark-tables.tsx:1` | BenchmarkAccountTable, BenchmarkWorksTable | 0 | 0 | 50 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |
| `apps/web/components/sidebar.tsx:1` | Sidebar | 0 | 4 | 141 | VERIFY：动态/外部引用未查；审核后只清无挂载UI，不顺手删API/模型 |

候选共 **13 个UI文件**，合计 **1045 行**。这只是待验证文件体积上限，**不等于确认重复代码或承诺可删行数**。相关CSS、测试、API不算在可删量内；每个候选删除需明确授权。`SidebarFoundation`正在使用，旧`Sidebar`是候选，不删除新基础。

## 精确重复扫描与小工具重复

对大于400字符的上述源文件做SHA256正文完全相同扫描：发现 **0 组**。没有发现非平凡的完整文件复制。 小路由/重导出文件不在该口径内，它们的重复多是Next拦截设置页复用，不能当成重复业务删除。

`JSON.parse(JSON.stringify(value))`服务端辅助函数出现 **33 处**（下表）。证明该代码片段相同，但类型、调用上下文、事务用途尚需评估；省下几行不值得新增大型序列化抽象。

| 文件 | 行号 |
| --- | --- |
| apps/web/server/ai/ai-run-service.ts | 25 |
| apps/web/server/artifacts/service.ts | 21 |
| apps/web/server/assistant/service.ts | 49 |
| apps/web/server/benchmark-topics/service.ts | 31 |
| apps/web/server/canvas/service.ts | 40 |
| apps/web/server/creation-feedback/service.ts | 158 |
| apps/web/server/deep-content/service.ts | 12 |
| apps/web/server/default-content-method/service.ts | 62 |
| apps/web/server/discovery/benchmark-study-service.ts | 103 |
| apps/web/server/discovery/recommendations/service.ts | 13 |
| apps/web/server/discovery/service.ts | 40 |
| apps/web/server/discovery/trends/service.ts | 28 |
| apps/web/server/discovery/trends/topic-service.ts | 15 |
| apps/web/server/drafts/service.ts | 64 |
| apps/web/server/learning-suggestions/service.ts | 25 |
| apps/web/server/material-analysis/service.ts | 88 |
| apps/web/server/material-distillation/service.ts | 48 |
| apps/web/server/material-knowledge/service.ts | 26 |
| apps/web/server/methods/service.ts | 84 |
| apps/web/server/platforms/platform-variant-service.ts | 21 |
| apps/web/server/project-methods/service.ts | 59 |
| apps/web/server/publishing/publish-task-service.ts | 13 |
| apps/web/server/research/account-research-run.ts | 13 |
| apps/web/server/research/account-v2-run.ts | 13 |
| apps/web/server/research/focus-v2-run.ts | 13 |
| apps/web/server/research/service.ts | 30 |
| apps/web/server/research/teardown/service.ts | 15 |
| apps/web/server/research/topic-opportunity-v2-run.ts | 13 |
| apps/web/server/research/work-research-run.ts | 14 |
| apps/web/server/reviews/review-service.ts | 15 |
| apps/web/server/source-metadata-service.ts | 39 |
| apps/web/server/studio/quick-actions.ts | 44 |
| apps/web/server/unified-analysis/service.ts | 14 |

## 重复数据与权威来源

| 数据组合 | 是否冗余 | 当前权威/用途 | 安全收敛策略 |
| --- | --- | --- | --- |
| SourceItem.rawText / Transcript / SourceUnderstanding | 不是必然冗余 | 原始文本、转录、AI识别是不同来源；readable-content决定可用正文 | 保留原文、机器来源、版本和解析状态；禁止覆盖成一份无出处文本 |
| DraftBranch.workingBody / DraftRevision.body | 有意重复 | working是编辑态；Revision是不变checkpoint历史 | 共用版本写原语，历史恢复追加，不覆盖旧Revision |
| MotherContent / primaryDraftBranch | 兼容投影 | drafts/service写主稿checkpoint时同步MotherContent供旧平台稿 | 双写事务内一致；新Artifact不依赖MotherContent；确认后再减少投影 |
| Artifact / DraftBranch | 不是重复正文表 | Artifact是一等成果身份；正文与版本在Branch/Revision | 复用当前设计；当前TEXT限定记录为差距，避免一轮引入泛类型存储 |
| ResearchRun.blocks / 分享后的Artifact | 有意快照 | 原私有报告与主动加入共享项目的结论文本 | 保留来源Run/Study、版本和用户选择；不能自动更新共享快照泄露新私人信息 |
| BenchmarkContentSnapshot / MetricObservation / CollectionRunItem | 不同时间语义 | 当前作品元信息、观察时计数、采集批次记录 | 保留时间、窗口和完整性；作品去重不删除历史观察 |
| ContentIdea / ContentTopic | 语义重叠但不同审核状态 | 灵感线索/引用 vs 团队评分/事实审批 | 先建立转换关系、映射和幂等，不能直接合并或删表 |
| EvidenceItem / KnowledgeEntry / FactRecord | 不同证据责任 | 候选/外部证据、知识条目版本、个人声明确认 | 共享读取与确认契约；不把所有Evidence CONFIRMED解释成个人事实已确认 |
| PublishTask.contentSnapshot / PlatformVariant | 发布留痕的有意快照 | 人工批准稿版本对应的发布包 | 正文继续编辑不能悄改历史发布包；保留source version |
| VideoAccount / BenchmarkAccount / auth Account | 不能合表 | 自有运营台账 / 外部对标账号 / 产品登录认证 | FUTURE CreatorAccount独立设计，保留现有映射 |
| NewsStore / TrendSnapshot / SourceItem | 内容与存储机制不同 | 公共新闻缓存、榜单指标、用户资料 | 公共缓存不接私人数据；导入为资料需显式来源和权限 |

## 状态与缓存的重复范围

当前未发现Redux/Zustand等多套中央Store并列的证据；主要是React局部状态、服务器读取和浏览器偏好。真正风险是相同稿件/项目在多个容器拥有副本和刷新协议，不能把所有useState视为冗余。

- StudioShell持有mother分支状态；MotherContentEditor还持有编辑内容/版本；Artifact用useArtifactEditor；Canvas有自己的对象/位置状态。这些职责应统一保存契约后拆宿主。
- AppShell通过project-list-changed + /api/sidebar刷新，项目库另有同步桥。先统一失效通知，避免新建一个平行缓存系统。
- localStorage中studio-workbench-layout、studio-assistant-open、Canvas视图为布局偏好；sessionStorage有composer草稿/附件选择/最近打开节流。它们不能替代服务端持久Artifact。
- A06逐轮资料选择清空是明确代码行为；若改变为持续引用，应保存引用对象而非复制正文。

## 可减少的导航与代码范围

当前SidebarFoundation主导航静态目的地：**17**=首页1+工作台1+内容创作4+知识资料5+研究6；不计品牌链接、账户/设置/系统管理、动态最近项目或条件性的“从此项目开始研究”。研究壳内部8个模式/视图不加进主导航总数。

目标：**5**=首页、项目、资料、研究、Skill；运营、事实/审核、选题审批、知识、历史等进入二级/项目上下文。静态主导航可少 **12（约71%）**，只减少导航负担，**不删除12种后台能力**。在审核前这只是方案，未修改导航。

重复代码可收敛范围：13个UI候选、项目创建3条路径、研究运行/报告外壳、多处API错误包装、主稿/成果编辑状态、全局样式覆盖。没有足够证据给全仓“节省30%代码”的承诺；可删代码确认量目前为0，UI候选行数仅评估上限。

## 重复编排逐项代码定位补充

上述重复逻辑表的文件位置在此集中列出；影响与处理建议以上表对应行为为准，均为候选收敛，未施工。

| 范围 | 具体文件和代码位置 |
| --- | --- |
| 项目创建三路径 | `apps/web/server/project-service.ts:111`；`apps/web/server/sidebar/basic-project.ts:13`；`apps/web/server/content-governance/service.ts:224` |
| Research共用生命周期与模式差异 | `apps/web/server/research/service.ts:63`；`apps/web/server/research/account-v2-run.ts:1`；`apps/web/server/research/focus-v2-run.ts:1` |
| Context旧分支与通用分支 | `apps/web/server/ai/project-context.ts:25`；`apps/web/server/ai/control/context-builder-v2.ts:154` |
| 编辑状态/版本与工作区编排 | `apps/web/components/projects/mother-content-editor.tsx:8`；`apps/web/components/projects/use-artifact-editor.tsx:79`；`apps/web/server/drafts/service.ts:190` |
| API request重复候选 | `apps/web/components/projects/studio-shell.tsx:164`；`apps/web/components/projects/studio-default-method.tsx:41`；`apps/web/components/projects/use-artifact-editor.tsx:73` |
| 报告格式共享与目录依赖 | `apps/web/components/research/work-research-markdown.ts:37`；`packages/core/src/teardown.ts:128` |
| 缓存与多state边界 | `apps/web/server/knowledge/feishu-context.ts:7`；`apps/web/server/assistant/memory.ts:1`；`apps/web/server/research/news/store.ts:12`；`apps/web/components/projects/studio-shell.tsx:118` |
