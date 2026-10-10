# GitHub 独立运行与部署说明（2026-10-10）

本说明针对 origin `haoh70803-source/-AI-` 的独立集成分支。当前验证结论见根目录七份 `GITHUB_*` / `*_REPORT.md` 报告。配置存在不等于可部署或已上线；真实 Provider、生产部署、主分支合并均未授权执行。

## 环境与源码

- Node.js 24.21.0（`.node-version`；package.json 允许 >=24）、pnpm 11.19.0。
- pnpm workspace + Turborepo；Next.js 16.3.4 / React 19.2.8；Prisma 6.19.3 / PostgreSQL；BullMQ / Redis；私有 S3-compatible 存储；FFmpeg/FFprobe。
- 可选本地 ASR 使用 Python，依赖见 `services/local-asr/requirements.txt`；模型与虚拟环境不提交，另行安装。ASR 与真实外部服务不属于基础构建成功的证明。
- PostgreSQL 与对象存储必须由开发者独立准备。不能使用维护者 `.local-data`、`output`、账号、Token 或个人数据库。

```bash
git clone --branch integration/github-safe-20261010 https://github.com/haoh70803-source/-AI-.git xsj-workbench
cd xsj-workbench
pnpm install --frozen-lockfile
pnpm db:generate
```

分支只有在验证门通过后才会推送；若远程分支不存在，先查看 `GITHUB_MERGE_SUMMARY.md`，不要将本地克隆验证当成远程克隆成功。

## 可配置的离线开发入口

历史 `dev:real` / `dev:up` 不适合作为新同事默认入口：`assertLegacyRuntime` 已阻止 LOCAL_REAL，旧入口还可能自动执行迁移。Windows 根目录 `.cmd` 文件也依赖维护者原有私有配置。

复制 `config/environments/local-review.env.example` 为 `.env.local-review`，填写自建隔离数据库、存储与密钥。此 profile 严格要求 PostgreSQL `127.0.0.1:55438/content_center_12_review`、S3-compatible `127.0.0.1:19020`；Web 使用 3022。先检查端口与数据库归属，绝不能指向他人现有 review 数据库。

Windows PowerShell：

```powershell
Copy-Item config/environments/local-review.env.example .env.local-review
# 手工填写私有配置；新密钥仅写入该忽略文件，不打印到共享日志。
$env:LOCAL_PROFILE_FILE='.env.local-review'
node scripts/local-web.mjs review check
node scripts/local-web.mjs review
```

Linux/macOS：

```bash
cp config/environments/local-review.env.example .env.local-review
LOCAL_PROFILE_FILE=.env.local-review node scripts/local-web.mjs review check
LOCAL_PROFILE_FILE=.env.local-review node scripts/local-web.mjs review
```

`check` 仅验证配置格式；真正依赖状态查看 `/api/health/ready`。离线 review 禁用真实 AI、采集、飞书定时同步和 Worker；不宣称完整在线业务可用。`LOCAL_PROFILE_FILE` 仅改变私有配置来源，不绕过 scope 或 profile guard；缺失/错误配置 fail closed。

## 环境变量

完整键列表以 `.env.example`、`config/environments/local-review.env.example`、`local-test.env.example`、`feishu.env.example` 为准。

| 类别 | 键及要求 |
| --- | --- |
| 身份与加密 | `AUTH_SECRET` 至少 32 个随机字符；`INTEGRATION_ENCRYPTION_KEY` 为随机 32-byte Base64，已有数据部署须保留原值；`AUTH_COOKIE_PREFIX` 隔离环境 |
| 数据库/队列 | `DATABASE_URL`、`REDIS_URL`；区分开发、隔离测试、review、生产，不共用 |
| URL/profile | `APP_URL`、`ENVIRONMENT_ID`、`APP_ENV`；`LOCAL_PROFILE_FILE` 是启动器读取的本地文件路径 |
| 存储 | `STORAGE_DRIVER`；S3 模式需 `S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_FORCE_PATH_STYLE` |
| Relay 可选 | `MEDIA_STORAGE_ROOT/MEDIA_RELAY_INTERNAL_BASE_URL/MEDIA_RELAY_BASE_URL/MEDIA_RELAY_INTERNAL_SECRET/MEDIA_RELAY_SIGNING_SECRET`；须独立审查服务拓扑 |
| 安全策略 | `WORKER_MODE/FREE_WORKER_MODE/LOCAL_REVIEW_OFFLINE/EXTERNAL_CALLS_DISABLED/SYSTEM_MANAGED_PROVIDERS/MOCK_MODE/DEMO_AUTO_LOGIN/INTERNAL_SIGNUP_ENABLED`，按模板填写 |
| 外部服务 | Kimi、DeepSeek、Doubao、RedFox 和飞书按已有后台加密配置与各模块文档管理；配置存在不代表真实调用通过 |
| 可选能力 | `LOCAL_ASR_ENDPOINT/TRANSCRIPTION_PRIMARY/ASR_AUDIO_RETENTION_HOURS/FEISHU_WIKI_SYNC_ENABLED`；同步与真实 API 需明确启用 |

