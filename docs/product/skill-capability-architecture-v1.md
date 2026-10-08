# 鑫世界 Studio Skill 能力架构 v1

> **部分治理规则已被 G1.1 `Agent + Skill Resolver` 模型取代。**
>
> 本文仍保留 P5.2 的 Skill 类型、权限、安全边界和生命周期参考，但以下旧组合规则不再是当前规范：
>
> - “同一轮最多选择一个主创作 Skill”；
> - “主 Skill / AUX / CHECK”是固定硬层级；
> - 两个创作 Skill 必须先选择一个、不能由 Agent Resolver 组合；
> - Skill 必须按本文固定顺序执行；
> - 公司默认方法与用户方法作为两个完整方法层同时注入。
>
> 以上规则标记为：`SUPERSEDED BY SKILL RESOLVER MODEL`。
> 当前组合、冲突判断、跳过、自动调用和流式状态以 [Agent + Skill Resolver v1](./agent-skill-resolver-v1.md) 为准。FactGate、Evidence、ownership、Workspace 权限和人工确认边界仍然有效，未被取代。

状态：P5.2 历史设计稿；组合语义部分已被 G1.1 修订。

本文建立在 Workflow Skill Contract v1 之上，只定义 Skill 类型、调用方式、执行顺序、权限、冲突规则、外部机制吸收方式和 V1 边界。

本轮不开发：

- Skill runtime
- @ mention UI 或 API
- capability registry 实现
- Skill importer
- Prisma / migration
- Method service 改造
- LLM runtime 改造
- Canvas、资料库、Discovery 或 Publishing 改造

## 1. Product Goal

### 1.1 产品目标

鑫世界 Studio 的 Skill 能力不是一个开放的“提示词市场”，而是一组受事实边界和人工确认约束的创作方法能力。

它解决四类问题：

1. 让普通运营选择一个已经审核过的创作方法。
2. 让用户对已有稿件执行受控的润色和审核。
3. 让方法负责人从内部资料提炼新的创作方法。
4. 让方法负责人诊断和优化方法本身，而不是让系统静默改掉生产方法。

### 1.2 外部决策，内部执行

- 外部 GPT：可以帮助用户提出、整理或蒸馏方法。
- 鑫世界 Studio：负责导入、预览、版本化、事实安全、权限、执行和记录。
- 内部模型：只消费经过 Contract 约束和 FactGate 处理的结构化能力。

所有外部 Skill 进入鑫世界后，都必须变成符合 Workflow Skill Contract v1 的“创作方法能力”，不能直接把外部仓库的 SKILL.md 当作生产 runtime。

### 1.3 能力分层

V1 架构定义六类能力，但普通用户和管理员看到的入口不同：

| 能力类型 | 用户语言 | 普通用户可调用 | 管理员 / 方法负责人 |
| --- | --- | --- | --- |
| 创作 Skill | 创作方法 | 可以 | 可以 |
| 润色 Skill | 润色能力 | 可以 | 可以 |
| 审核 Skill | 审核能力 | 可以 | 可以 |
| 诊断 Skill | 诊断方法 | 不直接显示 | 可以 |
| 优化 Skill | 优化方法 | 不直接显示 | 可以 |
| Skill 蒸馏器 | 提炼成方法 | 不直接显示 | 可以 |

普通用户不需要理解“Skill 类型”这个工程概念。他只需要搜索和选择“创作方法”“润色能力”或“审核能力”。

## 2. Skill Types

### 2.1 创作 Skill

作用：从当前资料、主题和用户要求生成新的内容初稿。

典型能力：

- 老板知识口播
- 产品种草
- 小红书干货
- 朋友圈短文案

输入：

- 当前资料
- 当前创作主题
- 用户补充要求
- 输出平台和输出类型
- 创作者已确认背景和表达偏好

输出：

- 标题
- 正文
- 约定的备选开头或结构变体
- 行动建议或 CTA（如果该方法要求）
- 需要人工确认的事实提醒

创作 Skill 可以组织事实，但不能创造事实。

