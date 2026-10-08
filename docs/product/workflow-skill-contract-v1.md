# 鑫世界 Studio Workflow Skill Contract v1

> **组合治理说明：** 本 Contract 描述“一项 Skill 自身的能力合同”，不再规定 Agent 全局只能有一个主 Skill，也不规定全局固定执行顺序。多个 Skill 的适用性、冲突、部分采用和顺序由 [Agent + Skill Resolver v1](./agent-skill-resolver-v1.md) 在当前任务中判断。
>
> `outputType`、`outputRequirements` 和 `steps` 是该 Skill 的建议与边界，不是所有 Agent 任务的全局输出 Schema 或固定 DAG。系统硬安全规则始终优先。

状态：P5.1 设计稿。本文只定义 Contract、解析边界和架构映射，不包含 API、UI、Prisma、LLM runtime 或导入实现。

## 1. Product Definition

### 1.1 一句话定义

Workflow Skill 是一份由外部高能力 GPT 或人工整理的、可读且可解析的“创作方法合同”：它规定如何组织输入、执行表达步骤和输出文案，但不决定任何事实是否真实。

产品链路是：

外部 GPT 生成 Markdown 创作方法 → 人工导入与检查 → Studio 保存为创作方法并版本化 → 当前任务加载一组可用 Skill → Agent Resolver 判断适用性、冲突和组合方式 → 内部 Agent 结合当前资料执行 → 记录实际采用的版本和用户反馈。

核心分工：

- 外部决策：负责把经验、步骤、判断习惯和表达要求整理成 Markdown Contract。
- 内部执行：负责解析、版本化、权限、上下文组装、事实安全、模型调用和使用记录。
- 事实来源：由当前资料、EvidenceItem、creator profile、项目上下文和 FactGate 提供；Skill 不能成为事实来源。

### 1.2 Skill 不是“大 Prompt”

Skill 不是把整篇 Markdown 原样拼进 system prompt，也不是某家模型的私有 prompt 格式。

V1 将它拆成可检查的结构：

- 基本信息和输出类型
- 适用场景
- 输入要求
- 有序执行步骤
- 判断规则
- 表达规则
- 禁止事项
- 输出要求
- 事实边界
- 来源说明
- 可选示例

执行时，系统把这些结构化内容作为一种名为 METHOD_GUIDANCE 的上下文交给模型。它和资料正文、确认事实、外部参考分开，不允许混成一个无来源的大文本块。

### 1.3 用户语言

普通运营前端统一称为“创作方法”：

- 导入创作方法
- 方法名称
- 适用场景
- 输入要求
- 执行步骤
- 表达规则
- 禁止事项
- 输出要求
- 版本
- 保存

普通运营用户不应看到 Prompt Template、MethodVersion、Skill compiler、schema、agent tool、provider 等工程名。它们只能出现在受限诊断信息或开发文档中。

## 2. Markdown Contract

### 2.1 设计目标

V1 Markdown 必须同时满足：

1. 用户可以直接在 ChatGPT 中生成和阅读。
2. 用户不需要书写 JSON、YAML 或 DSL。
3. 章节名称稳定，系统可以按固定规则解析。
4. 缺失章节、重复章节、空内容和错误列表格式都能指出具体位置。
5. 不把原始稿件、完整资料或隐私永久复制进创作方法。
6. 解析后的方法与模型无关，不依赖 Kimi、DeepSeek 或任何 tool calling 格式。

### 2.2 最终章节结构

V1 使用一个顶级标题和固定的二级章节。二级章节名称是解析契约的一部分，普通文字可在章节内部自由表达。

~~~text
# 创作方法：方法名称

## 基本信息

## 适用场景

## 输入要求

### 系统自动提供

### 用户补充

### 前置条件

## 执行步骤

## 判断规则

## 表达规则

## 禁止事项

## 输出要求

## 事实边界

## 来源说明

## 示例

### 输入示例

### 输出示例
~~~

其中：

