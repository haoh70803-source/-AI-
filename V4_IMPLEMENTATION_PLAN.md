# V4.0 分阶段实施计划（待审核）

审计日期：2026-10-10（Asia/Singapore）。对象：当前工作树，HEAD `242f7b911e369d4c93d0deccc02ee368cfd90137`。这不是 Governance Update，不改变 PRODUCT.md / ARCHITECTURE.md / LEGACY.md / AGENTS.md。

验证等级 **V0**：仅读取代码、配置样例、Schema、路由、测试定义及 Git 状态。未启动服务、未调用外部 Provider、未执行测试/typecheck/build、未查询或修改数据库，未运行 migration。存在大量既有未提交修改和未跟踪新模块，本轮包含它们，但不把历史 QA 报告视为当前通过结果。

证据强度：**确定**=代码直接可见；**风险**=存在条件性失败路径，未复现；**VERIFY**=静态扫描候选。矩阵“已完整实现”仅指所列狭义能力具备代码闭环，**不代表当前环境 API 调用成功或上线可用**。外部数据、模型、转录、队列、邮件等仍需配置和运行验收。

## 当前交付状态

STATUS：第一轮V0静态审计及六份文档已完成，待方案审核。没有业务实施、删除、迁移或Git暂存/提交。

主要目标始终是项目持续协作核心链的完整与可恢复。未来各阶段是提案，**不是本轮执行授权**；阶段验收通过再开展下一阶段。不要把所有计划合成一个跨模块大diff。

## 阶段、依赖和交付单元

| 阶段 | 范围/问题 | 复用基础 | 依赖 | 验证等级/验收 | 风险和回滚 |
| --- | --- | --- | --- | --- | --- |
| S0 审核与固定基线 | 审阅6文档、96盘点项、27问题；确认导航和范围 | 当前权威文档、实际工作树 | 本轮审计 | V0；确认核心/旧兼容/FUTURE，不修改治理规则 | 当前有大量其他未提交改动，先识别归属；不要stash/reset/带入其它模块 |
| S1 个人数据与写权限边界 | A11/A12/A16读取scope、成员停用/撤权事务复核 | api-access/workspace-context/research access及现有服务 | S0核准可见性语义 | V1→模块收口V2；跨空间/同空间私有对象/VIEWER/停用负例 | 过滤可改变共享可见内容；回滚业务代码但不得放宽安全边界，必要时暂停受影响入口 |
| S2 核心上下文契约 | A02通用业务scope；A03多Skill；A04/A05知识/事实；A06引用持久语义 | ContextBuilderV2/references/project-methods/fact/Material/Feishu读取 | S1权限与S0语义审核 | V2：0Skill、多Skill、任务锚点、失效/保密/来源预算负例，相关typecheck | 避免通用上下文回到母稿耦合；按场景小diff，保留旧生成fallback |
| S3 保存/重开/异常恢复收口 | A23旧Idea启动幂等；A25历史分页；A26硬故障恢复需求 | createProject事务参数、Artifact/DraftRevision、task-state/job recovery | S2核心输入契约 | V2：真实隔离库持久化、并发409、重开、锁、恢复、进程故障场景 | 增草稿或delta checkpoint必须先确认需求/成本；未保存与已保存状态不同；版本恢复追加历史 |
| S4 默认入口与工作区简化 | A01 Home；A13默认Conversation/Artifact；九组入口A10/A20 | WorkbenchStart/HomeComposer/AppShell/SidebarFoundation/现有ArtifactWindow | S2/S3关键链收口；S1资讯/私有边界 | V2：导航、可访问性、键盘、响应式；旧深链接和设置拦截保持 | UI状态/焦点/dirty保护不能丢；旧布局保留兼容入口，回滚只换UI宿主 |
| S5 领域编排和重复实现收敛 | A16创建基础/编排；A17资料与研究；研究模式共用外壳；A14CSS；A15Worker依赖、A27纯报告格式器目录边界 | 当前Project/Research/Material/Artifact服务原语 | S4默认使用链稳定 | 按模块V2；schema若变与对应业务一起交付；相关旧数据样例 | 不批量移动所有模块；先适配后迁移，不删表，兼容旧Study/Mother/Canvas |
| S6 候选清理与正式收口 | A18的13UI候选；旧redirect/未使用API核验；重复小工具 | 静态引用清单+实际使用日志+历史依赖 | 核心V1稳定；单独删除授权 | V2逐模块；正式Release前V3关键全局验收 | 动态引用未确认的不删；用户数据保留；只撤销本交付单元，不reset用户工作 |
| SF 后续经营/桌面/License | A07/A08/A09/A22及PRODUCT FUTURE | 发布任务、Video手工台账、Provider/local-storage基础 | 每域单独明确模块任务与产品批准 | 模块V2、关键交付V3；真实平台/Metric/Review/恢复/Entitlement专项 | 不因审计提前施工；Schema迁移和用户数据需独立审核、备份与演练 |