### 2.2 润色 Skill

作用：对已有稿件做受控的二次修改。

典型能力：

- 去 AI 味
- 更自然
- 更口语
- 更简洁
- 调整节奏
- 适配已确认的品牌或创作者表达方式

输入：

- 当前稿件
- 用户明确的润色目标
- 当前资料和已确认事实
- 当前输出类型

输出：

- 修改后的稿件
- 必要时的修改摘要
- 仍需确认的事实提醒

润色 Skill 不负责：

- 添加新事实
- 发明案例
- 改写数字
- 把外部内容改成创作者经历
- 改变事实 ownership

### 2.3 审核 Skill

作用：检查成品是否符合事实、表达、平台和输出要求。

典型能力：

- 事实依据检查
- 外部内容误写成我方事实检查
- 表达风险检查
- 过度营销检查
- 依据缺失检查
- 输出格式检查
- Skill 规则是否被执行检查

默认行为：

审核 Skill 发现问题 → 标记问题 → 给出修改建议 → 等用户确认是否修改。

审核 Skill 默认不直接覆盖正文。只有用户明确选择“按建议修改”，才允许进入下一次润色或受控重写。

### 2.4 诊断 Skill

作用：检查 Skill、Prompt 或 Agent 配置为什么效果不好。

典型问题：

- 规则冲突
- 风格冲突
- 身份或角色锚定不清
- 规则堆砌
- 上下文过载
- 模糊要求
- 优先级错误
- Skill 与用户临时要求冲突
- 输出风格不稳定

诊断 Skill 的输出是：

- 问题清单
- 影响范围
- 具体证据
- 修改建议
- 建议优先级

诊断 Skill 不自动改生产方法。

### 2.5 优化 Skill

作用：基于真实测试样例生成 Skill 的候选新版本。

推荐流程：

Skill v1 → 测试 → 只修改一个主要维度 → 再测试 → paired comparison → 用户确认 → 候选 v2。

优化 Skill 不能：

- 直接覆盖当前 CORE 方法
- 静默改变当前 Active 选择
- 只依据一个绝对分数自动晋级
- 自动把自己的修改当成最终正确答案

### 2.6 Skill 蒸馏器

作用：从一批内部资料中提炼新的创作方法。

输入可以来自：

- 历史稿件
- 视频文字稿
- PDF / DOCX / TXT
- 资料库
- 对标研究结果
- 已确认的内容理解和内容提炼

输出：

- 创作方法候选稿
- 方法适用场景
- 执行步骤
- 判断规则
- 表达规则
- 禁止事项
- 来源说明
- 待人工确认项

Skill 蒸馏器不是普通创作 Skill。它属于方法创建工具，默认只对管理员或方法负责人开放。

## 3. @ Mention Model

### 3.1 普通用户体验

普通用户在 Agent 输入框中输入 @ 后，系统搜索统一能力注册表。

普通用户可看到：

- 创作方法
- 润色能力
- 审核能力

每项展示：

- 用户名称
- 一句话说明
- 适用场景
- 支持的输出类型
- 当前可用版本

普通用户不看到：

- capabilityType
- MethodAsset ID
- MethodVersion ID
- Prompt Template
- provider
- parser
- compiler
- Agent tool

### 3.2 管理员体验

管理员或方法负责人可以额外搜索：

- 诊断方法
- 优化方法
- 提炼成方法

管理员页面可以显示更多方法管理信息，但仍不把 AST、内部 schema 或 provider 作为普通产品语言。

### 3.3 V1 调用语义（历史规则，SUPERSEDED BY SKILL RESOLVER MODEL）

> 本节中的“选择一个主创作 Skill”和固定调用语义只保留为 P5.2 历史设计记录。G1.1 之后，用户可以加载一组 Skills，由 Resolver 判断使用、跳过、组合、顺序和是否需要确认。

示例：

- @老板知识口播
- @去AI味
- @事实检查
- @诊断方法
- @优化方法
- @提炼成方法