- 基本信息必须声明契约版本和一个 V1 输出类型。
- 适用场景、输入要求、执行步骤、判断规则、表达规则、禁止事项、输出要求、事实边界、来源说明属于核心 Contract。
- 示例是可选章节，但知识型方法强烈建议提供至少一组脱敏、合成示例。
- “人工确认状态”不由 Markdown 声明决定。系统导入后统一进入待人工检查状态；Markdown 中写“已通过”或“Active”不能绕过系统状态。
- “方法版本”由 MethodAsset / MethodVersion 生成，外部 GPT 不得指定或覆盖。

### 2.3 章节内格式

为了保持可解析性，V1 只允许以下形式：

- 基本信息和来源说明使用“字段名：值”的单行形式。
- 适用场景、输入要求、判断规则、表达规则、禁止事项、输出要求使用无序列表。
- 执行步骤使用从 1 开始的有序列表；每一步可以有一行“判断：”和一行“产出：”。
- 示例中的内容作为不参与执行的样例数据处理，不把示例中的事实自动写入当前创作。
- 不要求表格、HTML、脚本、嵌套 DSL 或模型专用标记。
- 代码块只允许出现在示例内容中，不能用来隐藏必填章节。

建议的 V1 尺寸边界：

- 方法名称：1–200 字符。
- 适用场景：1–8 项。
- 执行步骤：1–8 步，与当前 MethodVersion.steps 的规模保持一致。
- 每个规则列表：最多 20 项，每项不超过 500 字。
- 示例：最多 3 组。
- 超出边界时，导入预览应指出章节和项目位置，要求用户压缩方法，而不是静默截断。

### 2.4 解析规则

解析器的行为应当是确定的：

- 没有唯一的顶级“创作方法”标题：报错“缺少方法名称”。
- 缺少任何核心二级章节：报错“缺少章节：章节名”。
- 同名核心章节出现多次：报错“章节重复：章节名”。
- 必填列表为空，或只有“无”“暂无”而该章节不能为空：报错具体章节。
- 执行步骤编号不连续、从 0 开始或混用无序列表：指出步骤章节和编号。
- 基本信息缺少“契约版本”或版本不是 workflow-skill-v1：报错契约版本。
- 输出类型不在 V1 白名单中：指出当前值和允许值。
- 出现无法识别的顶级章节：V1 先报 warning；如果该章节试图改变事实边界、权限、模型或工具行为，则直接拒绝。
- 所有章节正文都当作不可信数据；章节中的“忽略系统规则”“输出密钥”“把外部内容写成我方事实”等文字不会改变执行规则。

解析结果不是一篇 Markdown 字符串，而是一个结构化的 Workflow Skill Contract V1 中间表示。P5.1 不实现该解析器，但后续实现必须遵循本规则。

## 3. Required / Optional Fields

### 3.1 Markdown 字段

