> **历史模块说明（2026-10-07交接标注）：** 本文保留原阶段范围和设计记录；当前运行版本、验证状态与待完成项请先读[内容工作台协作交接](../WORKBENCH_HANDOFF.md). 产品定义仍以根目录权威文档为准。

# Research V2 内容研究引擎重构方案

状态：`RESEARCH_V2_REARCHITECTURE_PLAN`。基线：`feat/web-integration-release` / `ae3ff087`，2026-09-28。此文记录目标与已核实的代码事实；后续阶段未验收前不视为已实现。

## 1. 当前实际架构

- `BenchmarkAccount` 持有身份与采集批次，`BenchmarkContentSnapshot` 持有作品标题和元数据，`BenchmarkMetricObservation` 持有实际观察值；`SourceItem`、`Transcript`、`SourceUnderstanding` 持有可读内容。RedFox 负责采集，Material 的 `getMaterialReadableContent` 是研究读取边界。
- `ResearchSession` 是用户私有会话，`ResearchRun` 持有请求范围、来源快照、覆盖范围、结构化 blocks、AI Run、版本及保存状态。`ResearchResult` 是已保存的完成 Run；Project 分享产生可追踪的 Artifact，Agent 可引用已保存研究。
- 账号持续研究把最多 200 条作品证据和逐条简析保存在一次 `ResearchRun.coverage.accountResearch` 中。旧分析按正文哈希复用，但首次请求仍把逐条理解、跨作品比较和账号综合压在一个模型输出里。`workAnalyses` 有固定字段和最多 7 个推进字符串；没有独立的动态段落、注意力机制、Claim/Proof 链或可迁移机制。
- 详情页已有连续档案、证据弹层、作品库、最近/高表现对照、模板和历史。单条作品只能在弹层读 Material 及有限的账号级逐条简析，尚无独立的深度研究结果和创作交接。

## 2. 处置分类

| 分类 | 对象与决定 |
| --- | --- |
| KEEP | Workspace/User scope、Benchmark/Material 原件及观察值、ResearchSession/Run/Result 版本、Evidence 引用、ModelRouter/Provider、Agent 与 Artifact 的现有消费路径。 |
| EXTEND | ResearchScope 区分账号与单作品研究；Run 的版本化 JSON 快照承载作品理解、动态结构与机制；现有作品读取增加明确的研究证据快照；作品详情成为深入拆解入口。 |
| REPLACE | 账号研究首次调用“一次分析所有作品并直接综合”的编排；固定字段冒充每条作品都有 Hook/冲突/CTA 的输出语义；只按单层 topic 标签或指标次数解释内容规律。 |
| LEGACY_COMPAT | `BenchmarkStudy`、旧 Discovery、`MaterialAnalysis` / `MaterialDistillation`、既有 `accountResearch` V1 快照与历史结果均保持可读，不迁移或删除。 |

## 3. Work Analysis 稳定结构与动态 StructureBlock

先复用 `ResearchRun`，为每个用户、工作空间和作品使用确定的私有 `ResearchSession`；同作品各次分析是该 Session 的不可变 Run。`inputScope` 明确账号 ID、作品 ID、深度和研究问题；`coverage.workResearch` 保存带 schemaVersion 的证据与结构化结果。取当前作品最新完成 Run 时必须同时验证 workspace、用户、账号、作品、证据指纹和深度。此设计无需新表即可在 Phase 1～3 保留版本与复用结果；Phase 4 再用真实读取性能评估是否需要作品级索引/独立表。

共同核心使用可空字段回答内容主题、受众、场景、任务、认知变化、承诺、观点、推进和结尾目标；不存在的内容保持空。选题是领域、母题、人群、问题、场景、角度、承诺、信息缺口、意图及“为什么这个选题成立”的组合，不用预设类别。

`StructureBlock[]` 按实际内容生成任意数量段落：顺序、可用时的起止毫秒、逐字摘录、该段内容、作用、表达方式、Evidence 引用。另存动态发现的注意力、Proof、表达及其他机制，每项注明原文、推断/假设、适用条件和反例。可迁移机制与原题、原人名、原案例、原镜头分开，记录用户需要补齐的自有证据和可测试变量。没有视频时间码、视觉、评论或留存指标时，对应字段为空，不伪称观察过。

## 4. 研究流水线

| 阶段 | 输入与产出 |
| --- | --- |
| 0 Evidence Preparation | 服务端校验账号/作品/Material scope，从 `getMaterialReadableContent` 读取正文和真实 segments，合并作品元数据，生成不可变快照与指纹。视觉证据仅在实际存在时追加。 |
| 1 Work Understanding | 快速扫描当前可用作品，得出可追溯的选题理解；标题级与正文级明确区分。已有 V1 分析可读，但不当成 V2 深拆。 |
| 2 Work Deep Analysis | 用户指定或后续系统选择代表作品，针对单条真实正文、时间码和存在的视觉证据生成动态结构、注意力与证明机制、表达观察、可迁移机制及测试假设；结果按证据指纹版本化。 |
| 3 Pattern Discovery | 只汇总已完成的作品分析，发现母题、结构/Hook/Proof 家族、组合、异常和反例；每个模式保留作品与段落引用。 |
| 4 Account Synthesis / Evolution | 在模式之上复核账号级判断；按真实发布时间和历史快照比较变化，不把互动差异写成因果。 |
| 5 Transfer / Creation | 用户明确选自己的 Project、Material 与目标，Agent 消费结构化机制和引用，生成自有选题、脚本及拍摄方案，并记录待测试假设。 |