S1–S3逻辑上先修核心能力；S4导航中的纯链接收敛可在对应模块独立验收后进行，不必等待全部后台重构。S5/S6以核心稳定为前提，不安排“先全仓清理再做功能”。无实际工时和使用率数据，不给固定上线日或虚假节省百分比。

## 每阶段可审核的小任务

### S1：服务端范围与权限

1. 为A11明确Recommendation候选的共享资料/私人项目、线索范围；先写会揭示跨用户读取的负例，再定向修query。
2. 为A12明确MethodSuggestion.ownerUserId是否私有；列表、决定、source study可見范围一起验，不只隐藏按钮。
3. 为A16校验createBasicProject和其他创建路径事务内成员/Workspace/User停用；保留基础项目成功创建与VIEWER拒绝。
4. 验证签名media URL、内部relay、Storage目录和飞书撤权，不把内部签名鉴权改成无鉴权或只靠用户会话。

### S2：通用持续协作

1. 调整GENERAL_QUERY业务scope，保留Auth/RBAC、FactGate与ActionPermission；旧内容任务Scope可继续在旧流程生效。通用编程/分析任务不应被旧内容正则直接拒绝。
2. 统一项目创建/设置/Assistant模型输入的SkillVersionIds；现有0、1、3和.slice(0,1)分支全部检查。明确多Skill加载≠全部激活，冲突和版本结果可解释。
3. 复用Material可读正文、授权Feishu检索、Knowledge/Fact可见读取；不把所有知识条目读进每次Prompt，不用Prompt判断访问权限。
4. 资料本轮/持续用途和来源版本显式保存；重开和retry从服务端metadata恢复，不依赖某句用户中文自动选资料。
5. 验证上下文预算提示、完整用户任务、来源和已确认事实标记；外部研究不变成我方个人经历。

### S3：成果和故障恢复

1. 旧ContentIdea启动与源绑定采用现有事务/幂等能力，重试不重复项目、不漏Source关系；采集失败和最终绑定分开补偿。
2. 长历史加分页，排序(cursor/version/id)稳定；先保持最近默认窗口，不一次加载全部消息/全文。
3. 对dirty编辑和流式delta定义恢复承诺：必须保存才承诺重开？是否要可恢复草稿？审核后复用既有Branch/Message原语做适量checkpoint，不新增平行版本表。
4. 故障注入只在隔离环境：杀测试worker、超时、Redis中断、Provider失败；重启后状态正确，完整成果和不变修订可读。

### S4/S5：导航与职责

1. Home复用创建/最近组件，运营保留二级；已公开旧路由保留redirect及参数上下文。
2. Project默认Conversation+Artifact，Canvas高级视图；loadWorkbenchPageData按需加载旧平台/方法/Canvas，UI只负责本域状态。
3. Material深度分析导向Research模式；不要搬走原文/ASR；Study/MaterialAnalysis老结果可读、有来源。
4. ProjectCore基础事务复用，Home/Topic/Research创建是独立应用编排；Artifact只通过其Service保存，不让UI或Conversation直接写内部表。
5. 样式从明确页面作用域和实测覆盖段落收敛，避免新的“V4-global.css”平行系统。只在指定模块改，不顺手全仓格式化。

## 必须达到的核心验收标准