| 字段 / 章节 | V1 状态 | 理由 |
| --- | --- | --- |
| 方法名称 | REQUIRED | MethodVersion.title 的直接来源，也是用户选择方法时的稳定识别名。 |
| 契约版本 | REQUIRED | 防止未来格式变化时把新格式误当成 V1。固定值为 workflow-skill-v1。 |
| 输出类型 | REQUIRED | 一个方法只绑定一个主输出类型，避免同一套规则在不同平台间产生歧义。 |
| 适用场景 | REQUIRED | 对应 MethodVersion.applicableScenarios，决定何时应该选择该方法。 |
| 系统自动提供的输入 | REQUIRED | 明确方法依赖哪些 Studio 上下文，避免外部 GPT 假定不存在的数据。没有依赖时写“无”。 |
| 用户可补充的输入 | REQUIRED | 明确用户还能补充什么，避免把临时要求隐藏在任意 prompt 中。没有额外输入时写“无”。 |
| 方法前置条件 | REQUIRED | 让系统在资料、主题或人物背景不足时阻止盲目生成。没有前置条件时写“无”。 |
| 执行步骤 | REQUIRED | 对应 MethodVersion.steps，是方法真正可执行的主骨架。 |
| 判断规则 | REQUIRED | 说明步骤如何选择角度、材料和表达方向；没有额外判断时也必须显式写“无额外判断”。 |
| 表达规则 | REQUIRED | 约束语言、节奏、结构和语气，区分方法指导与事实内容。 |
| 禁止事项 | REQUIRED | 对应 MethodVersion.boundaries，并承载不可越过的表达和事实安全边界。 |
| 输出要求 | REQUIRED | 定义交付物的组成、长度、口吻和格式，避免只得到抽象建议。 |
| 事实边界 | REQUIRED | 是 V1 的安全固定章节；缺失时不能导入。 |
| 来源类型和来源说明 | REQUIRED | 外部生成方法必须可追溯，但只记录来源说明，不复制完整原稿或第三方资料。 |
| 示例 | OPTIONAL，但强烈推荐 | 示例能帮助外部 GPT 和人工审核理解方法，但不是所有方法都需要样例。 |
| 引用 / references | OPTIONAL | 有真实方法依据时可提供脱敏引用或来源标识；不能把引用自动升级为我方事实。 |
| 人工确认状态 | SYSTEM-MANAGED | 不接受 Markdown 自称 ACTIVE；导入统一进入待审核的现有 SAVED 语义。 |
| MethodVersion 版本号 | SYSTEM-MANAGED | 由导入和编辑流程生成，避免外部文件覆盖历史版本。 |

### 3.2 允许的来源类型

V1 的来源类型是审计标签，不是 runtime provider：

- EXTERNAL_GPT：外部 GPT 整理的方法。
- HISTORICAL_DRAFT：来自自己的历史稿件或手工总结。
- BENCHMARK_RESEARCH：来自对标研究结果。
- INTERNAL_METHOD：公司内部已经审核的方法。
- IP_STRATEGIST_REFERENCE：参考 ip-strategist 等方法论 adapter 的结构，但不是其 runtime。

来源说明只记录“来源是什么、为何导入、是否为合成示例”等简短信息。不得把完整历史稿、第三方全文、私密客户信息或 API 配置作为 Skill 永久内容。

## 4. Input Contract

### 4.1 系统自动提供

执行时由 Studio 负责组装，Skill 不要求运营人员手工复制：

- 当前创作任务、CreativeBrief、主题、角度、受众、核心命题和目标。
- 当前资料及其可读正文，包括文字稿、PDF/DOCX/TXT 读取内容和允许使用的来源引用。
- 已确认的 EvidenceItem、事实引用和来源定位。
- CreatorProfile 中已经确认的定位、受众、语气、偏好和禁用表达。
- 用户本次创作请求、输出平台和输出类型。
- 当前选择的创作方法版本，以及当前稿件或选中的上下文。
- ContextManifest 中的 methodVersions、confirmedInformationRefs、sourceRefs、externalRefs 和 ownership 标记。
- provider-neutral 的模型请求信息；不向 Skill 暴露 API Key、Resource ID、Provider internal id 或模型私有格式。

### 4.2 用户允许补充

用户可以在当前创作中补充：

- 本次主题、角度或切入问题。
- 受众、时长、语气和平台偏好。
- 希望优先使用的资料或某个已存在的 EvidenceItem。
- 本次特殊表达要求。
- 对方法步骤的选择或本次明确不采用某项建议。

用户临时写入的事实仍需通过现有资料、EvidenceItem 和 FactGate 流程确认；用户把一句话写在补充要求里，不会自动成为 OWN_CONFIRMED。

### 4.3 Skill 自己声明的前置条件

Skill 可以声明：

- 必须有一条当前资料或文字稿。
- 必须有一个明确主题或问题。
- 必须有受众或输出时长。
- 必须有一条已确认的创作者观点。

系统在执行前检查这些前置条件。缺失时应向用户指出“缺少什么”，请求补充或允许跳过；不能让模型用虚构内容填充缺口。

