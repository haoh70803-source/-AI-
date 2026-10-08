# 鑫世界 Studio P4：Doubao ASR 诊断与验证报告

- 检查日期：2026-09-17
- 项目基线：`13c649015641c35a464f40fa70bcffca49407ffc`
- 分支：`feat/production-readiness-v1b`
- 检查范围：真实运行环境与真实数据库只读审查、代码路径审查、隔离测试验证
- 本轮结论：未修改转录架构，未删除 Local FunASR，未提交或推送

## 结论摘要

1. 历史 Doubao 真实失败的主因是 provider 授权边界拒绝，不是 Workspace 配置缺失，也不是本地无法连接。13 次失败都有 provider request id，且 API Usage 记录了 `statusCode=45000030`；当前代码只有在 HTTP 403 分支才映射为 `DOUBAO_PERMISSION_DENIED`。
2. 另有 1 次历史的音频地址前置失败：当时 LOCAL_REAL 使用本机 MinIO，签名 URL 的 origin 是 `http://127.0.0.1:9000`，被公网地址安全检查判定为 `SSRF_BLOCKED`。该请求没有到达豆包。
3. Workspace 的 Doubao 配置当前仍存在且可以解密：`API_KEY`、`https://openspeech.bytedance.com`、`RECORDING_FILE_2_0`、`volc.seedasr.auc`；当前 `TRANSCRIPTION` 已切回 `LOCAL_FUNASR`，所以 LOCAL_REAL 不会调用它。
4. “资料 → 视频 → FFmpeg 音频 → 存储 → Local FunASR → Transcript”的 LOCAL_REAL 链路已真实通过；Doubao 生产链路保留，但公网 Relay 和真实云端 smoke 延后到生产就绪阶段。
5. Local FunASR 作为 LOCAL_REAL 的本地开发主路径已真实通过；生产主路径仍为 Doubao Recording File 2.0，当前公网 Relay 与云端 smoke 延后到生产就绪阶段。

## Current Phase Decision

当前 P4 收口策略已经明确：

- Development / LOCAL_REAL：`Local FunASR` primary；本地资料转写使用 `http://127.0.0.1:8765`，不要求公网 URL，也不调用 Doubao。
- Production：`Doubao Recording File 2.0` primary，Resource ID 为 `volc.seedasr.auc`。
- Local FunASR role：`DEV_FALLBACK`；生产环境不允许静默 fallback。

以下事项统一标记为 `DEFERRED_TO_PRODUCTION_READINESS`，这不是失败或取消：

- Render Media Relay 部署
- 公网 signed media URL 验证
- Doubao Recording File 2.0 real smoke
- Production Worker → Transcript end-to-end 验证

## 1. 真实环境启动与健康检查

执行了标准启动：

```text
pnpm dev:up
pnpm run doctor
```

最终 `doctor` 通过：

- PostgreSQL：`127.0.0.1:55432`
- Redis：`127.0.0.1:6379`
- MinIO API：`127.0.0.1:9000`
- MinIO Console：`127.0.0.1:9001`
- Local ASR：`127.0.0.1:8765`
- Worker：`127.0.0.1:3010`
- Web：`127.0.0.1:3000`
- Runtime database / Redis / worker / storage / RedFox / LLM / ASR：均为 OK
- Provider policy：`WORKSPACE`

首次冷启动时 Web runtime-health 响应超过 doctor 的单次等待窗口；直接访问返回 200，第二次 `pnpm run doctor` 已完整通过。这不是本轮 Doubao 失败原因。

## 2. 真实数据库只读审查

所有调查查询在 `SET TRANSACTION READ ONLY` 的事务中执行，并在审计结果返回前回滚；没有通过审计脚本写入 LOCAL_REAL 数据库。没有输出任何凭证值。

### Transcript 历史

`Transcript` 只保存最终结果，不保存失败记录。当前统计为：

| provider | providerMode | sourceType | 数量 |
| --- | --- | --- | ---: |
| `LOCAL_FUNASR` | `REAL` | `VIDEO` | 11 |
| `MANUAL` | `REAL` | `TEXT` | 4 |
| `MANUAL` | `REAL` | `VIDEO` | 1 |
| `TEST` | `REAL` | `VIDEO` | 1 |
| `DOUBAO_ASR` | `REAL` | `VIDEO` | 0 |

因此，当前真实库中没有成功落库的 Doubao Transcript；Local FunASR 是目前唯一有 11 条真实视频成功记录的自动转写 provider。

### `TRANSCRIBE` IngestJob 历史