V1 的 @ 代表“选择一项能力”，不是让用户直接向任意内部工具发命令。

调用规则：

1. @ 后先匹配 enabled 且当前用户有权使用的能力。
2. 搜索结果优先按用户名称、别名、适用场景和输出类型匹配。
3. 同一轮最多选择一个主创作 Skill。
4. 普通运营不需要在生成前配置润色和审核能力；生成后按需调用。
5. 同一类型重复调用时，必须明确顺序；不能自动合并两套相互竞争的规则。
6. 诊断、优化和蒸馏不进入普通稿件生成链。

普通运营默认流程：

~~~text
资料 → 选择创作方法 → 生成 → 生成后按需润色 / 审核 → 用户确认 → 保存
~~~

但用户可以只调用其中一项，例如只做审核或只做润色。

## 4. Execution Flow

### 4.1 普通稿件生成

推荐顺序：

资料 → 选择创作方法 → 生成 → 生成后按需润色 / 审核 → 用户确认 → 保存

完整行为：

1. 读取当前资料、主题、用户补充要求和创作上下文。
2. 检查创作 Skill 的前置条件。
3. 生成初稿。
4. 生成完成后，用户按需选择润色或审核。
5. 如果用户选择润色，基于初稿生成候选版本；如果用户选择审核，输出审核标记和修改建议。
6. 用户确认是否采用审核建议。
7. 保存用户确认后的稿件。

如果用户已经有现成稿件，则跳过创作 Skill：

现有稿件 → 润色 Skill → 审核 Skill → 用户确认 → 保存。

### 4.2 诊断、优化和蒸馏链

它们操作的是“方法”，不是普通稿件：

- 蒸馏：内部资料 → 方法候选 → 人工审核 → 保存为 SAVED 方法。
- 诊断：方法 / Prompt / Agent 配置 + 失败样例 → 诊断报告 → 用户确认。
- 优化：方法 v1 + 测试样例 → 候选 v2 → paired comparison → 用户确认 → 新版本。

诊断、优化和蒸馏不能在一次普通生成中被隐式触发。

### 4.3 审核后的修改

审核 Skill 默认只读：

审核 → 标记问题 → 用户选择问题 → 润色或重写 → 再审核。

禁止：

审核 Skill 直接覆盖用户正文。

## 5. Priority / Conflict Rules

### 5.1 三层优先级

#### 第一层：系统硬规则

不可被覆盖：

- FactGate
- ownership
- Evidence 边界
- Workspace 权限
- 隐私和安全规则
- 真实数据边界
- 删除、发布、修改重要内容等确认规则
- Provider、数据库和系统配置安全规则

#### 第二层：Skill

Skill 决定：

- 表达
- 结构
- 风格
- 方法
- 输出组织
- 审核维度

#### 第三层：本次用户临时要求

用户可以临时调整：

- 更短
- 更口语
- 更温和
- 只要一个开头
- 不要额外 CTA
- 先输出正文再输出建议

### 5.2 用户何时可以覆盖 Skill

用户临时要求可以覆盖 Skill 的可调表达参数：

- 长度
- 语气
- 节奏
- 开头数量
- 是否需要 CTA
- 输出展示顺序
- 是否只保留某一步

用户临时要求不能覆盖：

- 系统硬规则
- 事实来源
- ownership
- Evidence 状态
- 权限
- Skill 的输出类型绑定
- 禁止虚构、禁止外部事实升级等安全边界

如果用户想换输出类型，系统应推荐切换到支持该类型的创作 Skill，而不是强行改写当前 Skill。

### 5.3 Skill 冲突政策（历史规则，SUPERSEDED BY SKILL RESOLVER MODEL）

> 本节原先要求两个创作 Skill 之间先选择一个主方法；该硬限制已撤销。系统硬规则仍然优先，其他冲突由 Resolver 按当前任务、用户要求和 Skill metadata 判断。

#### Skill 与系统硬规则冲突

系统硬规则获胜，Skill 中冲突部分被忽略，并向用户显示简短原因。

#### Skill 与用户临时要求冲突