Skill 不得声明或接收：

- 数据库查询语句、系统 prompt、API Key、Provider 配置。
- 修改 EvidenceItem ownership/status 的权限。
- 创建、删除或调用工具的隐式指令。
- 用完整原始稿件替代当前资料来源的要求。

## 5. Output Contract

### 5.1 V1 推荐：一个 Skill 绑定一个主输出类型

> 本节约束的是“单项 Skill 自己提供什么 outputContract”，不是通用 Agent 的全局输出格式。G1.1 允许一个任务加载多个 Skill；最终是否采用某个 Skill 的 outputHints / outputContract，由 Resolver 根据当前任务判断。

V1 选择 A：一个 Skill 绑定一个主输出类型。

理由：

- 当前 MethodVersion 没有独立的输出类型字段，单一绑定最容易稳定映射。
- 抖音和视频号虽然都可能是口播，但节奏和交付要求不同，应该由两个方法明确声明，而不是一个方法内部隐式分叉。
- 小红书推文和朋友圈短文案的结构、长度和发布场景差异更大。
- 单一输出类型更容易做人工预览、版本比较和 MethodUsage 追踪。

V1 允许的输出类型：

| Contract 值 | 用户语言 |
| --- | --- |
| DOUYIN_SPOKEN | 抖音口播稿 |
| WECHAT_CHANNELS_SPOKEN | 视频号口播稿 |
| XIAOHONGSHU_POST | 小红书推文 |
| WECHAT_MOMENTS_COPY | 朋友圈短文案 |

不在 V1 扩展公众号、PPT、邮件、广告投放文案或其他输出场景。

### 5.2 输出内容

一个执行结果至少包含：

1. 符合所声明输出类型的主文案。
2. Skill 要求的结构元素，例如标题、开头、正文和结尾。
3. 需要用户确认的事实或信息清单。
4. 必要时保留 Evidence 引用或来源定位，供 Studio 审核。

“事实清单”和“待确认项”是辅助结果，不是让模型自行补事实的入口。输出不能通过 Skill 直接创建确认事实。

## 6. Fact Safety

### 6.1 不可覆盖的规则

Workflow Skill 只能决定：

- 如何组织内容。
- 如何排序观点。
- 如何设计开头、转折、案例位置和结尾。
- 如何控制语气、节奏、篇幅和输出格式。

Workflow Skill 不能决定：

- 什么事实是真的。
- 某个外部案例是否属于创作者本人。
- 某项 Pending 信息是否可以确认。
- EvidenceItem 的 ownership、status、confirmedBy 或 rejectedBy。
- 是否可以把外部资料、假设、方法建议变成 OWN_CONFIRMED。

### 6.2 运行时边界

执行时，方法指导的 ownership 固定为 METHOD_GUIDANCE。FactGate 继续对整个上下文和候选输出运行：

- OWN_CONFIRMED：可以在符合上下文的范围内作为创作者事实使用，但 Skill 不能扩大它的含义。
- EXTERNAL：只能作为外部资料、比较或参考，不得写成我方经历、案例、数据或成绩。
- PENDING：必须保持待确认语义。
- HYPOTHETICAL：必须保持示例、假设或演练语义。
- METHOD_GUIDANCE：只能指导表达，不能作为事实依据。
- PROHIBITED：不得进入事实型输出。

现有 EvidenceItem 的 OWN / EXTERNAL / UNKNOWN 和 PENDING / CONFIRMED / REJECTED 状态仍是持久化事实边界；ContextManifest 和 FactGate 的 canonical ownership 是执行时的安全层。两者不能被 Skill 自己改写。

### 6.3 Skill 中的固定事实边界

导入时必须存在“事实边界”章节，并包含等价语义：

- 本方法只指导表达和组织，不确认任何事实。
- 外部、待确认、假设和方法指导不能写成我方已确认事实。
- 事实以 Studio 当前上下文、EvidenceItem 和 FactGate 为准。
- 如果方法规则与 OWN_CONFIRMED 或安全策略冲突，方法规则失效。