| provider | status | errorCode | 数量 |
| --- | --- | --- | ---: |
| `LOCAL_FUNASR` | `SUCCEEDED` | 无 | 11 |
| `LOCAL_FUNASR` | `FAILED` | `LOCAL_ASR_INVALID_RESPONSE` | 4 |
| `DOUBAO_ASR` | `FAILED` | `DOUBAO_PERMISSION_DENIED` | 13 |
| `DOUBAO_ASR` | `FAILED` | `ASR_AUDIO_NOT_PUBLICLY_REACHABLE` | 1 |

### Doubao 权限失败

- 数量：13
- 时间范围：2026-09-09 至 2026-09-10
- SourceItem：`cmtu54yie005iq9t4z1he9htj`
- 音频 Asset：`cmtu56zj80017q9bkuavklwy1`
- 视频 Asset：`cmtu550wr000xq9bk9kxw9djv`
- 13 条 API Usage operation 均为：`TRANSCRIBE_FLASH`
- provider request id：均存在
- provider status code：均为 `45000030`
- 最终 Transcript：0 条

当前数据库没有保存 HTTP status 原值，但当前代码中 `client.ts` 与 `recording-file-client.ts` 都只在 HTTP 403 分支生成 `DOUBAO_PERMISSION_DENIED`；HTTP 401 是独立的 `DOUBAO_AUTH_FAILED`。因此这些记录可以确定为 provider 侧权限拒绝路径，而不是代码把 401、403 和普通业务错误无差别合并。

`45000030` 的具体账户侧含义没有被当前代码解码。本地证据能确认的是：请求已经抵达豆包，并在授权/resource/service 边界被拒绝。仅凭当前仓库无法进一步断言是 key 过期、resource 未授权、产品权限未开通，还是账号与 resource 不匹配；这些需要在豆包控制台或服务方侧核对。

### 音频公网可达失败

- 数量：1
- Job：`cmtl4u34i0001q9y8n6e3o7ic`
- 时间：2026-09-03
- SourceItem：`cmtjsz24p007tq994c5wrzbvl`
- 视频 Asset：`cmtjsz79y005hq95o59a1uxyv`，状态 `STORED`
- 音频 Asset：`cmtjszazl005vq95oqtv0gt73`，状态 `FAILED`，无 `remoteUrl`
- API Usage provider request id：不存在

该记录没有 provider request id，符合在本地音频输入准备阶段失败、没有发出 Doubao 请求的路径。

## 3. Workspace 配置核对

当前 `鑫世界` Workspace id 为 `cmtjg53te0000q9acwamzmfv4`，运行策略是 `WORKSPACE`，不是 system-managed 环境变量策略。

### 当前 Workspace 的有效配置

| 配置 | 当前值/状态 |
| --- | --- |
| `TRANSCRIPTION` | `CONFIGURED` |
| 转写来源 | `LOCAL_FUNASR` |
| quality | `BALANCED` |
| selection | `AUTO` |
| fallback | `false` |
| `DOUBAO_ASR` | `CONFIGURED` |
| auth mode | `API_KEY` |
| base URL origin | `https://openspeech.bytedance.com` |
| protocol | `RECORDING_FILE_2_0` |
| resource id | `volc.seedasr.auc` |
| 加密配置 | 可解密，secret keys 只有 `apiKey` |
| app/access token | 未使用 |

这说明：

- Workspace 配置存在；
- LOCAL_REAL 当前明确选择 `LOCAL_FUNASR`，不会因为 Doubao 配置存在而自动调用云端；
- 加密配置可用；
- `API_KEY` 形态与当前 client 的 `X-Api-Key` 分支一致；
- Doubao 的标准版 Resource ID 已保留为 `volc.seedasr.auc`，但本阶段不发起真实云端请求；
- 保存的 Doubao API Key 没有删除或替换。

System Configuration 里另有一条配置，但当前 `SYSTEM_MANAGED_PROVIDERS=false`，不会被本次 LOCAL_REAL Workspace 路径采用，不能把它误认为当前生效配置。

## 4. Doubao Provider 实现核对

### LOCAL_REAL 当前实际走的接口

当前 Workspace 的 `TRANSCRIPTION.source=LOCAL_FUNASR`，`resolveWorkspaceTranscriptionPlan()` 先检查本地 ASR 健康状态和模型策略，再由 Worker 选择 `LocalFunASRTranscriptionProvider`。该路径使用本地二进制音频，不需要公网 URL，也不调用 Doubao。

本次 LOCAL_REAL smoke 已通过：