- 表达参数冲突：用户临时要求优先。
- 方法核心步骤冲突：先询问用户是否跳过该步骤。
- 安全、事实和权限冲突：用户要求无效，必须拒绝或改为安全替代。

#### Skill 与 Skill 冲突

- 创作 Skill 负责生成内容。
- 润色 Skill 只能修改表达，不重建事实。
- 审核 Skill 只标记问题，默认不改正文。
- 诊断、优化和蒸馏不进入普通生成链。
- 两个创作 Skill 同时出现时，不自动拼接；要求用户选择主方法。
- 两个润色 Skill 同时出现时，要求用户确定顺序；后一个只能处理前一个的输出。

具体例子：

| 冲突 | 处理 |
| --- | --- |
| Skill 要 3 个开头，用户要 1 个 | 允许用户覆盖 |
| Skill 要直接语气，用户说这次温和一点 | 允许用户临时覆盖 |
| Skill 禁止虚构案例，用户要求编一个客户案例 | 拒绝虚构，可提供“待补真实案例”占位 |
| Skill 只使用确认事实，用户要求补充数字 | 拒绝未经确认数字 |
| 两个创作 Skill 同时生成 | 要求选择一个主创作方法 |

## 6. User vs Admin Permissions

### 6.1 普通运营

可以：

- 选择已启用的创作方法。
- 使用 @ 创作方法。
- 使用 @ 润色能力。
- 使用 @ 审核能力。
- 调整本次长度、语气、CTA 和开头数量。
- 查看审核标记。
- 确认或拒绝审核建议。
- 提供使用反馈。

不能：

- 修改系统硬规则。
- 修改 FactGate。
- 修改 Evidence ownership 或确认状态。
- 直接把外部方法设为 CORE。
- 自动优化正式方法。
- 修改其他人的正式方法。
- 让 Skill 自动路由或调用外部工具。

### 6.2 管理员 / 方法负责人

可以：

- 导入和创建方法候选。
- 使用 Skill 蒸馏器。
- 诊断方法、Prompt 和 Agent 配置。
- 生成候选方法 v2。
- 查看 paired comparison。
- 人工确认方法版本。
- 将 SAVED / TRIAL 方法提升为 CORE。
- 禁用或归档方法。
- 查看来源、版本和使用记录。

仍不能：

- 修改系统事实安全边界。
- 用 Skill 将外部资料提升成 OWN_CONFIRMED。
- 绕过必要的用户确认。

## 7. Humanizer Integration

### 7.1 外部机制

Humanizer-zh 的核心机制包括：

- 识别常见 AI 写作模式。
- 删除填充短语和宣传腔。
- 打破公式化结构。
- 变化句子节奏。
- 保留原意。
- 匹配原有语调。
- 增加具体观点和真实声音。
- 不把“去 AI 味”理解成欺骗检测器。

它还强调 24 类常见模式，包括夸大意义、模糊归因、宣传性语言、过度连接词、否定式排比、三段式滥用、破折号过多、套话和通用积极结论。

### 7.2 鑫世界原生能力

决策：REIMPLEMENT_MECHANISM。

未来能力名称：

- 去 AI 味
- 更自然
- 更口语
- 去模板感

进入鑫世界后必须重写为：

- 保留原始事实、数字、人名和核心结论。
- 不增加案例、数据或经历。
- 先诊断再改写。
- 输出修改后的文本和必要的修改说明。
- 保留原始内容的语气目标，不能把所有内容统一改成一种“人味”。

不直接复制 Humanizer-zh 的规则长文、示例或完整 SKILL.md。

### 7.3 运行边界

Humanizer 是润色能力，不是创作能力，也不改变事实层。它的结果仍需经过审核能力或 FactGate。

## 8. Nuwa Integration

### 8.1 外部机制

Nuwa 的核心机制包括：

- 明确人物或主题后进行资料采集。
- 从材料提取心智模型。
- 提取决策启发式。
- 提取表达 DNA。
- 提取反模式和不做什么。
- 明确诚实边界和来源追踪。
- 用公开问题验证提炼后的 Skill 是否保真。
- 生成自包含、可运行的 Skill 结构。