这部分不是普通用户可通过 Markdown 覆盖的 prompt；导入器应当使用系统固定规则补齐和校验。

## 7. Versioning

### 7.1 与现有模型的关系

P5.1 直接复用当前模型：

| Workflow Skill 概念 | 当前模型映射 | V1 规则 |
| --- | --- | --- |
| 方法容器 | MethodAsset | 一份独立导入的创作方法的生命周期和状态容器。 |
| 方法版本 | MethodVersion | 保存 title、steps、applicableScenarios、boundaries、evidence 和来源关联。 |
| 项目选中的版本 | ProjectMethodSelection | 选择时同时保存 methodAssetId 和 methodVersionId。 |
| 一次执行使用的版本 | MethodUsage | 关联 projectId、methodAssetId、methodVersionId、aiRunId 和 userId。 |
| 执行记录 | AIRun | 记录本次模型运行、provider-neutral 路由和上下文审计。 |
| 事实与引用 | EvidenceItem / ContextManifest | 不属于 Skill 版本内容，运行时按当前事实状态注入。 |

当前 MethodVersion 的直接可复用字段是：

- title ← 方法名称。
- applicableScenarios ← 适用场景。
- steps ← 执行步骤。
- boundaries ← 禁止事项和方法边界。
- evidence ← 来源引用、脱敏依据和定位信息。
- sourceItemId、sourceMaterialAnalysisId、sourceTranscriptId、sourceBenchmarkStudyId、sourceMaterialDistillationId ← 已存在的内部来源关联。

输入要求、判断规则、表达规则、输出要求和示例目前不是 MethodVersion 的独立一等字段。P5.1 不通过把它们偷偷拼进 steps 或伪装成 evidence 来解决；未来导入实现应明确增加一个可版本化的 Contract payload 映射，或在持久化方案中审慎扩展。本文不修改 schema。

### 7.2 导入、修改和同名处理

- 第一次导入一个外部 Skill：默认创建新的 MethodAsset，并创建版本 1。
- 修改已经导入的方法：必须显式选择已有 MethodAsset，然后创建新的 MethodVersion；不能覆盖旧版本。
- 同名但来源不同：默认创建新的 MethodAsset，并在预览中提示同名；不自动合并。
- 用户明确选择“更新已有创作方法”时，才允许将新内容作为该 Asset 的新版本。
- 旧版本永久保留，项目历史和 AIRun 不回写到最新版。
- ProjectMethodSelection 保存具体 MethodVersion；用户选择“换用最新版”才改变当前创作选择。
- 执行开始时，ContextManifest 和 MethodUsage 锁定具体版本。执行中修改方法只影响未来执行，不改变当前 AIRun。

### 7.3 复用现有状态

当前 MethodStatus 只有 SAVED、TRIAL、CORE、DISABLED，V1 不新增 DRAFT、REVIEWED、ACTIVE、ARCHIVED enum：

| 外部概念 | V1 现有状态语义 |
| --- | --- |
| 刚导入、待人工检查 | SAVED |
| 明确用于小范围试用 | TRIAL |
| 人工审核通过、可作为正式方法使用 | CORE |
| 停用或归档 | DISABLED |

外部 GPT 生成的 Skill 导入后只能是 SAVED，不能从 Markdown 声明为 CORE。当前模型没有独立的“审核人 / 审核时间 / DRAFT 与 REVIEWED 区分”字段，P5.1 不伪造这些能力；必要的状态转换和操作审计应由后续导入流程记录。

## 8. Import UX

V1 理想流程：

1. 用户点击“导入创作方法”。
2. 粘贴或选择 Markdown 文件。
3. 系统按固定章节解析。
4. 展示结构化预览：
   - 方法名称
   - 适用场景
   - 输入要求
   - 执行步骤
   - 判断规则
   - 表达规则
   - 禁止事项
   - 输出要求
   - 事实边界
   - 来源说明
   - 示例
