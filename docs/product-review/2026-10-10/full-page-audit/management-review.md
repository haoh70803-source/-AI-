# 鑫世界 AI 工作台全页面功能说明与取舍评审

审计日期：2026-10-10。对象：E:\AI工作台1.2 当前工作树，包括既有未提交改动。仅审计与汇报，未执行业务功能增删。

系统具备以项目为容器的资料、持续对话、研究、可选 Skill 和文本成果基础。当前最应优先核验的是“保存后还能恢复并继续工作”。首页演示驾驶舱、人工发布任务和 CSV 数据台账不能作为真实运营效果或自动经营闭环的证明。

本报告的“代码存在”只说明找到了源码链路；“部分实现”说明仅有局部能力或与产品目标存在差距；“未实现”只用于有明确证据的缺失；“待核验”指运行效果、动态控件分支、权限或外部依赖尚未实测。本轮没有任何业务功能标为“已运行验证”；仅登录页展示和访客导航实际检查，见运行表。已有截图及历史 QA 结果不提升当前状态。

权威依据：[PRODUCT.md](<E:/AI工作台1.2/PRODUCT.md>)、[ARCHITECTURE.md](<E:/AI工作台1.2/ARCHITECTURE.md>)、[LEGACY.md](<E:/AI工作台1.2/LEGACY.md>)、[AGENTS.md](<E:/AI工作台1.2/AGENTS.md>)。本次不属于 Governance Update。建议均待上级决定，不构成删除、迁移或提前施工授权。

优先复用资料：[docs/product-review/2026-10-10/report.md](<E:/AI工作台1.2/docs/product-review/2026-10-10/report.md>)、[docs/product-review/2026-10-10/feature-decisions.md](<E:/AI工作台1.2/docs/product-review/2026-10-10/feature-decisions.md>)、[docs/product-review/2026-10-10/implementation-index.md](<E:/AI工作台1.2/docs/product-review/2026-10-10/implementation-index.md>)、[docs/product-review/2026-10-10/implementation-inventory.json](<E:/AI工作台1.2/docs/product-review/2026-10-10/implementation-inventory.json>)。本次重新读取页面与 API、递归索引 UI 和直接后端调用，修正拦截路由口径。

覆盖 82 个 page.tsx 文件，其中 72 个普通页面文件和 10 个设置弹层/关闭槽文件；196 个 Route Handler 文件；1470 处去重控件声明。动态参数、兼容别名、权限分支和重定向不能计作独立已交付页面。页面访问是否成功仍待运行。

## 第一部分 完整前端页面功能架构

当前侧栏：Home → 工作台 → 内容创作 → 知识与资料 → 研究与洞察；项目最近打开/文件夹是跨模块持续工作入口。任务数据、发布中心、旧 Discovery 和平台管理还有页内、直接 URL 或兼容入口。登录与管理员权限限制属于可访问性的前提，不得绕过。

| 一级模块 | 二级能力及入口 | 架构边界 |
| --- | --- | --- |
| 首页 | /home | 当前运营演示，与“找到工作、创建项目、回到最近工作”职责存在差距 |
| AI 工作台 | /dashboard；?project=id；?node=artifact:id | 无项目开始工作；有项目对话、资料引用、成果继续编辑 |
| 内容创作 | /topics、/content-review、/projects/[id]/review/[platform]、/calendar、/calendar/tasks/[id] | 选题治理、平台稿人工审核和人工发布任务是不同流程 |
| 知识与资料 | /library、/library/[id]、/library/feishu、/library/methods、/knowledge、/knowledge/facts、/ip-context | 原始资料、外部授权知识、可选技能、知识事实治理职责不同 |
| 研究与洞察 | /research/new、/research/teardown、/research/benchmarks、/research/trends、/research、/research/results；sources、works、focus、session 等页内入口 | 目标统一 Research，当前仍有多种垂直编排和旧 Discovery |
| 项目与成果管理 | /projects；项目别名转 dashboard；成果位于项目窗口 | 通用 Artifact 为 TEXT，旧母稿、草稿和 Canvas 并存 |
| 任务与数据分析 | /short-video/tasks、/short-video/tasks/[id]、/short-video | 手工任务与人工/CSV 数据，不是自动运行调度或平台实时监控 |
| 账户设置与管理员 | /settings/...；/login、/register、/account/...、/onboarding；/admin/...、/platform/spaces | 账号、Workspace、权限、凭证与诊断有基础；License 和完整商业交付为 FUTURE |
| 其他与兼容入口 | /discovery/...、/projects/.../studio、/platform/accounts、/experience、/__runtime、/workspace-unavailable、/ | 兼容、恢复、体验、诊断和分流入口，不扩张为新产品中心 |

设置弹层 @settings 的 (.)settings/account 等仍是 /settings/account，不能算作 /account；弹层与整页共用功能。关闭槽 [...catchAll] 返回 null，不是可访问业务功能。

产品核心对象为 Project、Conversation、Material、Research、Skill、Artifact；上述九类用于说明页面，不重新定义产品核心对象。

## 第二部分 逐页面功能明细

下表覆盖全部普通页面文件；逐页面展开的定位、展示内容、控件、用户操作、函数、API/Service/数据对象、关联和截图见附录 A。公共侧栏、顶部菜单、搜索和设置容器单列为共享组件附录，每个业务页继承其适用部分。