Nuwa 将“怎么说、怎么想、怎么判断、什么不做、知道什么局限”分层，这是对方法提炼有价值的结构。

### 8.2 鑫世界原生能力

决策：REIMPLEMENT_MECHANISM。

未来能力名称：

- 提炼成创作方法
- 从历史稿件提炼方法
- 从资料库生成方法候选

鑫世界版本优先：

- LOCAL MATERIAL FIRST。
- 优先使用用户历史稿、文字稿、PDF、DOCX、资料库和对标研究。
- 每条方法结论保留来源说明和待确认项。
- 不默认联网大规模搜索。
- 不把人物角色扮演直接当作事实。
- 不把一个人的公开表达等同于其真实内心。
- 保留“无法从公开资料确定”的边界。

输入一批历史口播稿后，蒸馏器应产出 Workflow Skill Contract 候选，而不是直接生成 CORE 方法。

## 9. Darwin Integration

### 9.1 外部机制

Darwin Skill 的关键机制包括：

- 单一可编辑资产。
- 结构评分和实测效果双重评估。
- 测试提示词和 baseline。
- 一次只改一个主要维度。
- paired comparison。
- 独立 judge，避免自己改自己评。
- keep / revert 棘轮。
- failure mode encoding。
- actionable specificity。
- blacklist 和高风险操作禁令。
- human checkpoint。
- 效果提升不足时早停。

### 9.2 鑫世界原生能力

决策：PARTIAL_ADAPT。

保留：

- Skill v1 → 测试 → 候选 v2 → 对比 → 人工确认。
- 同一批测试样例的 paired comparison。
- 一轮只优化一个主要维度。
- 人工 checkpoint。
- 失败模式清单。
- 不足以证明改进时保持旧版本。

重写：

- 不使用 git reset --hard 作为业务回滚。
- 不由自动评分直接晋级 CORE。
- 不让被优化的 Skill 自己充当唯一 judge。
- 不自动提交、push 或改变生产方法。
- 不以绝对分数作为唯一保留条件。

V1 的优化结果只能是候选版本，不得覆盖当前 CORE 版本。

## 10. Freud Integration

### 10.1 外部机制

Freud Skill 的有效机制包括：

- 先做健康体检，判断是否真的需要重写。
- 诊断身份、规则、正面定义和否定规则之间的冲突。
- 检查角色或风格的一致性。
- 识别模糊身份锚定。
- 识别规则堆砌和工作空间过载。
- 检查隐藏的优先级冲突。
- 诊断先输出问题摘要，再等待确认，再重写。
- 输出 before / after 和每处修改理由。
- 复杂任务才启用认知准备，避免过度工程。

### 10.2 鑫世界原生能力

决策：REIMPLEMENT_MECHANISM。

未来能力名称：

- 诊断方法
- 诊断 Agent 设置
- 诊断输出不稳定

鑫世界只吸收可观察、可操作的部分：

- 规则冲突
- 风格冲突
- 上下文过载
- 模糊要求
- 优先级错误
- 输出格式不一致
- 方法声明与用户临时要求冲突

不把“模型内部人格空间、情绪向量或意识状态”当作鑫世界的可验证事实，也不把 Freud 的心理隐喻直接变成 runtime 机制。

默认流程：

诊断 → 问题清单 → 修改建议 → 用户确认 → 候选新版本。

诊断能力不能自动改生产 Skill。

## 11. Copywriting Integration

### 11.1 外部机制

Copywriting Skill 适合吸收的不是完整营销规则，而是通用执行结构：

- Pre-Writing Checks。
- 先确认受众、目标、offer 和读者认知阶段。
- Hook discipline。
- critique before rewrite。
- 保留原稿中有效的句子、证明和事实。
- concision pass。
- 清晰优先于聪明。
- 具体优先于模糊。
- truth over hype。
- proof provenance。
- post-generation review。
- 输出格式固定。

