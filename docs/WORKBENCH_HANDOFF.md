# 内容工作台协作交接

更新时间：2026-10-07。本文只含源码、结构和脱敏运行说明。真实付费采集与模型拆解未验收，不包含数据库、附件、私人聊天或凭据。

## 先读什么

[PRODUCT](../PRODUCT.md)、[ARCHITECTURE](../ARCHITECTURE.md)、[LEGACY](../LEGACY.md)、[AGENTS](../AGENTS.md) 是权威规则。本文区分当前源码和运行事实，不改变产品定义。README旧阶段说明、V1文档及日期型audit是历史证据；旧PID、端口和测试通过数不能代替当前核验。

## 项目用途与业务分区

方向是以项目为长期容器的AI工作台：项目、对话、资料、研究、可选技能、成果。现状是Next.js Web、服务端数据库与后台任务；本地优先桌面交付、许可证、完整发布经营闭环仍是FUTURE。

| 分区 | 当前职责与入口 | 边界 |
| --- | --- | --- |
| 首页与项目 | app/(app)、components/projects、server/project-service.ts | 首页找工作；项目持续协作，旧Studio/Canvas并存 |
| 对话与成果 | server/assistant、server/artifacts | 项目聊天、TEXT成果及版本/编辑；多类型通用成果未完成 |
| 资料 | server/source-service.ts、material-detail、source-items API | 原文件、提取、转写、读取；模型/ASR按环境核验 |
| 研究 | server/research、components/research | 来源、私人摘录、老师/对标、作品队列、既有报告、显式采用 |
| AI日报 | server/research/news、api/research/news | AIHOT外部公开资讯、独立缓存和调度 |
| 账号与配置 | account-*、admin、integrations、settings | 登录/会话/成员scope，Provider配置；非完整商业授权系统 |
| 后台任务 | apps/worker/src | Redis/BullMQ采集/转写；本轮daily/review通用worker关闭 |

## 架构及目录入口

页面/客户端 → Route Handlers与Server Services → Auth/Workspace/RBAC；业务服务分别访问Prisma/PostgreSQL、Storage/MinIO、Agent/Context/LLM Runtime。队列经Redis/BullMQ交给worker；模型、RedFox、ASR由packages/providers具体实现。日报的固定AIHOT公开GET走独立缓存，不经过项目聊天或付费模型。

数据库保存身份、业务、任务、证据、对话与成果；对象存储保存原附件。数据库备份不包含附件，恢复需分别验证。UI不能代替服务端scope；配置存在不表示能力已经跑通。

| 目录 | 接手入口 |
| --- | --- |
| apps/web/app、components | 页面、API路由和交互；没有web/src目录 |
| apps/web/server | scope、Research、Agent、存储与健康 |
| apps/web/tests | 服务/权限/HTTP/浏览器测试；部分依赖运行产物 |
| apps/worker/src | 队列生产消费、模式、恢复、采集/转录 |
| packages/db/prisma | schema与版本迁移；禁止改已应用migration |
| packages/providers/src | RedFox、模型兼容接口、ASR、安全URL、review外调保护 |
| packages/core、config、integrations、ui | 共用契约与能力，变更前检查调用方 |
| scripts/local-*、release-* | daily/review、独立构建、启动校验 |
| config/environments | 脱敏模板和旧LOCAL_REAL/LOCAL_TEST说明 |
| services/local-asr | 本地ASR服务及fixture，本轮不启动 |
| render*.yaml、Compose | 部署定义，存在不代表平台绑定或线上验收 |

Discovery/Trend/Benchmark底层仍供Research使用，旧/discovery不是新的产品中心。MotherContent、默认Method fallback、Canvas、MaterialAnalysis/Distillation、CreativeBrief、Recommendation仍有代码/数据，不删除。v2 account/focus/topic是专用研究编排，不等于完整通用Research Runtime。研究阅读入口撤下的直接生成控件仍有兼容组件；隐藏不代表可删。详见LEGACY。

## 源码、运行版本与已验证能力

原工作树分支feat/web-integration-release，基线ae3ff0879029394cec99ccb2f00d012e1e8a52ed。开始盘点为142个tracked改动、253个untracked文件；tracked增加1778行、删除906行。这是多轮混合WIP，不是单一任务差异。

| 环境 | 已运行产物与监听 | 数据边界 |
| --- | --- | --- |
| daily | release-20261006T152431Z-e439c607；127.0.0.1:3000 | 原PostgreSQL55432与原MinIO9000 |
| review | release-20261007T025939Z-15417e50；127.0.0.1:3030 | 隔离PostgreSQL55436与review MinIO19000 |
| 旧入口 | 本轮未发现3017/3020监听 | 旧目录/库/卷保留，不合并或删库 |

本轮不切换运行版本。此前3030老师/对标UI已有服务与浏览器验收，但真实RedFox采集、模型拆解、ASR未实测。随后新增MS4w身份保护已通过源码、本地测试和本次交接快照构建验证，尚未进入这两个运行产物。构建成功也不等于部署或运行。

### 日报外部来源