```text
SourceItem → STORED VIDEO → FFmpeg → MinIO → TRANSCRIBE_SOURCE
→ Worker → Local FunASR → Transcript
```

### Production 保留的 Doubao 路径

生产 system-managed 路径保留 `DoubaoRecordingFileClient`，使用：

```text
POST /api/v3/auc/bigmodel/submit
POST /api/v3/auc/bigmodel/query
```

该 client 强制要求 `REMOTE_URL`，不接受二进制输入，并带有提交后轮询机制。Resource ID 固定使用 `volc.seedasr.auc`。当前 LOCAL_REAL 不调用这条路径；公网 Relay 和真实云端 smoke 延后到生产就绪阶段。

代码位置：

- `packages/providers/src/doubao/client.ts`
- `packages/providers/src/doubao/recording-file-client.ts`
- `apps/worker/src/transcription.ts`

### 错误映射

| 实际条件 | 代码错误 | 是否重试 |
| --- | --- | --- |
| HTTP 401 | `DOUBAO_AUTH_FAILED` | 否 |
| HTTP 403 | `DOUBAO_PERMISSION_DENIED` | 否 |
| HTTP 429 | `DOUBAO_RATE_LIMITED` | 是 |
| HTTP 5xx / provider `550xxx` | `DOUBAO_SERVER_ERROR` | 是 |
| provider 20000003 | `DOUBAO_EMPTY_TRANSCRIPT` | 否 |
| provider 45000002 / 45000151 | `DOUBAO_INVALID_AUDIO` | 否 |

因此当前历史的首要阻塞是权限/resource/service 授权，不是 endpoint 没有连通。接口/资源组合仍需在豆包侧确认 entitlement；仓库代码目前已经把 API key、resource id 和 Flash endpoint 按同一协议发送。

## 5. 音频公网可访问性核对

LOCAL_REAL 当前环境：

```text
STORAGE_DRIVER=S3_COMPATIBLE
S3_ENDPOINT=http://127.0.0.1:9000
MEDIA_RELAY_INTERNAL_BASE_URL=未配置
MEDIA_RELAY_BASE_URL=未配置
MEDIA_STORAGE_ROOT=未配置
MEDIA_RELAY_INTERNAL_SECRET=未配置
MEDIA_RELAY_SIGNING_SECRET=未配置
```

无写入存储探测生成了一个临时 MinIO 签名 URL，只检查 origin 和安全解析结果，不读取真实对象、不写数据库：

```text
signedUrlOrigin=http://127.0.0.1:9000
resolvePublicAddress=BLOCKED / SSRF_BLOCKED
```

当前 Worker 的处理逻辑是：

1. 先从视频得到或复用音频 Asset；
2. 用 storage provider 生成音频签名 URL；
3. `resolvePublicAddress()` 检查 URL；
4. Flash 路径在 URL 不可公网访问时，只有音频不超过 `20 MiB` 才能退回本地二进制上传；超过该上限则报 `ASR_AUDIO_NOT_PUBLICLY_REACHABLE`；
5. Recording File 2.0 不接受二进制退回，必须使用豆包可以下载的 `REMOTE_URL`。

### 解决方式

后续正式环境应采用下面任一方案，不应放宽 SSRF 安全检查：

1. 使用豆包可访问的对象存储签名 URL：必须是公网可解析、可通过 HTTPS 下载的地址，不能是 loopback、内网 IP 或仅本机 DNS 可解析的地址；
2. 使用当前代码已经实现的 Render Media Relay：
   - `STORAGE_DRIVER=RENDER_MEDIA_RELAY`
   - `APP_URL` 设置为公网 HTTPS 地址
   - Web 配置 `MEDIA_STORAGE_ROOT`
   - 配置 `MEDIA_RELAY_INTERNAL_SECRET` 与 `MEDIA_RELAY_SIGNING_SECRET`
   - Worker 到 Web 配置可达的 `MEDIA_RELAY_INTERNAL_BASE_URL`（必要时配置 `MEDIA_RELAY_BASE_URL`）
   - 由 `/api/media/<token>?purpose=doubao` 提供带 `purpose=doubao` 绑定的临时 URL

当前本地 `APP_URL=http://localhost:3000` 和本地 MinIO 只适合本地开发，不足以验证真实豆包下载能力；本阶段不提前部署公网 Relay。

## 6. “资料 → 音频 → 豆包 → Transcript”代码链

当前生产入口与 Worker 的两种策略如下：