### 11.2 鑫世界原生能力

决策：REIMPLEMENT_MECHANISM。

重写为 provider-neutral 的通用 Workflow Skill 执行结构：

1. 预检：目标、受众、输出类型、资料依据、语气和禁止事项。
2. 主生成：按创作方法生成正文。
3. 后检：清晰度、紧凑度、Hook、事实依据、输出格式和平台要求。

不直接搬运完整营销公式、长篇示例、销售话术或作者文章。

Copywriting 的 truth over hype 与鑫世界 Fact Safety 兼容，但“使用具体数字”必须服从当前确认资料，不能为了具体而编造数字。

## 12. Fact Safety

五个外部 Skill 进入鑫世界后都必须服从同一事实安全层：

第一层：系统硬规则

- FactGate
- ownership
- EvidenceItem
- Workspace permissions
- 隐私和安全边界

第二层：Skill 能力

- 创作 Skill 决定结构和表达。
- 润色 Skill 修改语言。
- 审核 Skill 标记问题。
- 诊断、优化和蒸馏操作方法本身。

第三层：用户临时要求

- 可以调整长度、语气、CTA、开头数量。
- 不能覆盖事实、安全、权限和来源要求。

任何外部 Skill 都不能：

- 把 EXTERNAL 改成我方经历。
- 把 HYPOTHETICAL 写成真实案例。
- 把 METHOD_GUIDANCE 当作事实。
- 改写数字、人物、日期或结果而不保留依据。
- 修改 EvidenceItem 的状态。
- 自动确认用户没有确认的内容。

## 13. Skill Lifecycle

V1 复用当前 MethodStatus，不新增新的状态 enum：

| 生命周期阶段 | 现有状态 | 说明 |
| --- | --- | --- |
| 导入候选 | SAVED | 已保存，等待人工检查，不自动成为正式默认方法。 |
| 小范围试用 | TRIAL | 方法负责人允许试用并收集反馈。 |
| 正式可用 | CORE | 人工确认后的正式方法。 |
| 停用 / 归档 | DISABLED | 不再出现在普通用户可选列表中，历史使用记录保留。 |

版本规则：

- 新导入：新 MethodAsset + MethodVersion v1。
- 修改：同一 Asset 新建 MethodVersion。
- 项目选择：锁定具体 MethodVersion。
- 运行执行：锁定该版本的使用记录。
- 优化候选：永远先创建候选，不自动替换 CORE。
- 归档：停用能力，不删除历史版本和 AIRun。

## 14. Capability Registry

V1 只设计 registry，不开发实现。

每项可被 @ 搜索的能力至少包含：

| 字段 | 说明 |
| --- | --- |
| displayName | 普通用户看到的名称，例如“老板知识口播” |
| description | 一句话说明能力做什么 |
| capabilityType | CREATE / POLISH / REVIEW / DIAGNOSE / OPTIMIZE / DISTILL |
| version | 对外展示的能力版本 |
| enabled | 是否可以被搜索和调用 |

建议补充：

- aliases：@ 搜索别名。
- visibility：USER 或 ADMIN。
- outputTypes：支持的输出类型。
- status：与现有方法状态映射。
- methodAssetId / methodVersionId：内部映射，不向普通用户展示。
- contractVersion：workflow-skill-v1。
- sourceNote：来源说明。
- supportsExistingDraft：是否支持在已有稿件上执行。
- supportsMaterials：是否需要资料。

registry 的行为：

- 普通用户只返回 enabled 且 visibility 为 USER 的 CREATE、POLISH、REVIEW 能力。
- 管理员可以查看 DIAGNOSE、OPTIMIZE、DISTILL。
- DISABLED 方法不能被新调用。
- registry 不保存事实，不替代 EvidenceItem，不负责模型路由。

## 15. Licensing Notes

截至 2026-09-17，通过 GitHub 仓库元数据和仓库 LICENSE 文件核对，以下五个仓库均声明 MIT License：