transport固定https://aihot.news/api/v1，仅snapshot/changes/dailies/daily白名单GET，不带本地auth/cookie/context，不跟随重定向。AIHOT_PUBLIC_NEWS_ENABLED控制公开来源，模板默认关闭；不放开通用采集或模型。长生命周期进程每分钟检查持久化due time、最多每小时同步；停止/休眠时不能同步，恢复只补一轮。缓存要求绝对持久目录。API仍限制指定的本地管理员本人及有效workspace成员，不是所有同事可用的多租户日报；不得擅自放宽权限。指定身份值不写入本文。

### 研究与创作聊天隔离

ResearchSession/ResearchRun与AssistantThread/AssistantMessage独立。采用研究须显式选发现和项目，只进入待发送输入，不自动发送assistant或复制私人备注/写成果。当前项目主对话取workspace/project下canvasObjectId=null的最早线程并核对createdById，其他成员不能接管。每个创作任务独立threadId、草稿、重试、迟到流式响应以及多人私人任务仍是CURRENT IMPLEMENTATION GAP，不能把研究对象独立称作创作多任务隔离完成。

### 对标账号与费用

queryUser只支持accountId=unique_id/short_id/uid；主页MS4w sec_user_id不能直接传入。源码已在import/provider两层阻止错误链，已保存同scope账号仍可定位。queryWorkList区分抖音号accountId、secUserId、authorUrl；sort描述_0/_2/_4与default示例冲突，真实契约未验证，不自动换参数付费重试。

可能反向链仅为条件方案：作品页非空且含有效authorId后再查身份。当前未实现；空账号或缺字段不能完成。公开基础参考每次¥0.04、两次¥0.08不是账户实际费率或成本上限。真实调用、模型、批量/翻页/订阅仍须明确授权。

## 依赖与安全本地启动

Node>=24、pnpm11.19.0，使用锁文件；Docker/Compose提供PG、Redis、MinIO。需要媒体处理才安装FFmpeg/FFprobe。首次pnpm install --frozen-lockfile运行已有db:generate，仅生成client。不要把pnpm dev:up当接手首步：它会migration并启动ASR/Worker/Web，超出本次范围。

同事优先使用自己的空LOCAL_TEST环境：复制config/environments/local-test.env.example为忽略的.env.local-test，自行配置测试专用数据库/存储/凭据；docker-compose.test.yml用55433/6380/9002。本机55436已有review业务数据，不能当随意reset的空库。daily/review launcher需要既有私有profile，脱敏模板不能供给基础设施或凭据。

~~~bash
pnpm install --frozen-lockfile
pnpm db:generate
# 首次checkout先生成Next路由类型：
pnpm --filter @content-center/web exec next typegen
pnpm typecheck
pnpm lint
# 仅确认专用测试目标后：
pnpm infra:test:up
pnpm test:isolated
# 本机配置检查，不切换：
pnpm daily:check
pnpm review:check
# 独立离线构建，不启动或部署：
pnpm release:build
~~~

已有产物须按local-release.mjs的profile检查后由维护者启动。旧dev:review是开发入口，release review固定3030；不要抢现有端口。daily切换需--approved-daily-switch及单独人工批准。不要运行admin:bootstrap、integration-seed等现场写入脚本。

脱敏参考：[workbench-review.env.example](../config/environments/workbench-review.env.example)。只列变量/占位符，不是自动创建review的脚本。凭据只放私有env，不写Git/日志。AIHOT默认false，通用外调和worker关闭。旧local-real/local-test文档不覆盖当前daily/review事实。

## 迁移与安全测试步骤

1. 先识别目标库/卷/存储和写入者，真实维护暂停仅限本项目；分别备份DB/附件，在可丢弃环境演练。
2. 对照schema/迁移历史；62项是此前验收记录，本轮不deploy或重新核验全量业务。禁止reset/seed、改旧migration、用review覆盖daily。
3. 新迁移先在专用空测试库和备份恢复副本测试，再核对跨workspace/user/thread/source权限；正式deploy另批。
4. 优先provider本地fixture与offline保护；未登录401、跨客户403/404。禁止关闭认证通过测试。
5. 测试写入仅隔离workspace并验证清理；不读真实密码/token/hash、不代替本人登录。
6. 旧Mock/浏览器通过不是当前真实付费链证据；本轮结果如下。

## 本轮检查结果