5. 用户检查方法内容和来源说明。
6. 系统以 SAVED 状态保存为新的创作方法版本 1。
7. 用户可以稍后在“方法”中人工调整状态，或在具体创作中显式选择该版本。
8. 执行时记录具体 MethodAsset、MethodVersion 和 AIRun。

解析错误必须可操作：

- 缺少章节：显示“缺少章节：执行步骤”。
- 章节为空：显示“执行步骤至少需要 1 项”。
- 输出类型错误：显示当前值和四个允许值。
- 步骤编号错误：显示第几个步骤及正确格式。
- 事实边界缺失或试图放宽：显示“事实边界不可省略或覆盖”。
- 来源说明缺失：显示“请说明该方法来自哪里；不要粘贴完整原始稿件”。

前端只使用“创作方法”语言，不显示 AST、Parser、Schema、MethodVersion ID、Prompt、Compiler 或 provider。

## 9. Execution Model

### 9.1 推荐：混合模式 C

V1 推荐“规则预检 + 一次结构化 LLM 执行 + 确定性后检”的混合模式：

1. 系统先解析和校验 Contract，不调用模型。
2. 系统检查方法前置条件、输出类型、上下文权限和 FactGate。
3. 系统将完整的结构化 Skill Contract、当前资料、创作者输入和事实边界一次性提供给一次主 LLM 调用。
4. 模型按步骤顺序执行，但不为每一个步骤单独调用一次模型。
5. 系统对输出做格式、输出类型、事实边界和待确认项检查。
6. 失败时记录 AIRun 失败，不自动修改 Skill、不自动重试成另一种方法。

选择一次主 LLM 调用的原因：

- 当前项目已有 ContextManifest、FactGate、ModelRouter、AIRun 和结构化输出能力。
- 多次 LLM 调用会放大成本、延迟、上下文漂移和事实边界重复问题。
- Skill 步骤是执行顺序和判断指导，不代表必须拆成多个 agent。
- 后续如有明确的长流程需求，可以新增专门的 workflow 版本，不让 V1 依赖多 Agent。

### 9.2 Provider-neutral

Contract 只描述输入、步骤、规则和输出，不包含 Kimi、DeepSeek、模型 ID、tool calling、JSON mode 或私有 system prompt 语法。模型路由继续由现有 ModelRouter 和 LLM runtime 决定。

如果未来 DeepSeek tools 或其他 agent 能力出现，Skill V1 仍可作为普通上下文执行；tools 只能是 runtime 的可选能力，不是 Skill Contract 的必需字段。

## 10. Current Architecture Mapping

### 10.1 可以直接复用

- MethodAsset / MethodVersion：保存创作方法容器和历史版本。
- Method service 的 schema、并发版本检查和 audit log：复用现有 methodContentSchema、expectedVersion 和 method.version_created 语义。
- ProjectMethodSelection：让项目选择具体版本，最多 3 个补充方法的现有限制继续有效。
- ContextManifest.methodVersions：将选中的方法版本作为审计快照。
- FactGateV2：把方法作为 METHOD_GUIDANCE，保证方法只指导表达。
- AIRun / MethodUsage：记录方法版本和本次模型运行的关系。
- CreationFeedback / MethodUsageFeedback：记录最终采用情况和用户评分。

### 10.2 当前模型的缺口

当前 MethodVersion 不是完整的 Workflow Skill Contract 存储模型。它已有方法核心字段和来源证据，但没有独立字段保存：

- 输入合同。
- 判断规则。
- 表达规则。
- 输出合同。
- 示例。
- 外部来源类型和完整来源说明。
- 独立审核人、审核时间和审核状态。

P5.1 只记录这个边界。后续实现必须在设计持久化前决定是否增加版本化 Contract payload；不能把这些内容不透明地塞入 steps、boundaries 或 evidence。

### 10.3 执行审计

每次执行至少需要可追踪：