| 项目 | 仓库 / 状态 | 可直接复用代码 | P5.2 处理方式 | 许可证注意事项 |
| --- | --- | --- | --- | --- |
| Humanizer-zh | https://github.com/op7418/Humanizer-zh · MIT | 可以，需保留 MIT notice | REIMPLEMENT_MECHANISM | README 明确说明翻译自 blader/humanizer，并参考 stop-slop 与 Wikipedia；不复制长篇规则和示例，内部保留来源说明。 |
| Nuwa Skill | https://github.com/alchaincyf/nuwa-skill · MIT | 可以，需保留 MIT notice | REIMPLEMENT_MECHANISM | 研究链接、人物资料和示例不因为仓库 MIT 就全部成为可复制内容；只吸收提炼机制，内部资料优先。 |
| Darwin Skill | https://github.com/alchaincyf/darwin-skill · MIT | 可以，需保留 MIT notice | PARTIAL_ADAPT | README 同时引用 autoresearch、SkillLens、SkillOpt；这些外部论文和项目需要分别遵循其自身条款。只吸收对比、checkpoint 和失败模式机制。 |
| Freud Skill | https://github.com/alchaincyf/freud-skill · MIT | 可以，需保留 MIT notice | REIMPLEMENT_MECHANISM | 研究基础链接到 Anthropic 论文和研究页面；不把论文表述、心理隐喻或内部模型主张当作鑫世界事实。 |
| Copywriting Skill | https://github.com/judicael-s/Copywriting-skill · MIT | 可以，需保留 MIT notice | REIMPLEMENT_MECHANISM | 仓库引用多位文案作者和方法框架；重写机制，不复制长篇原文、示例或书籍内容，并保留必要归因。 |

MIT 的共同要求：

- 如果直接复制代码或实质代码片段，保留版权声明和 MIT permission notice。
- MIT 不等于可以删除上游署名，也不等于上游论文、书籍、作者框架和示例都自动进入公有领域。
- P5.2 不直接安装、clone 或打包任何外部仓库。
- 鑫世界原生 Skill 应以自己的 Contract、事实边界和产品语言重新编写。

## 16. V1 Boundaries

普通用户 V1 只开放：

- 创作方法
- 润色能力
- 审核能力
- @ 搜索和显式选择
- 串行执行和用户确认
- 版本使用和反馈记录

管理员能力先定义为架构类型，但不代表本轮开发：

- Skill 蒸馏器
- Skill 诊断器
- Skill 优化器

V1 不做：

- 自动选择 Skill。
- Skill 自动路由。
- 多 Agent workflow。
- Skill marketplace。
- Skill 社区分享。
- 外部仓库一键安装到生产 runtime。
- 自动把诊断结果改进到生产 Skill。
- 自动把优化候选晋级 CORE。
- 自动学习和自动重写方法。
- 复杂 DSL。
- Tool calling DSL。
- Provider-specific Skill 格式。
- 默认联网大规模研究。
- 任何绕过 FactGate、ownership、Evidence 或权限的能力。

## 17. Future Roadmap

后续阶段可以按以下顺序考虑：

### P5.3：Capability Registry 设计落地

- registry 数据结构
- @ 搜索
- USER / ADMIN 可见性
- enabled 和版本选择

### P5.4：普通用户 CREATE / POLISH / REVIEW runtime

- 复用 Workflow Skill Contract v1
- 预检 → 主生成 → 后检
- 审核只读和用户确认
- MethodUsage / AIRun 记录

### P5.5：内部资料 Skill 蒸馏

- LOCAL MATERIAL FIRST
- 历史稿件、文字稿、PDF、DOCX 和对标研究
- 候选方法预览
- 人工保存为 SAVED

### P5.6：诊断和优化

- Freud 类冲突诊断
- Darwin 类 paired comparison
- 失败模式和测试样例
- 人工 checkpoint
- 候选版本，不自动覆盖 CORE

### P5.7：反馈和方法治理

- 方法负责人审核
- CORE / DISABLED 生命周期
- 使用效果和用户反馈
- 仍不做自动学习
