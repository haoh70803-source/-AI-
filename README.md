# 鑫世界工作台 1.2 本地融合版

本版升级说明见 `docs/UPGRADE-1.2.txt`。使用根目录 `启动工作台.cmd` 启动，访问 `http://localhost:3032`。账号与权限保持1.0；新增知识版本、事实确认、选题评分审核和IP背景版本。AI与外部服务尚未启用。

---

# AI 内容生产中心

> **当前协作入口（2026-10-07）：** 请先读[内容工作台协作交接](docs/WORKBENCH_HANDOFF.md)，区分源码、3000/3030实际版本、验证范围与同事协作顺序。
>
> **历史说明：** 下方阶段3C、V1、First Run及测试说明保留作历史背景；旧启动命令可能执行迁移或启动Worker，以当前交接的环境检查与授权为先。

> **治理提示：** 当前产品与架构定义以 [PRODUCT.md](PRODUCT.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[LEGACY.md](LEGACY.md)、[AGENTS.md](AGENTS.md) 为准。下文部分阶段状态、功能完成度和历史开发说明尚未同步，不能作为当前产品定义。

> **主仓定位：** [`lazyyz1/xsj-content-center`](https://github.com/lazyyz1/xsj-content-center) 是 AI 内容生产中心后续开发、问题跟踪和文档维护的唯一主仓。新功能和修复应从本仓选择明确的目标分支开始；当前 Cleanup 尚未建立 `main`，也未切换 GitHub 默认分支。

旧仓 [`lazyyz1/XSJ`](https://github.com/lazyyz1/XSJ) 仅作为历史实现、数据和迁移参考保留，不再作为后续开发入口。旧仓仍有未提交代码、本地数据库及交付资产，备份和恢复状态尚未完整验证；引用其中内容前须重新审查，不能把旧仓状态当作本仓事实。

> **当前阶段：V1 内部试用候选。** 本仓包含内部试用所需的业务代码和部署配置，但最新 Cleanup 验证仍为部分完成：完整认证与内容生产 E2E 尚未通过，目标提交的真实 Provider、生产数据及完整业务链路也未完成验收。配置文件存在不代表当前线上绑定或部署状态已确认。

内部试用文档：

- [V1 内部试用说明](docs/V1_INTERNAL_TRIAL.md)
- [V1 产品验收记录](docs/V1_PRODUCT_ACCEPTANCE.md)
- [V1.5 Backlog](docs/V1_5_BACKLOG.md)

阶段 3C Doubao ASR Provider：在 RedFox 已保存视频基础上，接通“VIDEO → FFmpeg → AUDIO → 豆包录音文件极速版 → Transcript → 素材库”的真实转写链路；不包含 LLM、AI 分析或发布。

## Prerequisites

- Node.js `>=24`（本阶段验证：`24.18.0`）
- pnpm `11.19.0`
- Docker + Docker Compose
- FFmpeg 及 FFprobe（本阶段验证：`9.0`，需要 MP3 编码能力）
- 可选本地 ASR：Python `3.11`；NVIDIA GPU 建议使用 CUDA 版 PyTorch

## First Run

```bash
copy config\environments\local-real.env.example .env.local-real
pnpm install
# The one-command local runtime: Docker infra + safe migration deploy + ASR + Worker + Web.
pnpm dev:up
```

Web 默认运行在 `http://localhost:3000`，MinIO Console 默认运行在 `http://localhost:9001`。

`pnpm dev:up` 使用现有 `content-center_postgres_data`、`content-center_redis_data`、`content-center_minio_data` 持久卷，不执行 `down -v`、reset 或 seed 覆盖。`pnpm dev` / `pnpm dev:real` 只接受显式的 `.env.local-real`，不会再隐式加载根 `.env`；该文件不能指向 Render staging 或 native 临时 55432 cluster。测试使用独立的 `.env.local-test`，见 [`config/environments/README.md`](config/environments/README.md)。

标准生产 Blueprint 设计为使用 Render Media Relay：Render Web 独占 Persistent Disk，Worker 通过受保护的内部 HTTP 流式读写；MinIO / S3-compatible（包括 R2 兼容配置）保留为可选部署模式。free-staging 配置不包含相同的独立 Worker/Persistent Disk 拓扑；当前实际平台绑定待核实。配置与安全边界见 [`docs/render-media-storage.md`](docs/render-media-storage.md) 和 [`docs/production-storage.md`](docs/production-storage.md)。

## Services

| Service | 用途 | 默认端口 |
| --- | --- | --- |
| Web | Next.js App Router | `3000` |
| Worker | BullMQ 系统健康、内容采集与独立转写任务消费者 | 本机进程 |
| PostgreSQL | Auth、Workspace、素材、采集任务、标签、Collection、AuditLog | local-real Compose `55432`（容器内 `5432`）；local-test `55433` |
| Redis | BullMQ 队列 | local-real Compose `6379`；local-test `6380` |
| MinIO | S3-compatible 对象存储 | local-real Compose `9000` / `9001`；local-test `9002` / `9003` |
| Local ASR | localhost-only FunASR 语音转写 | `8765` |

## Commands

```bash
pnpm dev:up
pnpm run doctor
pnpm dev:down

pnpm dev:real
pnpm dev:web
pnpm dev:worker
pnpm dev:asr

pnpm asr:fixtures
pnpm asr:benchmark

pnpm lint
pnpm typecheck
pnpm test:isolated
pnpm test:e2e:isolated
pnpm build

pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

基础设施快捷命令：`pnpm infra:up`、`pnpm infra:down`。

## Exact Versions

| Package | Version |
| --- | --- |
| Next.js | `16.3.4` |
| React / React DOM | `19.2.8` |
| TypeScript | `6.0.3` |
| pnpm | `11.19.0` |
| Turborepo | `2.10.12` |
| Tailwind CSS | `4.3.3` |
| Better Auth / Prisma adapter | `1.7.2` |
| Prisma / Prisma Client | `6.19.3` |
| BullMQ | `6.3.3` |
| ioredis | `6.0.0` |
| AWS SDK S3 | `3.1123.0` |
| Vitest | `4.1.11` |
| Playwright | `1.62.1` |
| Mozilla Readability | `0.6.0` |
| jsdom | `30.0.1` |

## Integration Secrets

Workspace Provider 凭证使用 `INTEGRATION_ENCRYPTION_KEY` 加密。该值必须是随机生成的 32-byte base64 key，不得使用可猜测文本，也不得提交到 Git。

生产环境和 Workspace 使用的 RedFox、豆包语音识别、Kimi AI 凭证，建议由 OWNER / ADMIN 在后台「设置 → AI 与外部服务」中配置。Provider 相关环境变量仅用于开发、测试或系统基础配置，不是正式 Workspace 业务凭证的首选来源。

生成新 key：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

将输出仅写入本机或部署环境的：

```text
INTEGRATION_ENCRYPTION_KEY=
```

Key 缺失时，服务不会回退到明文保存，设置页会明确提示密钥加密服务尚未配置。Key 格式或长度错误会明确失败。轮换流程见 [`docs/security/integration-secrets.md`](docs/security/integration-secrets.md)。

RedFox 通过 Workspace Integration 配置使用，不读取 `REDFOX_API_KEY` 环境变量。官方当前未公开无需作品 URL 的轻量鉴权/健康端点，因此设置页只确认 `CONFIG_VALID`，明确显示 `LIVE_API_TEST_NOT_AVAILABLE`，不会为了“测试连接”自动解析或产生调用。

Doubao ASR 默认使用新版控制台 API Key 和 `volc.bigasr.auc_turbo`，也兼容旧版 App ID + Access Token。凭证同样只从 Workspace 加密配置读取。官方没有无需音频的轻量 health endpoint，因此不会用付费识别伪装连接测试。协议与限制见 [`docs/doubao-asr.md`](docs/doubao-asr.md)。

免费本地语音转写由 localhost-only FunASR 服务提供。本地模型没有 API 调用费用，但会消耗本机 CPU/GPU、内存和磁盘。普通用户只选择「速度优先 / 均衡推荐 / 质量优先」，具体模型依本机 benchmark 由 Resolver 决定。安装、实测结果和资源消耗见 [`docs/local-asr.md`](docs/local-asr.md)。

Prisma 固定在 `6.19.3`：阶段初始化时 `prisma` 的 npm `latest` 指向 `8.0.0-rc`，而 Better Auth 官方明确支持 Prisma 6；这里优先稳定和兼容，不追逐 RC。

## What Works

- email/password 注册、登录、数据库 Session 和退出登录。
- 新用户 Onboarding 创建一个 Workspace，并成为 OWNER。
- 服务端 `requireSession`、`requireWorkspace`、`requireWorkspaceRole` 与 Workspace 隔离查询。
- OWNER/ADMIN 可访问成员列表；EDITOR/VIEWER 无管理权限。
- Source、Transcription、LLM、Publishing、Storage Provider 契约。
- 显式 Mock Provider：返回 `providerMode: MOCK` 并记录 `MOCK_PROVIDER_USED`。
- Web 创建 `SYSTEM_HEALTH_CHECK`，Redis/BullMQ Worker 消费并完成任务。
- MinIO 上传、Signed URL 和删除。
- Storage 统一使用 `StorageProvider`：开发默认 MinIO / S3-compatible，生产 V1 默认 Render Media Relay；对象保持私有，仅通过 5 分钟短时 URL 播放或下载。S3-compatible（包括 R2）是可选回退模式。
- Dashboard 的计数来自 Workspace 范围内的数据库查询；空库显示真实的 `0`。
- 「AI 与外部服务」页面从 Workspace `IntegrationConfig` 读取 RedFox、豆包语音识别、Kimi AI 状态，支持 OWNER/ADMIN 保存、禁用、启用和删除；API 只返回公开配置与 `lastFour`。
- Provider secret 通过 AES-256-GCM、随机 IV 和认证标签加密保存；Worker 使用同一 Workspace scoped IntegrationService 解密入口。
- Storage 继续由服务端环境变量管理，并明确显示 `Environment Managed`。
- RedFoxSourceProvider：只开放明确的抖音作品链接/分享文案，使用 Workspace 解密后的 API Key 调用真实 RedFox 解析协议。
- RedFox 媒体经 SSRF/DNS/重定向/超时/大小/MIME 校验后流式落入当前 StorageProvider；Render 生产由 Web Persistent Disk 持有，素材页只使用 5 分钟受保护 URL。
- `SourceAsset` 显式记录 REMOTE/DOWNLOADING/STORED/FAILED；至少一个 Asset 为 STORED 才允许 SourceItem READY。
- `ApiUsage` 对每次 RedFox `PARSE_WORK` 调用记录 1 unit；官方未返回成本时 `cost = null`。
- READY 抖音 canonical URL 在同一 Workspace 内禁止重复收录，避免重复调用；FAILED 素材可显式重试。
- `TRANSCRIBE_SOURCE` 独立队列：已保存视频通过 FFmpeg 提取 MP3（mono / 16 kHz / 64 kbps），通过当前 StorageProvider 保存后调用真实 DoubaoTranscriptionProvider。
- 同一 `TRANSCRIBE_SOURCE` 队列支持默认免费本地 FunASR；`TranscriptionQualityResolver` 根据硬件、已安装模型和本机 benchmark 解析质量档，本地失败不会默认转豆包。
- Doubao 支持公网 Signed URL 和受控小文件 `audio.data` 两条输入路径；localhost 不会作为远端音频地址交给云端。
- Transcript 显式标记 `DOUBAO_ASR / REAL`，展示全文和毫秒分段；允许 OWNER/ADMIN/EDITOR 转写或重新转写，VIEWER 只读。
- 重新转写复用 STORED AUDIO；旧 Transcript 仅在新结果成功后替换，失败时保留。
- `ApiUsage` 记录 `TRANSCRIBE_FLASH`、时长与估算使用小时，供应商未返回账单时 `cost = null`。
- Manual Text Ingest：文本通过真实 Worker 入库，并生成明确标记为 `MANUAL / REAL` 的 Transcript。
- Generic Web URL Extraction：仅抓取公开 HTTP(S) 网页，经 SSRF 校验后提取为纯文本正文。
- Library：卡片/列表视图、真实分页、标题/作者/正文搜索、平台/类型/状态/标签/Collection 筛选和排序。
- 人工 Tags 与一级 Collections，可在素材详情中添加和移除。
- Ingest Jobs：显式状态、进度、错误、自动瞬时错误重试和人工失败重试。
- SourceItem 归档、确认后删除及对应 AuditLog。
- 所有素材、任务、Transcript、Tag 与 Collection 查询均执行 Workspace Membership 隔离。

## What Does Not Work Yet

- LLM 调用：未接入
- RedFox 以外的视频来源：未开放
- 豆包标准版 fallback、热词管理后台、字幕编辑器：未实现
- AI 创作：未实现
- Publishing：未实现
- ContentProject、Creator Memory、热点发现：未实现

这些能力不会以假按钮、假 API 或假成功状态呈现。

## Security Notes

- `.env`、真实 Key、Cookie 和 Token 不提交到 Git。
- 外部凭证只允许 Web server/Worker 解密；API 和 UI 只显示状态与末四位。
- URL 抓取只允许 HTTP(S)，对初始地址、DNS 结果和每次重定向执行 SSRF 校验，并限制超时、响应体大小和跳转次数。
- RedFox 返回的临时媒体 URL 仅在 Worker/数据库服务端使用，不通过素材 API 返回；播放只使用本项目私有 Storage 的短期 Signed URL。
- 媒体下载默认限制为视频 300 MiB、图片 30 MiB，拒绝 HTML/JSON 或与 Asset 类型不匹配的 MIME。
- 极速 ASR 在调用前强制检查 2 小时 / 100 MB 限制；私网音频只有在不超过 20 MB 时才允许二进制上传。
- 网页正文只保存和渲染 normalized plain text，不把远端 HTML 注入页面。
- `IntegrationConfig` 将 public config 与 AES-256-GCM encrypted secret 分开保存；缺少 master key 时 fail closed，不写明文。
- Render Media Relay 的内部 Secret 和签名 Secret 只在 Web/Worker 服务端环境变量中使用；内部上传/读取/删除要求 workspace/source/asset 三重 scope，公网媒体 token 有效期最多按用途控制为 5/15 分钟。
- 真实外部发布必须等待后续阶段实现 `APPROVED` 人工审核门。

## Reference Research

参考项目、源码位置、许可证边界和采用/不采用决策见 [`docs/reference-map.md`](docs/reference-map.md)。参考仓库位于主仓库外，不参与主项目 Git 跟踪。
