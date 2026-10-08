# Reference Map

本文件记录各阶段的只读参考研究与第三方依赖采用情况。参考仓库位于主仓库同级的 `../reference-repos`，均使用 shallow clone；主项目没有复制任何参考仓库源码。

| Repository | Commit | Source file / 模块 | License | 参考价值 | 我们怎么实现 | copied / adapted / inspired | modifications | 后续集成方式 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [erduo1998-cell/ip-strategist](https://github.com/erduo1998-cell/ip-strategist) | `3716c815eb258a55918592b72a92add1cfd12f8b`（v2.2.0，2026-09-02） | `references/task-script.md`、`references/03-脚本骨架.md`、`references/04-口播文案.md` | CC BY-NC 4.0 | 参考素材机制迁移、叙事推进、口播人话化和交付前自检 | 三份上游原件保存在 `vendor/ip-strategist/v2.2.0/`；自有 server-only Adapter 按 Markdown heading/稳定语义锚点选择原文、去重并限制 8,000 字符，只增强既有单次 `GENERATE_MOTHER_CONTENT` | copied (unaltered source) / adapted at runtime selection boundary | 原件未修改；未安装完整 Skill；未引入 dossier、contract、growth、review、monetization、scripts 或 templates；运行时组织标题由本项目提供，事实/安全/CreativeBasis/CreativeBrief/CreatorProfile 优先 | 仅限内部非商业实验；商业使用前必须取得版权所有者书面授权，不进入前端 bundle |
| [modelscope/FunASR](https://github.com/modelscope/FunASR) | `a63ededd85a1b42ee7ce892eb44e48cdc234d922`（2026-09-01） | `funasr/auto/auto_model.py`、`examples/openai_api/server.py`、SenseVoice/FSMN-VAD/Paraformer 配置与 `sentence_info` | MIT | 本地 ASR Provider、SenseVoice、VAD、标点、时间戳、CPU/CUDA 推理与常驻服务边界 | 通过 PyPI `funasr==1.4.12` 在隔离的 localhost-only Python 服务中调用 `AutoModel`；TypeScript 业务只访问独立 HTTP Adapter | inspired / API integration / isolated service | 未复制官方 Server；独立实现 `/health`、`/models`、`/transcribe` 契约、上传限制、错误码、模型常驻和产品级 Resolver | 本机独立进程，仅监听 `127.0.0.1` |
| [modelscope/FunClip](https://github.com/modelscope/FunClip) | `2a954d4fbad6a57a5271390be4eb43f80d201b60`（2026-09-01） | `funclip/model_selection.py`、`funclip/videoclipper.py`、`funclip/utils/subtitle_utils.py` | MIT | 视频到音频再到 ASR、字幕分段、时间戳、长视频与可选说话人流程参考 | 延续本项目 FFmpeg → 私有 Audio Asset → TranscriptionProvider → Transcript；不引入其 Gradio UI | architecture reference only / inspired | 未复制 FunClip Python UI、剪辑器或 SRT 实现；本阶段不做剪辑和说话人分离 | 不直接集成；仅保留架构参考 |
| [QwenAudio/Fun-ASR](https://github.com/QwenAudio/Fun-ASR) | `a1d0043dfde93ce836894c31b6fe2d22c4682b10`（2026-09-01） | `README_zh.md`、`model.py`、`examples/README.md`、Fun-ASR-Nano ModelScope checkpoint | Apache-2.0；Nano 权重模型卡为 Apache-2.0 | Fun-ASR-Nano 高质量中文、方言/口音、专有词与原生 CTC 时间戳候选 | 仅通过 FunASR/ModelScope API 可选加载 `FunAudioLLM/Fun-ASR-Nano-2512`，并由本机 benchmark 决定产品质量档位 | inspired / API integration | 未复制仓库 `model.py`；不使用 HF 旧权重的缺失 CTC 时间戳路径，优先 ModelScope checkpoint | 作为可选本地模型，不作为 UI 固定映射 |
| [火山引擎豆包语音官方文档](https://www.volcengine.com/docs/6561/1631584?lang=zh) | 2026-09-01 核验 | 极速版 `1631584`、标准版 `1354868`、热词 `155739` | 官方文档条款 / 不复制源码 | 极速识别 endpoint、API Key/Legacy 认证、请求响应、限制、Header 状态与热词字段 | 依据公开协议独立实现 TypeScript DoubaoClient/Provider；通过 Workspace 加密配置调用 HTTPS API | inspired | 未复制官方 Python Demo；新增 Zod 校验、FFmpeg 前处理、双输入路径、显式错误、ApiUsage 与私有 Storage | 运行时通过火山引擎 HTTPS REST API 连接 |
| [redfox-community](https://github.com/redfox-data/redfox-community) | `8e37c4ed38cc34e2d3f23dbfffbfc01abcb74ce1`（2026-08-31） | `skills/video-downloader/`、`skills/global-ai-news-brief/`、`skills/cn-last30days/` | 未声明 / NOASSERTION | 单作品解析、抖音/小红书 content search 公开协议、统一结果归一化思路；排名/transcript 仅作未来边界研究 | 依据公开协议独立实现 TypeScript RedFoxClient/Adapter；单作品收录仍走 `parseWork`，发现层只在服务端执行搜索 | inspired | 未复制 Python/CLI/Skill 源码；新增 ExternalContent/ExternalAccount DTO、Workspace 凭证、ApiUsage、5 分钟短缓存与显式收录门 | 运行时通过 RedFox HTTPS REST API 连接 |
| [redfox-python-sdk](https://github.com/redfox-data/redfox-python-sdk) | `a711fcbde85fe7632ab91ec6b3b018504bac7e43`（v0.4.0，2026-09-02 重新核验） | `redfox/client.py`、`redfox/endpoints/douyin.py`、`redfox/endpoints/xiaohongshu.py`、`redfox/endpoints/hotspot.py`、`redfox/exceptions.py` | README 声明 MIT；仓库未提供可识别 LICENSE 文件 | 官方 content/account/work 契约，以及抖音热门/飙升榜、小红书热门/黑马榜、全网热点榜的实际 endpoint 与参数 | 独立实现共用 TypeScript Client、既有 Discovery Adapter，并在 D3 增加 RedFoxTrendProvider；业务层只依赖 TrendProvider/ExternalContent DTO，不引入 Python SDK | inspired / API integration | 趋势运行时只调用当前核验的 `likesRank`、`getDailyRank`、`getWeeklyRank`、`getXhsCozeSkillDataOne/Seven`、`getLowPowderExplosiveArticle`、`hotKeyword/list` 契约；不复制 SDK 源码；HTTP fixture 覆盖 endpoint、Header、method 和 body | 不嵌入 SDK；运行时通过 Workspace 加密凭证连接 RedFox HTTPS API |
| [Yefclub/Voxen](https://github.com/Yefclub/Voxen) | `27547cfd8e684be2c66b0e35de136e1592e0aa01`（2026-08-07） | `prisma/schema.prisma`、`apps/worker/src/pipeline.py`、`apps/worker/src/job_lease.py`、`apps/web/src/routes/jobs.ts`、`apps/web/src/routes/library.ts` | MIT | ingest / job / transcript / library 的显式状态、处理管线与终态反馈 | 延续本项目“SourceItem → IngestJob → BullMQ Worker → Asset/Transcript”边界；Content Discovery 只在用户明确收录后进入该管线 | architecture / workflow inspired | 使用 TypeScript、BullMQ、Prisma、显式状态和 Workspace 作用域独立实现；未复制 Python/TS 源码 | 无直接集成计划；必要时仅参考公开协议 |
| [dmamediai/contentflow](https://github.com/dmamediai/contentflow) | `287b505e78396235d2bd66f09f640248b7464605`（2026-07-28） | `docs/ARCHITECTURE.md`、`PHASE3_AI_STUDIO_COMPLETE.md`、`apps/api/prisma/schema.prisma`、`apps/api/src/routes/media.ts`、`apps/web/src/hooks/useAI.ts` | 未声明 / NOASSERTION | discovery 进入媒体库、AI Studio 与 repurpose 的产品衔接，以及 Team/RBAC 边界 | 内容发现的“收录素材 / 加入选题 / 开始创作”分流连接既有 Library、ContentProject 和 Studio；不采用其业务路由 | workflow donor / inspired | 将 Team 概念收敛为 Workspace，角色固定为 OWNER/ADMIN/EDITOR/VIEWER；未复制或适配其代码 | 许可证明确前不复制或适配源码；如需能力，仅通过公开 API/MCP |
| [OverSeek Socials / socaliseit](https://github.com/MerlinStacks/socaliseit) | `e4672b07a62e` | `app/prisma/schema.prisma`、`app/src/lib/bullmq/connection.ts`、`app/src/lib/bullmq/queues.ts`、`docker-compose.dev.yml` | MIT | Next.js + Prisma、队列连接、媒体库和 Docker Compose 的基础设施组织 | 采用 Web/Worker 分离、共享 Redis 队列名称与 Compose 健康检查 | inspired | 缩减为单一 `SYSTEM_HEALTH_CHECK` 队列，不引入媒体/发布 Worker | 当前不直接集成 |
| [Pendpost](https://github.com/pendpost/pendpost) | `f7947ab8a876` | `lib/publish-hold.mjs`、`lib/publish-job.mjs`、`test/publish-hold.test.mjs`、`test/edited-since-approval.test.mjs` | MIT | 人类批准门、批准后编辑失效、发布前再次确认、活动记录 | 采用“真实发布必须处于 APPROVED”的不可绕过服务端规则；本阶段只保留 Provider 契约，不实现发布 | inspired | 用显式状态机和未来的 AuditLog 重新实现，不沿用其本地文件模型 | 将来若接入，也只通过本项目 PublishingProvider |
| [Postiz](https://github.com/gitroomhq/postiz-app) | `c98ea0465022` | `libraries/nestjs-libraries/src/integrations/integration.manager.ts`、`libraries/nestjs-libraries/src/integrations/social`、后台任务与日历模块 | AGPL-3.0 | 日历、调度、发布 Provider、集成管理与后台任务 | 只采用 Provider 注册边界和异步发布思路；阶段 1 不实现调度或发布 | inspired | 不复制 NestJS 模块或 Provider 实现 | 优先独立部署，通过 REST API/MCP/Webhook 连接 |
| [TryPost](https://github.com/trypostit/trypost) | `b689e3902cfc` | `app/Policies/WorkspacePolicy.php`、`app/Traits/HasWorkspace.php`、Workspace/Brand/Media 模型与权限测试 | AGPL-3.0 | Workspace 策略、Brand Profile、资产库和权限测试 | 采用“每次请求都验证成员关系”的服务端 Workspace 策略；不实现品牌/资产业务 | inspired | 用 Prisma 查询和 TypeScript RBAC helper 重新实现 | 优先独立服务 + REST/MCP；不复制 PHP 源码 |
| [karakeep-app/karakeep](https://github.com/karakeep-app/karakeep) | `5a2f009e2f6d266087f2f3f527e6e384cefd6de4`（2026-08-31） | `packages/shared-server/src/queues.ts`、`packages/shared/types/bookmarks.ts`、`packages/shared/searchQueryParser.ts`、`packages/trpc/routers/bookmarks.ts`、书签卡片/标签/稍后处理 UX | AGPL-3.0 | 快速收录、收藏、标签、全文搜索、内容卡片和“save now, process later”的产品分层 | 复用本项目既有 SourceItem/IngestJob/Tag/Collection；Content Discovery 搜索结果不自动入库，只在用户点击收录后进入处理管线 | architecture / UX donor / inspired | 仅根据公开行为和界面结构独立实现；未复制、改写或嵌入任何 AGPL 源码 | 如未来复用服务，必须独立部署并通过 REST/MCP/Webhook 连接 |
| [sansan0/TrendRadar](https://github.com/sansan0/TrendRadar) | `8ee26026ba6c11dec41a95fb3895a7162876caa1`（2026-07-17，2026-09-02 重新核验，shallow clone 已是最新） | `trendradar/crawler/fetcher.py`、`trendradar/core/data.py`、`trendradar/core/analyzer.py`、`trendradar/storage/schema.sql`、`mcp_server/tools/data_query.py` | GPL-3.0 | 多来源热点标准化、标题/URL 去重、首次出现识别、排名历史、时间窗查询、关键词分组与推送前数据整理 | D3 仅借鉴“Provider data → snapshot → read model”、排名变化和新出现/持续/上升的工作流；使用 Prisma/PostgreSQL 与自有 TypeScript 重新实现最小 TrendSnapshot/TrendOpportunity，不引入 TrendRadar runtime | architecture / workflow / ranking UX donor / inspired | 未复制 CSS、组件、SQL、Python 抓取器、存储、MCP、权重公式或报告源码；不使用其自动抓取、调度和推送；不将同名 fork 误认为 exact repository | 不直接集成；若未来确需其服务，必须独立部署并通过 REST/MCP/Webhook 连接 |
| [Postmill](https://github.com/postmill-ai/postmill-app) | `2ea67c89462a` | `libraries/nestjs-libraries/src/providers/provider-resolution.service.ts`、`provider-catalog.service.ts`、Brand Voice/Prompt Library/RBAC 模块 | AGPL-3.0 | Provider catalog/resolution、Brand Voice、Prompt Library、RAG 与 RBAC | 采用业务层只依赖 Provider 契约的原则；阶段 1 不实现 catalog、RAG 或 Brand Voice | inspired | 使用最小 TypeScript interface 与显式 Mock 重新实现 | 优先独立服务 + REST/MCP；不复制 Provider 源码 |

## 采用

- pnpm workspace + Turborepo，Web、Worker 与共享包分离。
- PostgreSQL/Prisma 作为持久层，WorkspaceMember 唯一约束保证成员隔离。
- Better Auth 管理 User/Session/Account/Verification，业务层不重复创建身份系统。
- 服务端集中执行 Workspace/RBAC 校验，页面隐藏不作为安全边界。
- BullMQ/Redis 只实现可验证的系统健康任务，后续业务任务按阶段新增。
- S3-compatible StorageProvider 隔离 MinIO 细节。
- Source/Transcription/LLM/Publishing/Storage 只暴露统一 Provider 契约。
- Mock 必须返回 `providerMode: "MOCK"` 并记录 `MOCK_PROVIDER_USED`。
- 真实发布必须经过人工 `APPROVED`，批准后变更应使批准失效（后续发布阶段实现）。
- 阶段 2 新增 `CONTENT_INGEST` 业务队列，Provider 请求与持久化只在 Worker 中执行。
- 阶段 2 素材库只实现 PostgreSQL `ilike` 搜索、人工标签与一级 Collection，不引入独立搜索服务或目录树。
- Content Discovery V1 只正式开放 Douyin 与 Xiaohongshu；搜索结果不自动入库，用户明确点击收录后才进入既有 RedFox ingest 管线。
- 阶段 3C 只接入豆包大模型录音文件极速版；视频先通过系统 FFmpeg 生成受限 MP3，再由独立转写队列调用 Provider。

## 第三方 Packages

| Package | Version | Repository / source | License | Usage | copied / adapted / inspired | Modifications |
| --- | --- | --- | --- | --- | --- | --- |
| `@mozilla/readability` | `0.6.0` | [mozilla/readability](https://github.com/mozilla/readability) | Apache-2.0 | 从已通过 SSRF 校验的公开 HTML 中提取可读正文与标题 | package usage | 未修改依赖源码；输出再次规范化为纯文本 |
| `jsdom` | `30.0.1` | [jsdom/jsdom](https://github.com/jsdom/jsdom) | MIT | 为 Readability 提供服务端 DOM 解析 | package usage | 未修改依赖源码；不执行远端页面脚本 |
| `@types/jsdom` | `30.0.0` | [DefinitelyTyped/types/jsdom](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/jsdom) | MIT | jsdom 的 TypeScript 类型声明 | package usage | 未修改依赖源码，仅用于开发期类型检查 |
| `server-only` | `0.0.1` | React server-only marker package | MIT | 阻止 Web Integration server module 被 Client Component 引入 | package usage | 未修改依赖源码；只作为 Next.js server boundary marker |
| `funasr` | `1.4.12` | [modelscope/FunASR](https://github.com/modelscope/FunASR) | MIT | SenseVoiceSmall、Paraformer、FSMN-VAD 与 Fun-ASR-Nano 本地推理 | package usage | 隔离在 `services/local-asr/.venv`，未修改依赖源码 |
| `torch` / `torchaudio` | `2.11.0+cu130` | [pytorch/pytorch](https://github.com/pytorch/pytorch) / 官方 CUDA wheel | BSD-style | RTX 5060 CUDA 13.0 本地推理运行时 | package usage | 仅用于独立 Python 服务，不进入 Node/Web bundle |
| `fastapi` / `uvicorn` | `0.141.1` / `0.52.4` | [fastapi/fastapi](https://github.com/fastapi/fastapi) / [encode/uvicorn](https://github.com/encode/uvicorn) | MIT / BSD-3-Clause | localhost-only Local ASR HTTP 服务 | package usage | 独立实现最小接口，不复制官方示例 Server |
| `edge-tts` | `7.2.8` | [rany2/edge-tts](https://github.com/rany2/edge-tts) | LGPL-3.0 | 仅在开发 benchmark 脚本中把项目自有文本合成为测试音频 | tooling usage | 不进入产品运行路径；生成 fixture 明确标记为合成语音 |

## 不采用

- 不采用参考项目的完整数据库或业务域；它们包含当前 V1 不需要的素材、AI、发布、分析、计费等模型。
- 不采用 Postiz/Postmill 的大型 NestJS 模块体系；对当前单一 Web + Worker 基线过重。
- 不采用 TryPost 的 Laravel/PHP 技术栈；与本项目 TypeScript/Next.js 约束不一致。
- 不采用 Karakeep 的完整抓取、独立搜索、浏览器扩展或任何 AGPL 源码；阶段 2 只独立实现最小素材库边界。
- 不采用国外平台 Provider 实现；国内平台协议和合规边界不同。
- 不采用 ContentFlow 的任何源码；仓库当前没有可识别许可证。
- 不在本阶段实现 Brand Voice、Prompt Library、RAG、AI Studio、scheduler 或 publishing。

## License Boundary

- **AGPL / GPL**：优先独立部署，通过 REST API、MCP 或 Webhook 集成；禁止将大量源码复制进主仓库。
- **MIT**：保留许可证和版权要求时允许适配，但仍优先依据公开行为重新实现最小能力。
- **未声明许可证**：按不可复制处理；只允许高层架构启发，不适配源码。
- 每次外部代码引入都必须在本文件记录 repository、source file、license、usage、copied/adapted/inspired 和 modifications。