| 检查 | 本轮结果 |
| --- | --- |
| 类型 | Web、Worker、config/core/db/integrations/providers/ui共8个目标全部通过 |
| lint | Web页面/组件/服务/lib/tests、Worker、Providers、DB、scripts范围通过；最初43项已用3文件最小修正收口 |
| 隔离服务测试 | 24文件167项通过，覆盖研究采用/日报/账号/项目对话/成果/资料/任务恢复/环境门禁；模型采用Mock，写入仅55436临时fixture |
| 纯Node门禁 | local-profile、release-profile、client-boundaries共23项通过，lint修正后复验通过 |
| 原工作树源码构建 | release-20261007T074936Z-9e0f5a80 BUILT，exitCode0，networkDenied0，sourceUnchanged/liveFilesUnchanged均true；未启动或部署 |
| HTTP只读 | 3000及3030 ready=200/true；未登录projects=401 |
| 入口/快照 | README与交接链接无缺失；328个选入文件与原有效源码保持一致，交接快照仅另删除2处多余EOF空行；暂存diff --check通过 |
| 秘密/资料边界 | 未检出高置信密钥特征；未新增真实二进制附件；原品牌图和合成ASR fixture保留。既有授权本人邮箱门禁常量未改，不能作为同事通用日报权限 |
| 未运行 | 全仓所有测试、最终新源码浏览器验收、真实RedFox/模型/ASR、正式migration/deploy、云运行验收；当前浏览器产物仍旧版本 |

注意：更早release-20261007T074007Z-eaffd6a5也构建成功，但不含随后lint修正，以上最终回执才对应交接源码。Vite提示未来native config加载的ESM/CJS兼容警告，本轮不扩大配置重构。最终构建只保存本地，不随Git上传。

## 已完成、待完成与推荐顺序

已有：项目/文本成果基础，研究来源/私人摘录/显式采用，老师/对标紧凑工作台，缺失数据显示，offline限制，MS4w保护源码，独立外部日报。范围是各自源码与局部验证，不是完整生产链。

1. 同事先核对环境身份、独立DB/存储，跑契约/权限门禁和typecheck。
2. 收口研究采用、来源证据和报告阅读；保留旧有效能力。
3. 专项做创作thread隔离及草稿/重试/迟到响应测试；多人权限变更另批。
4. 费用/账户费率/端点状态确认后才做RedFox最小真实验收，明确空账号失败路径。
5. 模型/ASR分别真实验收后再讨论新拆解、定时采集和桌面交付。

阻塞：真实RedFox/模型费用未授权；MS4w自动身份缺口；创作多任务隔离未完成；云平台绑定/运行未验收。不用假数据掩盖。

## 同事协作与Git

从交接分支按模块开自己的分支，任务写目标/范围/验证级别；避免同时写同一共享service/schema/migration，改共享层先查调用方。小diff、定向验收、独立commit，再由负责人review合并；migration与所属模块同时交付。AGENTS仍有效，推送不等于部署授权。

本次独立worktree交接有效源码与本文，保留原混合工作树。排除output/.local-data、env、密钥、日志、数据库/附件、私人审计与现场integration诊断脚本；它们不是新同事必须拥有的运行依赖，负责人可本地复核，不批量上传。

现有Render autoDeployTrigger=commit绑定feat/web-integration-release（标准web/worker）和codex/web-experience-candidate（free web）；worker补充定义关闭自动部署。当前源码无.github/workflows。交接分支避开以上配置，不force push、不合入主分支、不改仓库公开性/成员权限。外部平台真实订阅不能由本地配置证明，推送后仅报告可读GitHub状态。


交接分支：handoff/content-workbench-20261007。远端历史默认分支仍为audit/pre-launch-snapshot-20260903，仓库保持private；不改默认分支/公开性，不合并或触发已配置分支部署。源码阶段包含所属研究migration，文档阶段单独提交；GitHub实得状态以推送后回执为准。


CURRENT IMPLEMENTATION GAP：同事首次新机器尚无一键创建daily/review基础设施、profile及登录账号的交接命令。现有launchers严格校验既有本地配置；模板仅是变量参考，必须由获授权维护者按local-profile.mjs在自己的私有目录配置并通过check。不要用本机私有文件或管理员凭据填补缺口。release review的3030 URL由launcher指定；旧review profile的URL须先满足validateReview，不能仅替换端口。


源码提交：df88d6be12ea8d84b71511369bc6c1625fe8b404。官方参数参考：[身份接口](https://redfox.hk/apis/douyin/XUT4CECZ)、[作品列表](https://redfox.hk/apis/douyin/QEQLCKD6)、[公开价格](https://redfox.hk/pricing)。本文费用是条件参考，不是实得账单。


### 实际交接快照构建复验

E盘交接worktree直接复用D盘已安装node_modules时，release-20261007T080026Z-8047e9b8失败：webpack把跨盘绝对路径拼成./D:/…，不是业务类型/lint失败；networkDenied0、sourceUnchanged/liveFilesUnchanged均true。没有安装新依赖、取消离线门禁或启动服务。
同一已提交源码（含2处EOF规范化）转到全新同盘临时目录再构建：release-20261007T081014Z-c636b517 BUILT，exitCode0，networkDenied0，sourceUnchanged/liveFilesUnchanged均true；生产类型检查与106项页面生成任务通过，未启动或部署。此复验也排除了现场integration诊断脚本对编译的隐含依赖。新同事应在自己的checkout安装锁定依赖，不跨盘复用其他人的node_modules。


同步验收：交接分支前两项提交已推送，远端与本地SHA核对一致。2026-10-07推送后可读取的本分支GitHub check-runs和workflow-runs均为0，因此不能称远端CI已通过；本地验收结果仍以上述记录为准。后续文档提交状态见最终同步回执。