禁止把 API Key 放入 `NEXT_PUBLIC_*`、客户端包、CI artifact 或报告。Provider 未配置应返回明确不可用状态，禁止补造成功。

## 构建、测试与产物

```bash
pnpm lint
pnpm typecheck
node --experimental-vm-modules --test scripts/check-client-boundaries.test.mjs scripts/fusion-config.test.mjs scripts/local-profile.test.mjs scripts/local-web.test.mjs scripts/release-profile.test.mjs
pnpm build
node scripts/verify-build-artifact.mjs
```

`pnpm build` 使用现有隔离 release builder：复制源码到 `output/architecture-upgrade-20261005/releases/<id>`、使用同一 checkout 新安装的依赖、阻断构建网络、连接不可达端口 1，生成 `.next-production` 和 receipt；不会自动部署或迁移。新同事验证必须先在干净 checkout 安装依赖，不能把维护者 node_modules 链接进去。

数据库测试要先准备**全新专用** `LOCAL_TEST` 基础设施（允许的目标见 `packages/db/src/test-target.ts`），创建空测试 schema 后运行现有 Vitest/Playwright。测试使用明确 Fixture/Mock；真实 Provider opt-in 默认不执行。全套中部分测试写死 agent database/历史 fixture 路径，失败必须保留并记录。

当前 Compose 的 `minio/minio:RELEASE.2025-09-07T16-13-09Z` 拉取失败，Quay 同标签亦未可用。上游现为源码分发，见 [MinIO 官方说明](https://github.com/minio/minio/blob/master/README.md)。不可任意换用未经审核的社区镜像。CI `integration` 要求仓库变量 `TEST_S3_IMAGE` 提供审核过的兼容镜像及 digest，缺失时明确失败。设置该变量不表示本次任务已经验证了该镜像。

CI `quality` 在 Windows/Linux 安装冻结依赖，执行 lint、typecheck、原有启动与边界测试、明确范围的离线单元测试、生产构建和产物检查；`integration` 执行全套 Vitest 和现有 Playwright。代码检查失败不会自动放宽规则。GitHub Actions 当前尚未在远程执行，不能用本地结果替代。

## 测试部署与生产门

先在隔离 review profile 构建：

```powershell
$env:LOCAL_PROFILE_FILE='.env.local-review'
pnpm build
node scripts/verify-build-artifact.mjs
pnpm release:check review <receipt中的id>
pnpm release:start review <receipt中的id>
```

release review 使用端口 **3032**，与开发 review 的 3022 不同。ready 必须返回 HTTP 200 且 `ready=true`；存储/数据库未准备好时应失败。`/api/health/live` 只代表进程存活。

现有 Render YAML 仍引用历史仓库、历史分支，含 `autoDeployTrigger` 与 `preDeployCommand`；**本任务没有修改或应用这些配置**。当前 readiness 仅支持严格本机 profile，不能直接声称 Render/任意 Linux 云拓扑已就绪（CURRENT IMPLEMENTATION GAP）。上线前须单独批准仓库绑定、持久盘、内部 Relay 权限、域名、TLS、Worker 与健康策略，不能直接用此任务改生产。

## 数据库升级

Schema 与 `20261009083000_feishu_wiki_subscriptions` additive migration 同提交单元保存。当前任务未执行 `migration deploy`。已存在数据库先记录 `prisma migrate status`、导出数据库及对象存储并验证可恢复；审查 SQL、用户权限和执行目标，再经操作负责人授权运行 `pnpm --filter @content-center/db db:migrate`。从空库测试 schema 用 `db push --skip-generate` 的结果不代表 migration 路径验收通过。

## 故障与回滚

- Prisma `EPERM ...query_engine-windows.dll.node`：现有进程可能锁定 DLL；在全新 checkout 安装验证，不擅自停止同事服务。不要把生成失败当 lint/typecheck 通过。
- Turbo `spawn UNKNOWN`：区分二进制启动失败与代码错误；可直接调用各包声明的 ESLint/tsc 记录等价结果，CI 仍验证标准命令。
- `LOCAL_PROFILE_NOT_READY` / `RELEASE_CONFIGURATION_MISSING`：检查所选文件、目标端口和模板；不回退维护者私有数据库。
- Provider/MinIO 缺失：保持不可用、记录服务缺口，勿强行开启真实 API 或使用生产凭据。
- 浏览器路由：反向代理保留 Next.js App Router 请求与 API，不能按纯静态 SPA 覆盖所有路径；授权测试需验证深链刷新。
- 回滚代码：保留集成分支与源码快照；用新的 revert 提交撤回独立修复或整组业务变更，经审查后推到新回滚分支；不使用 reset/force push。服务回滚选择上一份已验证 receipt/构建版本，经人工批准切换进程。迁移回滚不能仅撤代码：新表数据先备份，必要时前向修复，不自动删表。
- 本地原始恢复资产：外部完整备份位置见 `GITHUB_PRE_MERGE_AUDIT.md`。备份中的动态数据库/运行文件不是一致性数据库导出；恢复必须另外验证数据库一致性与链接重建。