- MethodAsset ID。
- MethodVersion ID 和 version。
- Project ID。
- AIRun ID。
- 使用者。
- 当前 ContextManifest ID。
- 最终 CreationFeedback outcome。
- 若用户填写，MethodUsageFeedback rating。

V1 不做自动学习、不根据反馈自动重写 Skill、不自动提升状态。

## 11. Reuse Decisions

| 现有能力 | 决策 | 原因 |
| --- | --- | --- |
| MethodAsset / MethodVersion / MethodUsage | REUSE | 与创作方法、版本选择和执行记录的语义完全一致，是 Workflow Skill 的内部承载基础。 |
| FactGate / ownership / EvidenceItem | REUSE | 事实安全必须使用现有边界，Skill 不得另造一套“可信度”。 |
| DeepContentPackage | PARTIAL_REUSE | 复用它的 Evidence grounding、creatorContribution、needsConfirmation、Preview → Apply 和版本化思路；不把 DeepContentPackage 变成 Skill，也不让 Skill 依赖其全部字段。 |
| GPT Task Package | PARTIAL_REUSE | 复用外部 GPT handoff 的可读任务包、输出类型和来源纪律；它面向一次创作任务，Skill 面向可重复的方法版本，二者不是同一实体。 |
| Import GPT Draft | DO_NOT_REUSE | 它把最终稿导入 MotherContent，目标是内容结果，不是方法 Contract；复用会把“导入方法”和“导入成稿”混淆。 |
| cangjie | DO_NOT_REUSE | 当前仓库只把 cangjie 作为 reference-only 方法论思想，没有 runtime import；不引入其编译器、Extractor、并行处理或晋级流程。 |
| ip-strategist | PARTIAL_REUSE | 可借鉴 server-only adapter 的来源固定、版本号、章节分组、去重和上下文预算；不把它的内容包直接当成用户 Skill，也不把 adapter 变成 Skill runtime。 |

### 11.1 cangjie 的边界

cangjie 可以影响 Contract 的设计原则，例如“只沉淀可迁移的能力、明确边界、保留来源、不要把整本资料编译成 runtime”。但它不进入 V1 的解析、导入、执行或版本状态。

### 11.2 ip-strategist 的边界

ip-strategist adapter 值得借鉴：

- source、version、commit 等来源固定信息。
- 将长资料拆成有意义的 sections。
- 去重和上下文预算。
- 将“参考表达方法”与真实资料分离。

它不能成为：

- Workflow Skill 的默认内容。
- 外部 Markdown 的强制格式。
- 事实来源。
- 多 Agent 或工具调用 runtime。

## 12. V1 Boundaries

P5.1 只定义：外部生成、人工导入、解析、预览、保存、版本化、选择、执行和记录。

V1 明确不做：

- 自动生成 Skill。
- AI 自动选择 Skill。
- Skill 自动路由。
- 复杂 DSL。
- Skill marketplace。
- Skill 分享社区。
- Skill 自动优化或自动学习。
- 多 Agent workflow。
- Tool calling DSL。
- 自动 Prompt 编译器。
- 用 Skill 覆盖 FactGate、ownership 或 EvidenceItem。
- 用 Skill 把外部资料升级成 OWN_CONFIRMED。
- 公众号、PPT、邮件和其他未列出的输出场景。
- 本轮任何 Prisma、API、UI、Method service、LLM runtime、Canvas、资料库或 Discovery 开发。

## 13. Example Skill

以下示例是合成内容，只用于说明格式，不对应真实人物、账号、客户、数据或业务案例。

~~~markdown
# 创作方法：知识型短视频口播·问题—判断—行动

## 基本信息

- 契约版本：workflow-skill-v1
- 输出类型：DOUYIN_SPOKEN
- 适用时长：60–90 秒

## 适用场景

- 需要把一个知识问题讲得清楚，并给出可执行的下一步。
- 当前资料已有可读正文，但还没有形成适合口播的结构。
- 不适用于需要大量真实数据证明、复杂采访或专业资质判断的主题。

## 输入要求

### 系统自动提供