| 验收ID | 操作/输入 | 可验证通过条件 | 对应问题/当前测试线索 |
| --- | --- | --- | --- |
| C01 | 创建空项目、不选Skill | 可开启通用对话、真实PROJECT scope；无默认Method前置 | A02/A03；creation-agent / creation-composer |
| C02 | 同一项目选择多个授权Skill | 创建/更新/加载同契约；版本记录；没有默默.slice到第一个 | A03；project-methods / skill-resolver |
| C03 | 文本/PDF/音视频输入，引用生成 | Source/Asset可追溯，可读正文对应原文/ASR/识别版本；缺失明确 | Material/ASR/creation-agent |
| C04 | 已确认事实、失效事实、外部案例 | 仅当前授权且有效事实可作OWN_CONFIRMED；外部不变个人经历 | A04/A05/A24；creation-fact-safety / material-knowledge |
| C05 | 脚本生成→保存→新会话重开 | 读取同ArtifactId及新version/正文，消息与来源链接一致 | artifacts.test / creation-agent.test |
| C06 | AI局部改段→用户应用→继续改 | 范围外正文不变；候选基于正确版本；不自动覆盖锁定成果 | creation-agent局部/连续修改/锁定 |
| C07 | 两客户端同时保存同version | 最多一个成功，其余409；无孤儿Artifact或缺历史 | artifacts / creation-agent并发 |
| C08 | 研究结果入新/已有项目，双击重试 | 一个项目/Artifact，可追溯源版本；私人原对话不公开 | research-project-handoff.test |
| C09 | 旧Idea重复启动并中途失败 | 不重复建项目，最终Source绑定可恢复、保留原资料 | A23新定向集成用例 |
| C10 | 同空间其它用户私有研究/建议、跨空间来源、VIEWER写 | 服务端拒绝，模型没有收到受保护正文；Audit/错误脱敏 | A11/A12/A16；scope/RBAC负例 |
| C11 | 文件/飞书撤权或连接版本改变后命中缓存 | 清/跳过失效项，明确告知；不能用缓存绕权限 | assistant-feishu-cache / feishu boundary |
| C12 | 生成停止/超token/超时/进程硬杀 | 不误标COMPLETED；已保存成果可读；恢复能力符合已批准承诺 | A26；creation-agent/task-state/worker recovery |
| C13 | 80+消息/100+修订，重开并翻历史 | 分页完整稳定，旧记录可读取、不偷偷删历史 | A25相关新定向用例 |
| C14 | 旧主稿、平台稿、审核、发布包重开 | 母稿投影版本一致；过期平台稿拒绝；批准条件不绕过 | drafts/reviews/publishing既有测试 |
| C15 | 普通首页/运营真实数据空/资讯无授权 | 首页可找项目；数据来源明确、空值不填演示；权限提示准确 | A01/A08/A20；workbench UX/navigation |
| C16 | 改版侧栏/手机/键盘/浏览器后退 |5主入口可达、旧URL可继续、dirty保护/焦点/设置窗正确 | sidebar/research-navigation/workbench-ux |

验收证据要包含运行配置名称、命令、当前HEAD/工作树版本、环境scope、HTTP状态、实体ID/版本、来源manifest、截图（UI）和失败样例；禁止附真实密钥。V0报告不补造这些证据。真LLM不以MOCK provider替代；外部ASR/飞书/邮件/API成本及授权需要按具体阶段已有会话授权判断。

## 数据迁移与回滚约束

- 前几阶段优先无Schema变更，复用现有结构和Service。出现Schema变化时，迁移、拥有变化的业务代码和定向测试同一交付单元；未经明确要求不migration deploy。
- 清理前先列模型读写和direct callers，再查实际记录/关联/引用（只在经授权环境）；备份与恢复演练通过，才可提出字段/表处置。
- ResearchRun→Artifact主动分享快照、DraftRevision历史、PublishTask内容快照不能按重复文本删掉。任何映射需保留来源ID、版本、创建者、Workspace及权限。
- 历史回滚用追加Revision或明确恢复方案；不覆盖审计记录。UI回退恢复旧宿主/入口，旧深链接继续有效。
- 回滚只针对本次经过审核的交付单元，可做反向补丁/明确授权的revert；默认不git reset/stash/clean、不删用户工作、不切分支。Git操作按AGENTS授权分别处理。
- 数据库不可逆迁移不安排在导航精简或V0审计内。没有用户记录统计时，不能决定删除DB字段/页面/接口。

## 验证命令建议（本轮未运行）

使用仓库现有runtime-env隔离入口。先确认`.env.local-test`目标、db test-target、Redis/存储与LOCAL_REAL完全分离；不打印秘密值。按具体交付选择Vitest定向文件及模块相关typecheck，Playwright只跑对应流程。可参考现有脚本而非复制新测试系统：

```powershell
# 示例：后续阶段才执行；先确认LOCAL_TEST隔离与依赖就绪
node scripts/runtime-env.mjs LOCAL_TEST .env.local-test pnpm --filter @content-center/web exec vitest run tests/artifacts.test.ts tests/creation-agent.test.ts tests/research-project-handoff.test.ts
pnpm --filter @content-center/web typecheck
# 正式Release收口才开展V3，不为纯导航小diff跑全仓全部测试
```

定向测试新增只针对权限、版本、恢复等实质风险，不写镜像实现的测试或为纯文档修改跑全仓构建。历史qa-reports不能当当前结果。全局依赖扫描/License/桌面/发布平台的验收随明确模块任务进行。

## 交付与Git节奏

小任务→小diff→定向验证→模块收口；稳定交付单元应及时进入READY_TO_STAGE/READY_TO_COMMIT供人工处理。**未明确授权不得git add/commit，push必须单独授权**。当前存在混合业务改动，文档和后续代码不得打包带入其它模块；无法安全分hunk则停止并报告。

当前六份文档为READY_TO_STAGE（文档检查后），不暂存。报告完成即停止。下一步需要用户审核本方案、选择阶段范围；不是要求用户为本轮只读审计重复授权。