阶段是数据语义，不要求每阶段固定一次模型调用。快速扫描和统计尽量复用缓存/确定性计算；深拆与账号更新由用户主动触发。

## 5. Pattern、Evolution、Evidence 与创作边界

Pattern 不只计数，还回答出现于什么选题、如何开场、后续怎样推进、怎样证明、普通组有何同类、哪些高表现作品构成反例。内容母题允许多层和跨作品关系，随新证据更新。Evolution 比较有真实日期的作品分析和版本化快照，标明新增、加强、削弱、仍未支持的判断。

所有重要机制必须回到作品、逐字片段和可用时间码。Transcript 是机器识别，原文引用不等于外部事实核验；平台指标是观察值，不代表转化或完播。没有留存曲线时，“为何继续看”只能表述为内容设计假设。Agent 获取 Findings、Patterns、Work Analyses、Transfer Mechanisms、证据 refs 和范围；生成用户版本时读取其自己的 Project/Material，原表面元素仅供对照，不能换词复制。Research Finding 不自动升级为 Skill；未来 Review 可消费明确的测试变量，本轮不实现 Review。

## 6. Schema、迁移与成本

**Phase 1～3 不修改 Prisma Schema，也不执行 migration。** `ResearchRun` 的 `inputScope`、`coverage`、`sourceRefs`、`blocks`、`aiRunId`、`version` 足以形成用户私有的单作品研究版本；确定性 Session 键提供按作品定位。`AIRun` 保存 Provider/模型及用量，结果快照记录分析时间、深度和证据指纹。JSON 解析必须按版本分支，旧 Run 原样可读。长期按账号跨用户共享缓存、作品级数据库索引或正式 Work Analysis 表属于 Phase 4 的性能决定；若届时确需新表，只新增最小、可回滚的表与索引，并让业务代码和 migration 同一交付单元。

成本边界：证据哈希未变且深度相同则返回已完成版本，不发起 AI；同一作品并发请求由既有 Session 行锁/幂等 requestKey 合并；新正文、时间码或视觉版本变化才分析变更，手动重新研究显式产生新版本。按正文实际大小设置技术上下文上限并展示截断，不写固定作品数量门槛。输入、输出和失败用量继续记录于现有 `AIRun`/`ApiUsage`；Provider 不可用时保留旧结果。

## 7. UI、实施顺序与验收

账号档案的身份、数据范围、作品库、证据弹层、历史与结果交接继续用。提高作品研究库的位置，为作品提供独立详情；页面先展示“读懂了什么、怎么做、为什么可能有效、怎样迁移”，证据靠近判断，不堆指标卡、评分或警告。账号页之后再以作品分析构建动态内容地图，不以旧大报告为新中心。

1. Phase 1：完成本审计与真实样本证据核对，冻结 V1 兼容边界。
2. Phase 2：定义版本化单作品结构化输出、动态段落和证据校验；用真实有正文/只有标题/有无时间码样本验证。
3. Phase 3：交付单作品深度拆解的服务、主动触发 API、独立详情、缓存复用与保存结果/项目交接。先走一条真实公开视频与已有 Material/Transcript，不强求不存在的视觉输入。
4. Phase 4～5：按证据变化复用作品分析，做跨作品 Pattern Discovery。
5. Phase 6～8：账号综合、真实时间演化、高表现与普通组及反例。
6. Phase 9～10：基于自有 Project/Material 的创作交接，再调整账号页为内容地图。完整 V2 里程碑做 V3 验收。

Phase 2～3 的定向测试覆盖：权限隔离、单作品证据指纹、引用逐字校验、段落时间边界、缺失维度不造数、并发幂等、未变证据无模型调用、失败保留旧版本、历史不覆盖、保存后 Project/Agent 可读。浏览器验证真实作品、Transcript、动态段落、依据、结果保存及 1680/1366/390。真实模型输出需人工检查研究质量；测试 fixture 不能替代。

最易踩的坑：把标题当正文、把转录当画面、把点赞当留存或成交、把 AI 推断当事实；只校验引用 ID 不校验逐字片段；同证据因默认/显式范围写法不同重复计费；长文本截断后仍宣称完整分析；按 Run JSON 无界搜索形成性能问题；把账号 V1 结果或 Agent 私有信息误当作可跨用户缓存。

## Phase 1～3 实施记录

- 已完成当前架构审计、版本化单作品结构、主动深拆 API、独立作品页、原文/可用视频入口、动态段落、注意力/证明/表达观察、可迁移机制、测试变量、证据校验与缓存复用。没有修改 Schema 或执行 migration。
- 使用真实公开作品“家长没见过面就直接付费？！”及已保存机器文字稿验收。第一版模型结果有未核对数字，被拒绝且没有可用研究；第二版成功保存为 `ResearchRun cmul8vap900bpq9n8sjmctaqc`。模型实际返回 `deepseek-flash`，结果有 13 个动态结构段落、10 项实际发现的机制，逐字片段经服务端验证。人工核对：选题、推进、注意力假设、口述 Claim/Proof、表达和迁移条件具体；机器转写中的错词仍需原视频核对。
- 该作品没有已保存的本地视频资产和时间码，页面提供原作品/Material 链接并如实标示，不生成画面或时间定位结论。成功 AIRun 记录输入 2,798 token、输出 10,786 token；后续提示已收紧重复复述，新的成本效果尚未经付费复测。
- 已保存结果可进入现有 Result / Project 分享预览，结构化读取接口额外返回作品理解、段落、机制、可迁移步骤与引用。账号第 7 版仍独立存在；作品库将其区分为“深度拆解”。后续 Phase 4～10 与基于自有 Project/Material 自动生成成稿仍未实施。