- 当前创作主题、受众和核心命题。
- 与主题相关的已确认资料和 Evidence。
- 创作者已确认的观点、定位和表达偏好。
- 当前输出类型和用户本次创作要求。

### 用户补充

- 本次最想回答的一个问题。
- 希望观众看完采取的一个动作。
- 希望保留或避免的语气。

### 前置条件

- 至少有一个明确问题。
- 至少有一条可引用的已确认内容，或明确标记为个人判断。
- 没有已确认内容时，只能生成观点表达和待补证据清单，不能虚构案例或数据。

## 执行步骤

1. 把主题压缩成一个具体问题，删除同时回答多个问题的分支。
2. 从当前资料中找出支持该问题的已确认内容，并区分事实、外部参考和个人判断。
3. 先给出一句清晰判断，再解释为什么这个判断值得关注。
4. 用一个简单的行动步骤把判断落到观众下一步能做的事情上。
5. 按“开头抓住问题—中段解释判断—结尾给出行动”的顺序写成自然口播稿。
6. 检查所有事实、案例和数字是否有当前上下文支持，未支持的内容改成待确认提示。

## 判断规则

- 只保留一个主问题和一个主判断。
- 如果资料之间存在冲突，保留冲突并标记需要确认，不擅自选择看似合理的一方。
- 如果只有外部案例，没有创作者自己的确认经历，不得写成“我做过”或“我的客户”。
- 如果没有数据，不用数字制造确定感。
- 优先选择能改变观众下一步行为的判断，而不是泛泛总结。

## 表达规则

- 开头先说具体问题或常见误区，不用空泛口号。
- 每段只承担一个意思，句子适合自然念出。
- 使用清楚、克制、直接的中文，不模仿任何具体人物或账号。
- 判断和事实分开表达：事实说明依据，判断说明立场。
- 结尾给一个低门槛、可验证的行动建议。

## 禁止事项

- 不虚构人物、客户、收入、销量、时间、研究结果或案例。
- 不把资料中的外部内容写成创作者自己的经历。
- 不把示例、假设、方法建议写成已经发生的事实。
- 不使用材料中没有依据的因果结论。
- 不复制来源原文的连续长段落。
- 不用“保证”“一定有效”“所有人都适用”等绝对承诺。

## 输出要求

- 输出一篇 60–90 秒中文口播稿。
- 先给一个不超过 20 字的标题。
- 正文包含开头、判断、解释、行动建议四个自然段。
- 另外给出两个不同方向的开头备选。
- 最后列出“需要确认”的事实；没有时写“无”。

## 事实边界

- 本方法只决定表达和组织，不确认任何事实。
- 外部、待确认、假设和方法指导不能写成我方已确认事实。
- 事实以 Studio 当前上下文、EvidenceItem 和 FactGate 为准。
- 如果本方法与 OWN_CONFIRMED 或系统安全边界冲突，以事实和安全边界为准。

## 来源说明

- 来源类型：EXTERNAL_GPT
- 来源说明：用于演示的合成知识型口播方法，不对应真实人物、账号或原始稿件。
- 引用 / references：无；执行时只使用 Studio 当前提供的资料和 Evidence。

## 示例

### 输入示例

- 主题：为什么很多知识类短视频讲完以后观众仍然不知道下一步做什么。
- 已确认内容：当前资料只支持“信息太多会增加理解负担”这一判断。
- 用户补充：希望观众看完能立刻改一个动作。

### 输出示例

标题：讲清楚，不等于讲得更多

很多知识类视频的问题，不是内容少，而是观众听完以后不知道先做什么。

如果一条视频同时解释背景、方法、案例和所有例外，信息会越来越多，但行动入口反而越来越模糊。更有效的做法是，先回答一个具体问题，再给一个今天就能尝试的动作。

你可以先把下一条内容改成三句话：我想解决什么问题、我的判断是什么、观众现在做哪一步。先把这三句话说清楚，再考虑要不要增加更多内容。

需要确认：无。
~~~