```text
POST /api/source-items/[id]/transcribe
  → 校验 Workspace / SourceItem / STORED VIDEO
  → requestSourceTranscription()
  → 创建 TRANSCRIBE IngestJob 并入队
  → Worker processTranscribeSourceJob()
  → FFmpeg 从视频生成 audio/mpeg
  → storage.upload()
  → storage.getSignedUrl()
  → LOCAL_REAL: localAudioInput() → Local FunASR
  → PRODUCTION: doubaoAudioInput() → Recording File 2.0
  → normalize transcript
  → upsert Transcript
  → IngestJob=SUCCEEDED
```

隔离 `LOCAL_TEST` 环境验证结果：

- Worker transcription integration：14 个测试文件、124 个测试全部通过；
- 其中 `runs VIDEO STORED through FFmpeg, MinIO, Doubao and Transcript` 通过；
- provider 套件：24 个测试文件、156 个测试全部通过；
- 全仓 `pnpm test`：56 个测试文件中 55 个通过，唯一失败仍是既有 `apps/web/tests/studio-default-method.test.ts` 的 Canvas 文案 stale assertion（`参考素材`），不属于 P4；
- LOCAL_REAL 短 fixture smoke：`IngestJob=SUCCEEDED`，`Transcript.provider=LOCAL_FUNASR`、`providerMode=REAL`，文本非空，当前 Job 的 Doubao usage 为 0；
- 这证明本地开发主路径已经真实可用，但不等于 Doubao 生产权限和公网媒体链路已经验证。

本轮没有对现有业务 SourceItem 发起重转；LOCAL_REAL smoke 使用独立的短非敏感 fixture，验证后已清理。当前真实库中 Doubao 失败音频均为 `FAILED` 且没有 `storageKey`；历史 13 次真实 403 已足以证明云端路径不应在本地阶段重复调用。

## 7. Local FunASR 的角色

- Development / LOCAL_REAL：`Local FunASR primary`；
- Production：`Doubao Recording File 2.0 primary`；
- Local FunASR role：`DEV_FALLBACK`；生产环境不允许静默 fallback；
- 本轮没有删除或修改 Local FunASR 实现。

当前真实数据中的 11 条成功记录继续保留。

## 8. Verification

| 检查项 | 结果 |
| --- | --- |
| `pnpm dev:up` | 通过；Docker 依赖、Worker、Web、Local ASR 已启动 |
| `pnpm run doctor` | 通过 |
| `pnpm typecheck` | 8/8 packages 通过 |
| `pnpm lint` | 8/8 packages 通过 |
| Doubao provider tests | 24/24 files、156/156 tests 通过 |
| Worker transcription integration | 14/14 files、124/124 tests 通过 |
| `pnpm test` | 55/56 files、282/283 tests 通过；唯一为既有 Canvas stale assertion |
| LOCAL_REAL local smoke | 通过；`LOCAL_FUNASR / REAL`、Transcript 非空、当前 Job 无 Doubao usage |
| `git diff --check` | 通过 |
| Doubao real smoke | 延后；未发起真实云端请求 |

## 9. Data Safety

- 通过现有 `IntegrationService` 只更新了 LOCAL_REAL Workspace 的 `TRANSCRIPTION` 非 Secret 策略为 `LOCAL_FUNASR`；Doubao `DOUBAO_ASR` 配置和加密 API Key 保留；
- 本地 smoke 使用短的非敏感 fixture，验证后删除了对应 SourceItem、SourceAsset、IngestJob、Transcript、API Usage、审计记录和 MinIO 对象；
- `pnpm dev:up` 调用了项目既定的 `pnpm db:migrate` 检查，报告 `45 migrations found`、`No pending migrations to apply`，没有新增迁移执行；
- 没有修改 Prisma Schema；
- 没有修改 migration；
- 没有 reset；
- 没有 stash；
- 没有删除历史文件；
- 没有删除 Local FunASR；
- 隔离测试使用独立 `LOCAL_TEST` 数据库 `content_center_test`、Redis `6380`、MinIO `9002`，测试数据只属于测试环境；
- 临时审计和 smoke 脚本已删除；`apps/web/next-env.d.ts` 被开发服务器短暂改写后已恢复。

## 10. Deferred Until Production Readiness

本轮不推进公网 Relay，也不执行 Doubao 真实请求。正式上线时依次完成：

1. 配置 Production Secrets；
2. 部署或启用现有 Render Media Relay；
3. 验证公网 signed audio URL；
4. 执行一次 Doubao Recording File 2.0 real smoke；
5. 执行 Worker → Transcript end-to-end；
6. 确认 `provider=DOUBAO_ASR` 后，再允许正式员工使用云端转写。

当前状态：`DEFERRED_TO_PRODUCTION_READINESS`。