| 编号 | 一级模块 | 二级子模块 | 页面路径 | 展示内容与主要作用 | 状态 |
| --- | --- | --- | --- | --- | --- |
| P011 | 账户设置与管理员 | 管理员入口 | `/admin` | 进入用户管理；重定向 admin/users | 代码存在；访问依赖系统角色；本轮运行待核验 |
| P012 | 账户设置与管理员 | 系统服务管理 | `/admin/system` | 管理系统级模型或转录 Provider；系统配置表单、状态、保存/测试等条件动作 | 代码存在；SYSTEM_ADMIN 专用；本轮运行待核验 |
| P013 | 账户设置与管理员 | 调用用量 | `/admin/usage` | 按时间范围和用户查看调用及资源使用；用户/空间、调用、token、RedFox、转录分钟、素材、最近活动 | 部分实现；不等于供应商结算账单；本轮运行待核验 |
| P014 | 账户设置与管理员 | 系统用户管理 | `/admin/users` | 创建账号并处理生命周期；用户表、姓名/邮箱/初始密码、创建、启停、恢复等动作 | 代码存在；SYSTEM_ADMIN 专用；本轮运行待核验 |
| P015 | 内容创作 | 发布中心 | `/calendar` | 组织人工发布排期和发布状态；列表/日历、月份、平台/状态/创建者筛选、任务详情 | 部分实现；非平台自动发布；本轮运行待核验 |
| P016 | 内容创作 | 发布任务详情 | `/calendar/tasks/[id]` | 复制发布包，人工在平台发布后记录结果；发布包、计划时间、平台、取消、标记已发布、链接、操作记录 | 部分实现；明确要求人工登录真实平台；本轮运行待核验 |
| P017 | 内容创作 | 选题审核 | `/content-review` | 处理待批准、返工及暂缓选题；待处理选题、事实依据、评分、否决项、人工决定和历史 | 代码存在；与平台成稿审核分开；本轮运行待核验 |
| P018 | AI 工作台 | 开始工作及项目协作 | `/dashboard` | 无项目时开始工作，有项目时持续对话与编辑成果；任务输入、资料附件、模型与 Skill、模板、最近项目；项目对话、引用、成果窗口、旧稿件及画布 | 代码存在；真实模型与持久闭环待核验；本轮运行待核验 |
| P019 | 其他与兼容入口 | 旧对标入口 | `/discovery/benchmarks/[id]` | 转至 research/benchmarks/id；重定向 | LEGACY COMPATIBILITY；本轮运行待核验 |
| P020 | 其他与兼容入口 | 旧选题库 | `/discovery/ideas` | 管理研究产生的 ContentIdea；搜索、状态、选题卡片、继续研究/创作 | 代码存在；与选题中心需评审边界；本轮运行待核验 |
| P021 | 其他与兼容入口 | 研究选题详情 | `/discovery/ideas/[id]` | 完善依据并创建或打开关联项目；标题、描述、AI理由、参考、状态、资料与项目操作 | 代码存在；待核验；本轮运行待核验 |
| P022 | 其他与兼容入口 | 旧研究入口 | `/discovery` | 转至研究中心；重定向 | LEGACY COMPATIBILITY；本轮运行待核验 |
| P023 | 其他与兼容入口 | 推荐详情 | `/discovery/recommendations/[id]` | 核对推荐切口与证据后选用；推荐理由、问题、证据、采纳/忽略或创作入口 | 代码存在；个性化范围为已知 CURRENT IMPLEMENTATION GAP；本轮运行待核验 |
| P024 | 其他与兼容入口 | 旧趋势工作区 | `/discovery/trends` | 查看榜单与生成选题机会；平台/榜单筛选、刷新、趋势卡片、依据、生成选题 | LEGACY COMPATIBILITY；与新趋势入口重叠；本轮运行待核验 |
| P025 | 其他与兼容入口 | 旧趋势详情 | `/discovery/trends/[key]` | 查看趋势依据并研究选题；趋势信息、作品证据、补充输入、生成与保存操作 | LEGACY COMPATIBILITY；待核验；本轮运行待核验 |
| P026 | 首页 | 运营指挥台 | `/home` | 展示内容表现和样例分析，当前偏运营驾驶舱；播放、互动、净增粉丝、趋势、粉丝画像、作品排行、账号矩阵、规则摘要 | 部分实现；与 Home 产品职责存在 CURRENT IMPLEMENTATION GAP；本轮运行待核验 |
| P027 | 知识与资料 | IP 背景信息 | `/ip-context` | 维护人物定位、表达边界与背景版本；人物与背景字段、版本、发布/归档等条件控件 | 代码存在；与私人创作偏好含相邻语义；本轮运行待核验 |
| P028 | 知识与资料 | 事实确认 | `/knowledge/facts` | 对知识中的事实做双角色确认与有效期治理；确认人、事实类型、知识依据、有效期、发起确认、确认/否决、请求历史 | 代码存在；权限和双人确认待核验；本轮运行待核验 |
| P029 | 知识与资料 | 知识中心 | `/knowledge` | 从资料整理有来源和版本的知识；来源资料、标题、正文、保密范围、来源快照、历史、新版本、归档 | 代码存在；不是已验收的全域语义检索；本轮运行待核验 |
| P030 | 知识与资料 | 飞书资料 | `/library/feishu` | 连接并检索获授权的飞书资料；连接表单、App ID/Secret、启用与同步选项、授权确认、知识库浏览、订阅、同步、检索片段与原文 | 代码存在；真实授权、撤权和时效待核验；本轮运行待核验 |
| P031 | 知识与资料 | Skill 管理 | `/library/methods` | 导入和管理可选专业能力；Markdown 导入预览、技能名称和说明、搜索、详情、使用、启停 | 代码存在；可跳过技能；本轮运行待核验 |
| P032 | 知识与资料 | Skill 详情 | `/library/methods/[id]` | 查看与维护技能内容和版本；说明、步骤、适用场景、版本及编辑/使用入口 | 代码存在；待核验；本轮运行待核验 |
| P033 | 知识与资料 | 资料库 | `/library` | 管理可供项目和研究使用的原始输入；资料卡片、类型、处理状态、搜索、布局、分页、上传和链接输入、归档、飞书入口 | 代码存在；处理结果与任务运行待核验；本轮运行待核验 |
| P034 | 知识与资料 | 资料详情 | `/library/[id]` | 阅读提取内容、查看处理与来源，进入研究或创作；原文件、视频或音频预览、转录、来源、处理状态、重试、分析/提炼和项目关联 | 部分实现；MaterialAnalysis/Distillation 与 Research 边界未收敛；本轮运行待核验 |
| P035 | 知识与资料 | 方法兼容入口 | `/projects/methods` | 转至 Skill 管理；重定向 | LEGACY COMPATIBILITY；代码存在；本轮运行待核验 |
| P036 | 项目与成果管理 | 新项目表单 | `/projects/new` | 填写创作方向并创建项目，创建后进入工作台；返回创作、创作说明、ProjectForm 表单；sourceItemId/idea 可预填；VIEWER 返回项目列表 | 代码存在；与工作台/侧栏创建入口重复；本轮运行待核验 |
| P037 | 项目与成果管理 | 项目列表 | `/projects` | 找到、分类和继续已有项目；项目卡片、搜索、状态与文件夹、归档、最近打开、分页 | 代码存在；待核验；本轮运行待核验 |
| P038 | 项目与成果管理 | 项目兼容入口 | `/projects/[id]` | 转至 dashboard?project=id；重定向，非独立编辑页面 | LEGACY COMPATIBILITY；代码存在；本轮运行待核验 |
| P039 | 内容创作 | 平台成稿审核 | `/projects/[id]/review/[platform]` | 对平台适配稿做人工审核并准备发布；稿件预览、审核状态、意见、批准或返工、发布入口 | 部分实现；非自动平台发布；本轮运行待核验 |
| P040 | 项目与成果管理 | Studio 兼容入口 | `/projects/[id]/studio` | 转至项目工作台；重定向，Studio 不是独立产品中心 | LEGACY COMPATIBILITY；代码存在；本轮运行待核验 |
| P041 | 研究与洞察 | 老师与对标 | `/research/benchmarks` | 管理研究账号和已同步作品；账号列表、添加/导入、关注、比较、作品队列与筛选 | 代码存在；不等于自有创作者账号经营管理；本轮运行待核验 |
| P042 | 研究与洞察 | 账号研究工作区 | `/research/benchmarks/[id]` | 聚焦选定账号的作品、比较和研究；账号/作品筛选、研究组件与队列 | 代码存在；待核验；本轮运行待核验 |
| P043 | 研究与洞察 | 对标作品详情 | `/research/benchmarks/[id]/works/[workId]` | 获取并拆解单个作品，再选择进入创作；作品信息、数据观察、内容收集、分析、报告、导出、采用/创作 | 代码存在；有元数据不等于已读正文；本轮运行待核验 |
| P044 | 研究与洞察 | 专项研究 | `/research/focus` | 针对明确问题挑选已深拆作品开展研究；问题、账号/作品选择、样本范围、发起研究 | 代码存在；隐藏/页内入口；本轮运行待核验 |
| P045 | 研究与洞察 | 专项研究结果 | `/research/focus/[runId]` | 查看直接回答、证据限制并保存或带入创作；回答、结论、作品依据、未回答部分、预算遗漏、保存和使用发现 | 代码存在；未深拆作品不当成已读正文；本轮运行待核验 |
| P046 | 研究与洞察 | 开始研究 | `/research/new` | 围绕明确问题选择资料、账号、趋势并发起私人研究；研究模式、问题、资料选择与搜索、范围、私人背景选项 | 代码存在；研究执行依赖后台及模型；本轮运行待核验 |
| P047 | 研究与洞察 | 资讯日刊 | `/research` | 收集资讯线索并决定进一步研究；日期、来源/类别、搜索、更新、资讯卡片、引用及保存入口 | 代码存在；采集时效与真实内容待核验；本轮运行待核验 |
| P048 | 研究与洞察 | 研究记录 | `/research/results` | 寻找已保存研究及最近研究会话；搜索、项目/类型等筛选、研究卡片、会话及结果链接 | 代码存在；不是通用 Artifact 列表；本轮运行待核验 |
| P049 | 研究与洞察 | 研究成果阅读 | `/research/results/[kind]/[id]` | 读取已存结论、核对依据并选择用途；结论、来源、样本覆盖、选中与调整发现、保存私人研究、带入创作、审阅后分享 | 代码存在；分享不等于整个私人会话公开；本轮运行待核验 |
| P050 | 研究与洞察 | 研究会话 | `/research/session/[id]` | 查看进度、研究结果、追问、保存和使用发现；运行进度、范围、区块、依据、保存、继续提问、带入创作/分享 | 代码存在；隐私边界与运行待核验；本轮运行待核验 |
| P051 | 研究与洞察 | 已保存来源 | `/research/sources` | 阅读主动收集的来源并选择研究；来源清单、筛选、详情、笔记和研究入口 | 代码存在；页内入口，非一级侧栏；本轮运行待核验 |
| P052 | 研究与洞察 | 研究来源详情 | `/research/sources/[id]` | 查看原文与摘录，保存笔记或形成选题；原始内容、来源信息、摘录输入、保存和选题/研究操作 | 代码存在；深度理解与资料详情存在相邻能力；本轮运行待核验 |
| P053 | 研究与洞察 | 作品拆解 | `/research/teardown` | 输入作品并生成有来源的拆解报告；链接/文件输入、进度、视频预览、时间线、拆解正文、历史、导出、删除和项目衔接 | 代码存在；真实视频与恢复路径待核验；本轮运行待核验 |
| P054 | 研究与洞察 | 热点趋势 | `/research/trends` | 查看已记录的趋势与排名变化；平台/榜单/关键词、更新榜单、趋势表、关注和详情 | 代码存在；观察快照非连续实时监控；本轮运行待核验 |
| P055 | 研究与洞察 | 趋势详情与选题机会 | `/research/trends/[stableKey]` | 核对趋势依据，结合项目与自有资料研究机会；排名、观察、关注、关联作品搜索、项目/资料选择、机会研究、保存结论 | 代码存在；生成需明确项目和资料范围；本轮运行待核验 |
| P056 | 研究与洞察 | 对标新作 | `/research/works` | 查看已有同步作品，标记已读、研究或明确采用；未读数、账号/日期/文本筛选、作品卡片、状态动作、详情 | 代码存在；本页不触发采集、不自动生成稿件；本轮运行待核验 |
| P057 | 账户设置与管理员 | 关于 | `/settings/about` | 展示产品版本和说明；版本号及静态说明 | 代码存在；无专用业务 API；本轮运行待核验 |
| P058 | 账户设置与管理员 | 我的账号 | `/settings/account` | 管理资料、密码、邮箱与登录设备；姓名、邮箱、保存、密码操作、验证/恢复及设备会话动作 | 代码存在；账户不是创作者平台账号；本轮运行待核验 |
| P059 | 账户设置与管理员 | 创作偏好 | `/settings/creator-profile` | 保存私人表达偏好，选择已确认内容形成的建议；偏好表单、保存、建议列表、采纳/拒绝等条件操作 | 代码存在；与 IP 背景和对话偏好相邻；本轮运行待核验 |
| P060 | 账户设置与管理员 | 连接与诊断 | `/settings/diagnostics` | 检查应用与数据库连接及 Provider 配置状态；状态列表、重新检查、去服务测试、复制脱敏诊断 | 部分实现；非完整监控告警系统；本轮运行待核验 |
| P061 | 账户设置与管理员 | 模型与 API | `/settings/integrations` | 配置与测试外部能力和默认转录；Provider 卡片、密钥/地址/模型等条件字段、保存、启停、测试、默认转录选择 | 代码存在；配置存在不代表连通；本轮运行待核验 |
| P062 | 账户设置与管理员 | 成员与权限 | `/settings/members` | 邀请和治理当前空间成员；姓名/邮箱、角色、邀请、角色修改、停用或移除、邀请记录 | 代码存在；scope/RBAC 待运行验证；本轮运行待核验 |
| P063 | 账户设置与管理员 | 通用设置 | `/settings` | 管理当前账号、空间、文件保存位置和外观；主题切换（共享布局）、账号/空间/存储/服务入口 | 代码存在；同一内容支持弹层与整页；本轮运行待核验 |
| P064 | 账户设置与管理员 | 本机文件存储 | `/settings/storage` | 检查和管理本地上传文件目录；当前保存目录、路径输入、保存、读写检查及打开/复制等条件动作 | 代码存在；不是数据库与文件的一致备份恢复；本轮运行待核验 |
| P065 | 账户设置与管理员 | 公司空间 | `/settings/workspace` | 查看成员数，选择或管理有效空间；空间名称、空间选择、切换和保存 | 代码存在；不是完整多机构商业授权；本轮运行待核验 |
| P066 | 任务与数据分析 | 内容数据中台 | `/short-video` | 汇总人工或 CSV 录入的账号日快照；平台/账号/时间筛选，播放互动增粉、作品、画像、规则复盘；账号、内容、记录管理 | 部分实现；经营闭环为 FUTURE；本轮运行待核验 |
| P067 | 任务与数据分析 | 今日任务 | `/short-video/tasks` | 安排和跟踪运营任务；任务清单、日期、状态、负责人、项目关联、新建、开始、完成、延期 | 代码存在；不是 Agent 自动执行记录；本轮运行待核验 |
| P068 | 任务与数据分析 | 任务详情 | `/short-video/tasks/[id]` | 继续处理单个运营任务；任务内容、负责人、期限、状态、关联项目、开始、完成、延期 | 代码存在；页面角色依赖 taskId 条件；本轮运行待核验 |
| P069 | 内容创作 | 选题中心 | `/topics` | 记录方向、评分、否决项与人工决定，批准后建项目；标题、受众、目标、判断、事实依据、九维评分、否决及解决、审核、版本历史、归档 | 代码存在；不是 AI 自动选题的同义入口；本轮运行待核验 |
| P070 | 账户设置与管理员 | 接受邀请 | `/account/invite` | 持邮件 token 加入获邀请空间；邮箱、新成员姓名/密码/确认密码、提交与返回登录 | 代码存在；需真实邮件与链接；本轮运行待核验 |
| P071 | 账户设置与管理员 | 找回密码 | `/account/recovery` | 申请受控恢复邮件；邮箱、申请、邮件服务状态、返回登录 | 代码存在；未配置邮件时按钮禁用；本轮运行待核验 |
| P072 | 账户设置与管理员 | 设置新密码 | `/account/reset` | 凭恢复 token 设置密码并退出会话；新密码、确认、提交、失效提示 | 代码存在；需真实恢复 token；本轮运行待核验 |
| P073 | 账户设置与管理员 | 邮箱验证 | `/account/verify` | 验证登录账号的邮件 token；链接状态、确认提交、返回登录 | 代码存在；不修改空间权限；本轮运行待核验 |
| P074 | 账户设置与管理员 | 登录 | `/login` | 建立产品账号会话；账号或邮箱、密码、登录、找回及注册条件入口 | 代码存在；真实登录待核验；本轮运行待核验 |
| P075 | 账户设置与管理员 | 内部注册 | `/register` | 按环境开关与公司邀请码注册；姓名、邮箱、密码、邀请码、提交 | 代码存在；开关关闭会返回登录；本轮运行待核验 |
| P076 | 其他与兼容入口 | 共用体验空间 | `/experience` | 按环境开关建立体验会话；自动进入、错误提示、手动登录链接 | 代码存在；不代表个人私有空间；本轮运行待核验 |
| P077 | 账户设置与管理员 | 初始化空间 | `/onboarding` | 为无有效空间的登录用户创建空间；空间名称、创建按钮 | 代码存在；Server Action，非显式 REST 控件；本轮运行待核验 |
| P078 | 其他与兼容入口 | 根路径分流 | `/` | 按登录与成员资格进入首页或初始化；无独立工作区内容 | 代码存在；重定向不是功能完成；本轮运行待核验 |
| P079 | 其他与兼容入口 | 平台账号管理别名 | `/platform/accounts` | 复用系统用户管理；转导出 admin/users 页面，同角色边界 | 代码存在；重复入口；本轮运行待核验 |
| P080 | 账户设置与管理员 | 客户空间管理 | `/platform/spaces` | 平台管理客户空间与邀请；空间列表、创建及生命周期/邀请条件操作 | 代码存在；License/席位/设备为 FUTURE；本轮运行待核验 |
| P081 | 账户设置与管理员 | 空间不可用恢复 | `/workspace-unavailable` | 解释停用/移除并选择其他有效空间；状态说明、空间切换、账户管理、平台管理员入口 | 代码存在；待核验；本轮运行待核验 |
| P082 | 其他与兼容入口 | 开发运行诊断 | `/__runtime` | 显示环境身份和基础依赖状态；数据库、Redis、Worker、存储、Provider 状态 | 代码存在；仅开发环境入口；本轮运行待核验 |

### 截图阅读原则

以下 6 张历史图片来自既有文件，本轮查看后复用；另附 5 张本轮实际登录与账号安全页面截图。3022 服务可达，但受保护业务页对未登录访客跳回登录，未取得登录后的新业务截图；不以截图代替功能验收。截图说明包含测试/样例属性和版本差异；无图页面逐页标“无截图，待运行补拍”。

### /dashboard?project=<id>

历史 QA 测试项目的空对话界面。测试数据，非本轮截图或模型成功证据。

![/dashboard?project=<id> 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/workbench.png>)

来源：[qa-reports/screenshots/core-1440x900.png](<E:/AI工作台1.2/qa-reports/screenshots/core-1440x900.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /dashboard?project=<id>&node=artifact:<id>

历史 QA 成果窗口显示 V2；截图只说明曾有该界面，不证明本轮恢复或刷新通过。

![/dashboard?project=<id>&node=artifact:<id> 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/artifact.png>)

来源：[qa-reports/screenshots/restored-artifact.png](<E:/AI工作台1.2/qa-reports/screenshots/restored-artifact.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /home（历史样式）

历史运营驾驶舱演示截图仍显示“演示模式”；当前源码 showDataSource=false，与截图存在版本差异。所有数字不得作为经营成果。

![/home（历史样式） 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/home.png>)

来源：[output/home-performance/regression/登录首页-新版驾驶舱.png](<E:/AI工作台1.2/output/home-performance/regression/登录首页-新版驾驶舱.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /library/feishu

历史飞书连接与检索界面。当前知识库浏览和订阅可能已变化，截图不证明同步成功。

![/library/feishu 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/feishu.png>)

来源：[output/starship-ui/verification/全站-09-library.png](<E:/AI工作台1.2/output/starship-ui/verification/全站-09-library.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### 研究导航布局预览

图片自身明确“导航效果预览 未连接业务数据”，不是研究报告或真实业务页面验证。

![研究导航布局预览 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/navigation.png>)

来源：[output/research-navigation-preview/navigation-1440.png](<E:/AI工作台1.2/output/research-navigation-preview/navigation-1440.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /settings（历史隔离预览）

历史设置弹层，标注隔离预览/样例；不证明账号、空间和配置操作有效。

![/settings（历史隔离预览） 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/settings.png>)

来源：[output/ui-cockpit/settings-light.png](<E:/AI工作台1.2/output/ui-cockpit/settings-light.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /login 本轮访客实拍

2026-10-10 在本机 3022 未登录浏览器实际渲染；仅验证登录页展示，没有提交登录或验证账号功能。该服务运行版本尚未与工作树构建核对。

![/login 本轮访客实拍 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-login.png>)

来源：[docs/product-review/2026-10-10/full-page-audit/screenshots/current-login.png](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-login.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /account/invite 本轮访客实拍

本轮不带邮件 token 的实际页面显示链接缺失或失效，提交禁用；仅验证空链接页面展示，未验证成功路径。

![/account/invite 本轮访客实拍 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-invite.png>)

来源：[docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-invite.png](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-invite.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /account/recovery 本轮访客实拍

本轮实际页面显示邮件服务未配置，申请恢复邮件按钮禁用；未提交恢复请求。

![/account/recovery 本轮访客实拍 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-recovery.png>)

来源：[docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-recovery.png](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-recovery.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /account/reset 本轮访客实拍

本轮不带邮件 token 的实际页面显示链接缺失或失效，提交禁用；仅验证空链接页面展示，未验证成功路径。

![/account/reset 本轮访客实拍 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-reset.png>)

来源：[docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-reset.png](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-reset.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

### /account/verify 本轮访客实拍

本轮不带邮件 token 的实际页面显示链接缺失或失效，提交禁用；仅验证空链接页面展示，未验证成功路径。

![/account/verify 本轮访客实拍 历史截图](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-verify.png>)

来源：[docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-verify.png](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/screenshots/current-account-verify.png>)；历史图片拍摄时间未确认；本轮实拍时间见 screenshot-register.json。

## 第三部分 前端控件与后端 API 映射

下面是主要业务链路的人工语义核对。附录 A 展开每页控件和请求调用；附录 B 列出全部 196 个 API 的 Method、直接导入 Service、Prisma 对象与前端引用。SSR 读取与 Server Action 单独注明，不捏造 REST API。

| 功能与控件 | 前端函数 | Method 与路径 | 后端 Service | 数据对象 | 业务作用与限制 |
| --- | --- | --- | --- | --- | --- |
| 资料上传 | HomeComposer.upload / StudioDefaultMethod.upload | POST /api/source-items/upload | source-upload.ts → 入库/处理任务 | SourceItem、SourceAsset、IngestJob、Transcript | 文件读取、转录依赖存储及后台；不能以卡片存在认定读取成功 |
| 资料准备检查 | HomeComposer 中轮询包装 request | POST /api/creation/sources；POST /api/ingest-jobs/[id]/retry | creation/sources 与 ingest 服务 | SourceItem、IngestJob | 就绪/失败状态决定能否开始，不自动把失败输入当有效资料 |
| 开始项目 | WorkbenchStart.start / NewProjectDialog | POST /api/projects | project-service.createProject | ContentProject、ProjectSource、ProjectMethodSelection、CreativeBrief | 含资料、多个 methodVersionIds、模型与请求去重；创建和场景编排耦合 |
| 项目加载 | DashboardPage → loadWorkbenchPageData | SSR 直接调用；不是浏览器 REST 请求 | workbench-page-data → 项目、对话及成果读模型 | ContentProject、AssistantThread、Artifact、DraftBranch | 加载真实持久对象需数据库、登录和空间资格 |
| AI 对话 | StudioDefaultMethod.send / 加载 useEffect | GET/POST /api/projects/[id]/assistant | assistant/service → AIControlService | AssistantThread、AssistantMessage、AIRun、ApiUsage | 返回流式状态；真实响应需可用模型；停止按钮主要 abort 客户端流，不证明后台所有任务停止 |
| Skill 选择与跳过 | HomeComposer.submit / StudioDefaultMethod 的 select | POST /api/projects 的 methodVersionIds；POST assistant 的可选 skillVersionId | project-service、assistant/service、ai/skill-resolver | MethodAsset、MethodVersion、ProjectMethodSelection、MethodUsage | 创建入口多选；当前对话 select 单选且有空值“不使用专业技能” |
| 已有内容引用 | StudioDefaultMethod 引用搜索与 send | GET /api/projects/[id]/assistant/references；POST assistant | assistant/references、context-builder-v2 | SourceItem、ResearchRun、Artifact、KnowledgeEntry、BenchmarkAccount、TrendSnapshot | 用户选择引用；引用项可移除。飞书检索与授权片段另经上下文注入 |
| 保存 AI 回答 | StudioDefaultMethod.saveResult / 成果命名弹窗 onSave | POST /api/projects/[id]/artifacts | artifacts/service.createTextArtifact | Artifact、DraftBranch、DraftRevision、AssistantMessage | 只有可保存的完成回答；取消命名不保存；通用类型仅 TEXT |
| 手工成果修改 | ArtifactEditor → useArtifactEditor.save | PUT /api/projects/[id]/artifacts/[artifactId] | artifacts/service → writeDraftRevisionInTransaction | Artifact、DraftBranch、DraftRevision | expectedVersion 防过期写入；保存追加历史，不等于已实测无冲突 |
| 局部 AI 修改 | 成果正文 onSelect → selectedScope → StudioDefaultMethod.send/saveResult | POST assistant（editScope）；POST /api/projects/[id]/artifacts/[artifactId]/revisions | assistant/service 与 artifacts/service | AssistantMessage、Artifact、DraftRevision | 选区包含 start/end/expectedVersion；需保存后选区且未锁定；前后文本保护逻辑仍待运行 |
| 成果锁定 | useArtifactEditor.changeSavedVersion("lock") | PATCH /api/projects/[id]/artifacts/[artifactId] | artifacts/service | Artifact、DraftBranch | UI 与服务有写权限/锁定限制；不能以按钮禁用替代服务端隔离 |
| 历史与恢复 | useArtifactEditor.loadHistory / changeSavedVersion("restore") | GET/POST /api/projects/[id]/artifacts/[artifactId]/history | artifacts/service.getArtifactHistory / restoreArtifactRevision | Artifact、DraftRevision、DraftBranch | 恢复写成新版本，保留旧历史；刷新与重登后读回待测试 |
| 导出 | useArtifactEditor.download | 本地 Blob 下载；不调用专用 API | 无；使用已保存 ArtifactView | 已保存标题及正文 | 明确导出已保存版本；未保存编辑不自动进入下载 |
| 研究启动与保存 | ResearchComposer.submit / session 运行控件 | POST /api/research/sessions；POST /api/research/sessions/[id]/runs；POST /runs/[runId] | research/service 与运行编排 | ResearchSession、ResearchRun | 私人会话；启动、失败、补问、保存分开 |
| 研究进入项目 | ResearchUseFindings.prepare/share；ResearchShare.share | GET/POST /api/research/creation；POST /api/research/results/[runId]/share；旧 study share | research/sharing 与 read-model → createSharedArtifact | ResearchRun、BenchmarkStudy、Artifact、DraftBranch、AuditLog | 带入待发送文字与分享成项目成果是两种操作；预览、排除私人区块、重复分享保护在源码中 |
| 飞书资料引用 | FeishuLibrary.load/action/search；WikiBrowser 浏览；Subscriptions 查询 | GET /api/feishu（q 检索或 subscriptionId）；POST /api/feishu（action）；POST /api/feishu/browse | feishu/service、runtime、knowledge/feishu-context 与 integrations/feishu | FeishuConnection、FeishuDocument、FeishuChunk、FeishuSubscription | 仅授权 Docx/Wiki 内容；浏览、订阅、同步、检索、生成前访问核验分别待实测 |
| 选题→项目 | ContentHub.submit(action="topic.project") | POST /api/content-hub | content-governance.mutateHub | ContentTopic、Version、Decision、ContentProject、ProjectSource | 批准、事实有效性和 revision 前提；不是旧 ContentIdea 直接同义入口 |
| 人工运营数据 | VideoCenter.mutate / CSV 预览保存；Analytics 加载 | GET/POST /api/video-data | video-operations/service | VideoAccount、VideoDailyMetric、VideoContent、VideoTask | 手工/CSV 日快照；规则摘要没有调用真实模型 |
| 审核与发布任务 | PlatformReviewWorkspace / AddToPublishingButton / PublishTaskWorkspace | 平台 review 与 publish-tasks API（见目录） | review/service、publishing/publish-task-service | PlatformVariant、ReviewRecord、PublishTask、MotherContent | 人工审核与发布状态登记；人工复制到真实平台，未证明自动发布或自动回流数据 |
| 登录与初始化 | AuthForm.submit → authClient.signIn.email；OnboardingForm → createWorkspaceAction | POST /api/auth/sign-in/email（认证 SDK）；POST /api/internal-signup；初始化为 Next Server Action | lib/auth、internal-signup、onboarding/actions | User、Session、Account、Workspace、WorkspaceMember | 登录 API 不由普通 fetch 提取覆盖；注册受环境开关控制 |
| 账号安全页面 | AccountSecurityForm.submit（按 kind 选择路径与 Method） | 找回 POST /api/account/recovery；重置 PATCH /api/account/recovery；验证 PATCH /api/account/verification；邀请 POST /api/account/invitation | account-security.requestPasswordRecovery / finishPasswordRecovery / finishEmailVerification / acceptInvitation | User、Session、WorkspaceMember、恢复/验证/邀请安全记录 | 本轮只观察到缺少 token 的禁用状态及邮件服务未配置提示；未提交恢复、验证、邀请或密码更新 |

自动提取会保留动态 URL 和包装函数的原表达式。模板路径匹配、同名处理函数关联及 Service 文件内 Prisma 调用都是候选证据；同一个 Service 的全部对象不一定被某次调用读取或写入。代码中的函数存在、API 声明和页面接入分别记录；候选映射不能转为验收通过。

## 第四部分 跨模块功能关联流程

### 持续工作主线

资料上传/链接/文本 → 读取与转录就绪 → 在工作台输入任务并创建项目 → 附加资料及可选 Skill/模型 → 项目 AI 对话 → 查看生成候选 → 选择全文或已保存成果选区继续修改 → 明确保存为 Artifact → 修改保存追加 DraftRevision → 历史恢复追加新版本 → 从项目列表或最近项目再次打开 → 读取同一项目对话与已保存成果继续编辑。

| 阶段 | 明确用户动作 | 持久化及关联 | 断点或待核验项 |
| --- | --- | --- | --- |
| 资料输入→项目 | 上传/选择资料；就绪后发送任务 | SourceItem → ProjectSource → ContentProject | 文件读取失败不能只凭上传卡片宣称可用；Worker、存储、转录依赖待运行 |
| 项目→AI 对话 | 发送任务、补问、引用资料/研究/成果 | AssistantThread/Message 与 projectId 关联 | 真实 Provider、流式失败与停止后的后台状态待运行 |
| AI 对话→内容生成 | 选择模型，可跳过 Skill；等待回答 | AIRun/ApiUsage/完成消息 | 预置模板只填提示词，不等于生成成果；旧口播生成是另一兼容路径 |
| 生成→局部修改 | 已保存未锁定成果选择正文范围，发送修改，再应用 | editScope 与 expectedVersion，回复通过 revisions 应用 | 选区外文本保护、过期版本拒绝、失败不覆盖待运行 |
| 保存→版本恢复 | 命名保存；手工修改保存；查看历史并恢复 | Artifact + DraftBranch + 追加 DraftRevision | 锁定、角色、并发冲突、恢复后标题/正文一致性待运行 |
| 恢复→再次继续 | 打开最近项目/项目列表；选择成果并继续 AI 修改 | SSR/GET 重新读取对话、引用、成果与版本 | 刷新、退出重登、多标签、未保存离开拦截待运行 |

### 研究成果进入项目

“带入创作”先让用户选择结论并准备待发送内容，用户确认后发送；“分享进入项目”先预览共享内容，再创建项目 Artifact。两者分别处理私人研究输入与成员可见成果，不能把一次分享理解成全私人会话公开。旧 BenchmarkStudy 与 ResearchRun 有不同来源字段。[apps/web/components/research/research-use-findings.tsx](<E:/AI工作台1.2/apps/web/components/research/research-use-findings.tsx>) 和 [apps/web/server/research/sharing.ts](<E:/AI工作台1.2/apps/web/server/research/sharing.ts>) 具有选中区块、私有内容排除、项目范围、审计记录及重复分享保护代码；实际共享边界仍待验证。

### Skill 选择与跳过

创建入口传 methodVersionIds 数组，可 0 个或多个；项目对话当前使用单个 select 和可选 skillVersionId，包含“不使用专业技能”。因此“0 Skill 可工作”有 UI/服务基础，组合技能的全程交互仍需核验。旧 GENERATE_MOTHER_CONTENT 的 defaultMethod fallback 属 LEGACY COMPATIBILITY，不是通用 Agent 的必选规则。

### 飞书资料引用

连接应用 → 确认空间共享范围 → 浏览 Wiki/订阅 Docx → 同步为 FeishuDocument/Chunk → 检索授权片段 → ContextBuilder/feishu-context 在生成前供给引用。同步缓存不保证源文档仍可访问；源码包含访问与策略检查，但真实撤权、删除、限流、更新时间与证据引用需要获授权环境验证。凭证只供服务端保存，不因 UI 隐藏就视为安全完成。

### 选题与工作台

ContentTopic 路径：手工整理判断与事实 → 九维评分/否决项 → 人工批准 → topic.project 创建项目并关联资料 → dashboard 持续创作。ContentIdea 路径：研究/趋势/推荐的选题候选 → 旧选题详情 → 关联项目。两类对象共存，不能把前者的审核约束直接外推到后者。趋势机会页还要求项目与自有资料范围。

### 审核 发布 数据分析

选题审核 → 项目；旧母稿确认 → 选定平台适配稿 → 平台人工审核 → 发布快照与排期 → 用户复制并人工登录平台发布 → 手动登记已发布。VideoAccount/VideoDailyMetric 则由人工或 CSV 维护，数据摘要为规则计算。本轮没有证据证明“自动发布→平台已发布作品→自动数据快照→AI 复盘→下一轮创作”已经连通；该完整经营域为 FUTURE。

## 第五部分 实际实现状态与未完成部分

| 发现 | 证据 | 状态与影响 | 需要核验或补齐的边界 |
| --- | --- | --- | --- |
| 首页演示且来源标識隐藏 | [apps/web/app/(app)/home/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/home/page.tsx>) | CURRENT IMPLEMENTATION GAP；initialDemo 与 showDataSource=false | 明确展示/导出/复制来源，不能以演示 KPI 证明效果 |
| 通用文本成果与旧稿件并存 | [apps/web/server/artifacts/service.ts](<E:/AI工作台1.2/apps/web/server/artifacts/service.ts>)；[packages/db/prisma/schema.prisma](<E:/AI工作台1.2/packages/db/prisma/schema.prisma>) | CURRENT IMPLEMENTATION：ArtifactType 只有 TEXT；MotherContent 兼容存在 | 验证一等成果保存、恢复、再打开；其他成果类型未实现/本轮不新增 |
| 登录页渲染及访客跳转有本轮记录，业务功能无实测通过 | 运行记录 runtime-pages.json 与 runtime-probe.json | 沙箱内连接探测不可靠；本机只读复核：3022/55438/19020 可达，3000/3001 关闭；当前服务身份与构建一致性待核验 | 复用获授权测试会话后补业务页面截图与关键流程；访客跳转不能证明已登录权限或功能 |
| 资料详情仍拥有分析和提炼 | [apps/web/server/material-detail/service.ts](<E:/AI工作台1.2/apps/web/server/material-detail/service.ts>) | CURRENT IMPLEMENTATION GAP；Material 与 Research 职责交织 | 先决定边界再另立任务，不在审计搬迁 |
| 研究存在通用与多种垂直路径 | [apps/web/server/research/service.ts](<E:/AI工作台1.2/apps/web/server/research/service.ts>) | CURRENT IMPLEMENTATION GAP；非完整统一 Research Runtime | 各模式结果、失败和项目衔接分别验证 |
| 当前 Skill 选择能力不一致 | [apps/web/components/home-composer.tsx](<E:/AI工作台1.2/apps/web/components/home-composer.tsx>)；[apps/web/components/projects/studio-default-method.tsx](<E:/AI工作台1.2/apps/web/components/projects/studio-default-method.tsx>) | 创建多选、对话单选，组合运行待核验 | 0/1/多技能和跳过分别验，不扩大默认 Method 要求 |
| 发布及分析仅局部接通 | [apps/web/app/(app)/calendar/tasks/[id]/page.tsx](<E:/AI工作台1.2/apps/web/app/(app)/calendar/tasks/[id]/page.tsx>)；[apps/web/server/video-operations/service.ts](<E:/AI工作台1.2/apps/web/server/video-operations/service.ts>) | 部分实现；人工发布/人工和 CSV 快照，完整经营域 FUTURE | 不得称自动发布、实时监控或真实模型复盘 |
| 连接诊断只检查部分状态 | [apps/web/components/settings-diagnostics.tsx](<E:/AI工作台1.2/apps/web/components/settings-diagnostics.tsx>) | 部分实现；配置与真实 Provider 连通分开 | 真实 Provider 测试在 integrations；完整告警/SLA 待核验 |
| 备份/License/桌面交付 | [PRODUCT.md](<E:/AI工作台1.2/PRODUCT.md>) | FUTURE；未实现完整商业授权/一致备份/桌面交付 | 本机目录管理与 Workspace 基础不等于上述能力 |
| 权限隔离不能整体认证 | [ARCHITECTURE.md](<E:/AI工作台1.2/ARCHITECTURE.md>)；[apps/web/server/access.ts](<E:/AI工作台1.2/apps/web/server/access.ts>) | 局部服务有 scope 检查；Recommendation 个性化读取是已知 GAP | 相关 API 的跨空间、只读、停用用户/空间应分别运行验证 |

### 入口存在但效果有限或可能无效果的单独登记

| 入口或控件 | 实际源码行为 | 本轮结论 |
| --- | --- | --- |
| 顶部 编辑→编辑创作描述 | app-shell.tsx 使用 document.getElementById("workbench-idea")?.focus()，没有目标即静默跳过 | 在无该输入框的页面可能点击无可见效果；待运行，不冒充全局编辑功能 |
| 顶部右上角 关闭浮层 | 只 setMenu(null)/setNotice("") | 不关闭浏览器或桌面窗口；无浮层时可能无可见变化 |
| 工作台/项目侧栏多处新建 | 各入口最终创建同类 ContentProject | 重复入口，是否冗余需看场景；不记为多项独立功能 |
| 更多研究能力 | material-workspace.tsx 显示“即将支持”，没有真实结果或任务 | 未实现的展示占位；不得列为已交付研究能力 |
| 加入发布中心 disabled 分支 | 发布前置条件不满足时按钮禁用 | 有入口但不可执行；应核验禁用理由，不误报空回调 |
| 资料读取/AI 服务不可用分支 | 组件显示错误并禁用发送或前置操作 | 配置缺失/失败时不可用；存在代码不等于正常运行 |
| 跳到主要内容/编辑大纲等 # 链接 | 页面锚点导航 | 不是空 href；是否命中目标需运行核验 |

静态提取没有找到可达 button/Button 的字面空 onClick 回调，但这不等于全部按钮有效。另有 13 处没有直接事件的候选，主要是原生表单提交、asChild 链接或静态禁用按钮，已在附录 C 逐项解释，不能自动判为故障。

## 第六部分 功能重复与冗余分析

| 关系 | 重复程度 | 保留价值与风险 | 评审建议 |
| --- | --- | --- | --- |
| /projects/[id]、/studio 与 /dashboard?project=id | 兼容 URL 指向同一工作区 | 保留旧链接和数据，不是三个编辑器 | 保留兼容；后续独立治理 |
| 设置整页与拦截弹层 | 同路径、同功能、不同呈现容器 | 支持不离开项目继续工作；页面计数应去重 | 保留两种容器并统一验收口径 |
| /platform/accounts 与 /admin/users | 直接转导出同一页面 | 历史平台管理链接有兼容价值 | 优化入口说明，删除须另获授权 |
| 选题中心 ContentTopic 与旧选题库 ContentIdea | 主题相邻但对象和审核不同 | 评分/事实/人工审批不能简单删去；研究候选需要项目衔接 | 优化边界，先核对迁移与历史对象 |
| 研究来源详情与资料详情 | 原文/来源/笔记部分重叠 | 资料负责读出来，研究负责研究明白 | 按权威职责优化；不在本轮搬迁 |
| 旧 Discovery trends 与研究 trends | 榜单/选题机会有重叠，非简单同页别名 | 旧页面仍含生成/证据路径 | MERGE_CANDIDATE，仅提议统一入口与对象 |
| 主页演示指挥台与 /short-video | 共用 VideoAnalyticsWorkspace | 首页职责偏离；隐藏来源会影响管理层判断 | 优先优化来源标识及首页职责 |
| IP 背景、CreatorProfile、对话身份偏好 | 身份信息相邻，隐私与作用域不同 | 团队背景与私人偏好不能混为一个共享档案 | 优化命名/作用域说明，保留权限区别 |
| Artifact、DraftBranch、MotherContent、Canvas | 编辑/版本/保存能力交叠，底层互有依赖 | 共享草稿修订支撑成果；兼容路径仍被审核发布引用 | 保留通用成果优先级；旧对象待 Core V1 后专项治理 |
| 新建项目：顶部、侧栏、项目页、工作台 | 相同业务的不同上下文入口 | 快捷创建、组织选择、任务起步各有价值 | 复用服务、解释场景；不按数量直接删 |

## 第七部分 保留 优化 延期建议

保留六个核心对象及其持续工作主线，先用真实保存、修改、恢复和再次打开证明价值。优化属于后续明确任务；延期表示本阶段不扩张，不是取消 FUTURE 规划或删除现存兼容能力。

| 建议 | 对象 | 判断依据 | 下一次验收应证明 |
| --- | --- | --- | --- |
| 保留 | 项目/对话/资料/研究/可选 Skill/文本成果 | 与 PRODUCT PRINCIPLE 一致 | 输入→对话→保存→修订→恢复→重登继续，在隔离环境真实运行 |
| 优化优先 | 首页数据来源标识与入口职责 | 演示数据当前隐藏来源标识，与 Home 职责存在 GAP | 页面、复制、导出都可明确辨别演示；快速找到工作 |
| 优化优先 | 项目成果持久化与离开保护 | 持续工作价值依赖不丢内容 | 并发冲突不覆盖、失败保留草稿、恢复追加版本、刷新重登一致 |
| 优化 | 研究选中结论带入创作和审阅分享 | 私人研究与团队成果应分开 | 未确认不分享，私人段落不泄露，重复操作不覆盖已有成果 |
| 优化 | 资料处理状态与引用可靠性 | 未就绪资料会阻断主线 | 上传失败/读取失败/重试/就绪显示与服务一致 |
| 优化 | Skill 数量与跳过说明 | 创建多选与对话单选口径不同 | 0/1/多 Skill 的实际任务范围清楚；不用技能照样能工作 |
| 保留并优化 | 知识事实治理、人工审核、角色和 scope | 有业务与权限价值，不能简单当冗余按钮删除 | 角色、有效期、双人确认、归档来源和服务端范围核验 |
| 保留兼容 | 旧 Studio/MotherContent/Discovery/Canvas 路径 | 仍有数据和调用依赖；LEGACY 文档约束 | 明确兼容边界，另立任务核对迁移和旧链接 |
| 延期扩展 | 自动发布、真实平台数据闭环、模型经营复盘 | 现有仅局部代码，权威 FUTURE | 正式模块任务定义外部授权、数据快照、结果回流与反馈 |
| 延期扩展 | License、席位设备、完整备份恢复、桌面交付 | FUTURE/TARGET ARCHITECTURE，非本轮施工范围 | 单独定义交付与权限验收，不以本机文件设置替代 |

原 feature-decisions 的 85 条候选完整保留于附录 D 和功能取舍 CSV 中；其中未命名槽位不是实际功能发现，本次不补造名称。建议只作为会议底稿。

## 第八部分 可由上级填写决定的功能取舍表

请选择“保留、优化、延期、合并候选、删除候选、待核验”，填写负责人、优先级、理由与验收条件。合并/删除候选不授权立即施工，需另立任务；对产品定义的改变还需经批准的 Governance Update。所有决定初始为空。HTML 可填写并导出 CSV；输入只保存到当前浏览器的审计报告存储，不更新业务系统。

| 编号 | 模块与功能 | 路径 | 当前状态 | 建议 | 上级决定 | 负责人 | 优先级 | 理由及验收条件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P011 | 账户设置与管理员 / 管理员入口 | /admin | 代码存在；访问依赖系统角色 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P012 | 账户设置与管理员 / 系统服务管理 | /admin/system | 代码存在；SYSTEM_ADMIN 专用 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P013 | 账户设置与管理员 / 调用用量 | /admin/usage | 部分实现；不等于供应商结算账单 | 优化；延期扩展 | 待填写 | 待填写 | 待填写 | 待填写 |
| P014 | 账户设置与管理员 / 系统用户管理 | /admin/users | 代码存在；SYSTEM_ADMIN 专用 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P015 | 内容创作 / 发布中心 | /calendar | 部分实现；非平台自动发布 | 优化；延期扩展 | 待填写 | 待填写 | 待填写 | 待填写 |
| P016 | 内容创作 / 发布任务详情 | /calendar/tasks/[id] | 部分实现；明确要求人工登录真实平台 | 优化；延期扩展 | 待填写 | 待填写 | 待填写 | 待填写 |
| P017 | 内容创作 / 选题审核 | /content-review | 代码存在；与平台成稿审核分开 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P018 | AI 工作台 / 开始工作及项目协作 | /dashboard | 代码存在；真实模型与持久闭环待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P019 | 其他与兼容入口 / 旧对标入口 | /discovery/benchmarks/[id] | LEGACY COMPATIBILITY | 保留兼容；待专项治理 | 待填写 | 待填写 | 待填写 | 待填写 |
| P020 | 其他与兼容入口 / 旧选题库 | /discovery/ideas | 代码存在；与选题中心需评审边界 | 保留兼容；待专项治理 | 待填写 | 待填写 | 待填写 | 待填写 |
| P021 | 其他与兼容入口 / 研究选题详情 | /discovery/ideas/[id] | 代码存在；待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P022 | 其他与兼容入口 / 旧研究入口 | /discovery | LEGACY COMPATIBILITY | 保留兼容；待专项治理 | 待填写 | 待填写 | 待填写 | 待填写 |
| P023 | 其他与兼容入口 / 推荐详情 | /discovery/recommendations/[id] | 代码存在；个性化范围为已知 CURRENT IMPLEMENTATION GAP | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P024 | 其他与兼容入口 / 旧趋势工作区 | /discovery/trends | LEGACY COMPATIBILITY；与新趋势入口重叠 | 保留兼容；待专项治理 | 待填写 | 待填写 | 待填写 | 待填写 |
| P025 | 其他与兼容入口 / 旧趋势详情 | /discovery/trends/[key] | LEGACY COMPATIBILITY；待核验 | 保留兼容；待专项治理 | 待填写 | 待填写 | 待填写 | 待填写 |
| P026 | 首页 / 运营指挥台 | /home | 部分实现；与 Home 产品职责存在 CURRENT IMPLEMENTATION GAP | 优化；延期扩展 | 待填写 | 待填写 | 待填写 | 待填写 |
| P027 | 知识与资料 / IP 背景信息 | /ip-context | 代码存在；与私人创作偏好含相邻语义 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P028 | 知识与资料 / 事实确认 | /knowledge/facts | 代码存在；权限和双人确认待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P029 | 知识与资料 / 知识中心 | /knowledge | 代码存在；不是已验收的全域语义检索 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P030 | 知识与资料 / 飞书资料 | /library/feishu | 代码存在；真实授权、撤权和时效待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P031 | 知识与资料 / Skill 管理 | /library/methods | 代码存在；可跳过技能 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P032 | 知识与资料 / Skill 详情 | /library/methods/[id] | 代码存在；待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P033 | 知识与资料 / 资料库 | /library | 代码存在；处理结果与任务运行待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P034 | 知识与资料 / 资料详情 | /library/[id] | 部分实现；MaterialAnalysis/Distillation 与 Research 边界未收敛 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P035 | 知识与资料 / 方法兼容入口 | /projects/methods | LEGACY COMPATIBILITY；代码存在 | 保留兼容；待专项治理 | 待填写 | 待填写 | 待填写 | 待填写 |
| P036 | 项目与成果管理 / 新项目表单 | /projects/new | 代码存在；与工作台/侧栏创建入口重复 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P037 | 项目与成果管理 / 项目列表 | /projects | 代码存在；待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P038 | 项目与成果管理 / 项目兼容入口 | /projects/[id] | LEGACY COMPATIBILITY；代码存在 | 保留兼容；待专项治理 | 待填写 | 待填写 | 待填写 | 待填写 |
| P039 | 内容创作 / 平台成稿审核 | /projects/[id]/review/[platform] | 部分实现；非自动平台发布 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P040 | 项目与成果管理 / Studio 兼容入口 | /projects/[id]/studio | LEGACY COMPATIBILITY；代码存在 | 保留兼容；待专项治理 | 待填写 | 待填写 | 待填写 | 待填写 |
| P041 | 研究与洞察 / 老师与对标 | /research/benchmarks | 代码存在；不等于自有创作者账号经营管理 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P042 | 研究与洞察 / 账号研究工作区 | /research/benchmarks/[id] | 代码存在；待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P043 | 研究与洞察 / 对标作品详情 | /research/benchmarks/[id]/works/[workId] | 代码存在；有元数据不等于已读正文 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P044 | 研究与洞察 / 专项研究 | /research/focus | 代码存在；隐藏/页内入口 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P045 | 研究与洞察 / 专项研究结果 | /research/focus/[runId] | 代码存在；未深拆作品不当成已读正文 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P046 | 研究与洞察 / 开始研究 | /research/new | 代码存在；研究执行依赖后台及模型 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P047 | 研究与洞察 / 资讯日刊 | /research | 代码存在；采集时效与真实内容待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P048 | 研究与洞察 / 研究记录 | /research/results | 代码存在；不是通用 Artifact 列表 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P049 | 研究与洞察 / 研究成果阅读 | /research/results/[kind]/[id] | 代码存在；分享不等于整个私人会话公开 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P050 | 研究与洞察 / 研究会话 | /research/session/[id] | 代码存在；隐私边界与运行待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P051 | 研究与洞察 / 已保存来源 | /research/sources | 代码存在；页内入口，非一级侧栏 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P052 | 研究与洞察 / 研究来源详情 | /research/sources/[id] | 代码存在；深度理解与资料详情存在相邻能力 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P053 | 研究与洞察 / 作品拆解 | /research/teardown | 代码存在；真实视频与恢复路径待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P054 | 研究与洞察 / 热点趋势 | /research/trends | 代码存在；观察快照非连续实时监控 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P055 | 研究与洞察 / 趋势详情与选题机会 | /research/trends/[stableKey] | 代码存在；生成需明确项目和资料范围 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P056 | 研究与洞察 / 对标新作 | /research/works | 代码存在；本页不触发采集、不自动生成稿件 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P057 | 账户设置与管理员 / 关于 | /settings/about | 代码存在；无专用业务 API | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P058 | 账户设置与管理员 / 我的账号 | /settings/account | 代码存在；账户不是创作者平台账号 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P059 | 账户设置与管理员 / 创作偏好 | /settings/creator-profile | 代码存在；与 IP 背景和对话偏好相邻 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P060 | 账户设置与管理员 / 连接与诊断 | /settings/diagnostics | 部分实现；非完整监控告警系统 | 优化；延期扩展 | 待填写 | 待填写 | 待填写 | 待填写 |
| P061 | 账户设置与管理员 / 模型与 API | /settings/integrations | 代码存在；配置存在不代表连通 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P062 | 账户设置与管理员 / 成员与权限 | /settings/members | 代码存在；scope/RBAC 待运行验证 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P063 | 账户设置与管理员 / 通用设置 | /settings | 代码存在；同一内容支持弹层与整页 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P064 | 账户设置与管理员 / 本机文件存储 | /settings/storage | 代码存在；不是数据库与文件的一致备份恢复 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P065 | 账户设置与管理员 / 公司空间 | /settings/workspace | 代码存在；不是完整多机构商业授权 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P066 | 任务与数据分析 / 内容数据中台 | /short-video | 部分实现；经营闭环为 FUTURE | 优化；延期扩展 | 待填写 | 待填写 | 待填写 | 待填写 |
| P067 | 任务与数据分析 / 今日任务 | /short-video/tasks | 代码存在；不是 Agent 自动执行记录 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P068 | 任务与数据分析 / 任务详情 | /short-video/tasks/[id] | 代码存在；页面角色依赖 taskId 条件 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P069 | 内容创作 / 选题中心 | /topics | 代码存在；不是 AI 自动选题的同义入口 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P070 | 账户设置与管理员 / 接受邀请 | /account/invite | 代码存在；需真实邮件与链接 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P071 | 账户设置与管理员 / 找回密码 | /account/recovery | 代码存在；未配置邮件时按钮禁用 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P072 | 账户设置与管理员 / 设置新密码 | /account/reset | 代码存在；需真实恢复 token | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P073 | 账户设置与管理员 / 邮箱验证 | /account/verify | 代码存在；不修改空间权限 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P074 | 账户设置与管理员 / 登录 | /login | 代码存在；真实登录待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P075 | 账户设置与管理员 / 内部注册 | /register | 代码存在；开关关闭会返回登录 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P076 | 其他与兼容入口 / 共用体验空间 | /experience | 代码存在；不代表个人私有空间 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P077 | 账户设置与管理员 / 初始化空间 | /onboarding | 代码存在；Server Action，非显式 REST 控件 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P078 | 其他与兼容入口 / 根路径分流 | / | 代码存在；重定向不是功能完成 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P079 | 其他与兼容入口 / 平台账号管理别名 | /platform/accounts | 代码存在；重复入口 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P080 | 账户设置与管理员 / 客户空间管理 | /platform/spaces | 代码存在；License/席位/设备为 FUTURE | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P081 | 账户设置与管理员 / 空间不可用恢复 | /workspace-unavailable | 代码存在；待核验 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |
| P082 | 其他与兼容入口 / 开发运行诊断 | /__runtime | 代码存在；仅开发环境入口 | 保留并定向核验 | 待填写 | 待填写 | 待填写 | 待填写 |

完整 CSV 含全部页面行与原有功能候选：function-decisions.csv。

## 本轮访客页面访问记录

在未登录的 Microsoft Edge 临时浏览器上下文只读访问本机 3022。HTTP 200 若最终显示登录页，只代表登录页响应，不代表原业务页面成功。未登录跳转也不等于已验证已登录用户/工作空间/管理员权限。动态 ID 页没有可复用实体，不编造 ID；/experience 会尝试自动建立会话，本轮未触发。服务环境与工作树构建一致性未核对，不从页面版本字样推断环境身份。

| 请求页面 | 最终路径 | HTTP（最终响应） | 本轮证据 | 业务功能状态 |
| --- | --- | --- | --- | --- |
| /admin | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /admin/system | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /admin/usage | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /admin/users | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /calendar | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /content-review | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /dashboard | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /discovery/ideas | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /discovery | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /discovery/trends | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /home | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /ip-context | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /knowledge/facts | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /knowledge | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /library/feishu | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /library/methods | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /library | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /projects/methods | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /projects/new | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /projects | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research/benchmarks | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research/focus | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research/new | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research/results | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research/sources | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research/teardown | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research/trends | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /research/works | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings/about | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings/account | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings/creator-profile | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings/diagnostics | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings/integrations | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings/members | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings/storage | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /settings/workspace | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /short-video | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /short-video/tasks | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /topics | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /account/invite | /account/invite | 200 | 实际截图：screenshots/current-account-invite.png | 页面渲染实际检查；按钮提交/业务作用仍待核验 |
| /account/recovery | /account/recovery | 200 | 实际截图：screenshots/current-account-recovery.png | 页面渲染实际检查；按钮提交/业务作用仍待核验 |
| /account/reset | /account/reset | 200 | 实际截图：screenshots/current-account-reset.png | 页面渲染实际检查；按钮提交/业务作用仍待核验 |
| /account/verify | /account/verify | 200 | 实际截图：screenshots/current-account-verify.png | 页面渲染实际检查；按钮提交/业务作用仍待核验 |
| /login | /login | 200 | 实际截图：screenshots/current-login.png | 页面渲染实际检查；按钮提交/业务作用仍待核验 |
| /register | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /onboarding | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| / | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /platform/accounts | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /platform/spaces | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /workspace-unavailable | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |
| /__runtime | /login | 200 | 只读导航记录 | 原页面未渲染；回到登录或其他路径，业务待核验 |

## 核验范围与交付限制

V0 静态审计，加本机端口只读复核、未登录页面导航/登录页实拍和报告文件浏览器检查；不运行登录后业务测试、全仓 build/typecheck/E2E，不查询业务数据库，不创建账号，不执行业务 POST，不调用真实外部模型或平台，不读取密钥，不部署 migration，不修改权威规则或业务代码，不暂存、提交或推送。

已有盘点与当前重新读取发现 4 个 Service/策略文件哈希变化：[apps/web/server/artifacts/service.ts](<E:/AI工作台1.2/apps/web/server/artifacts/service.ts>)；[apps/web/server/assistant/creation-policy.ts](<E:/AI工作台1.2/apps/web/server/assistant/creation-policy.ts>)；[apps/web/server/assistant/prompt.ts](<E:/AI工作台1.2/apps/web/server/assistant/prompt.ts>)；[apps/web/server/assistant/service.ts](<E:/AI工作台1.2/apps/web/server/assistant/service.ts>)。本轮取当前工作树重新提取；交付前对本轮读取快照再做哈希一致性检查。既有工作区大量未提交改动保留。

复用截图的拍摄版本/环境不能由文件 mtime 推断，已标历史、模拟和版本差异。资料库、项目列表、研究执行、权限、管理员和其他页面未取得本轮新截图；没有截图不等于代码不存在。

本报告做到全页面文件覆盖与主要语义链路核对，并保留全部提取到的控件/请求证据。自动可达导入图不证明所有组件在同一页面可见；包装函数、条件分支、动态菜单、键盘/语音状态和每项按钮的真正运行效果仍待隔离环境逐项验收。

管理层可据此决定范围；不能将该静态报告作为验收通过或正式 Release 证明。

完整逐页控件及 API 证据见 [docs/product-review/2026-10-10/full-page-audit/report.md](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/report.md>)；交互阅读版为 [docs/product-review/2026-10-10/full-page-audit/report.html](<E:/AI工作台1.2/docs/product-review/2026-10-10/full-page-audit/report.html>)。
