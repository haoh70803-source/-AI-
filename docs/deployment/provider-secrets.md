# Provider Secrets 与部署配置

本文档固定内容生产中心的 Provider 配置边界。生产环境采用公司统一配置，普通运营人员不购买、填写或管理第三方 Provider 凭证。

## 1. 配置策略

### LOCAL_REAL

本地真实联调使用项目根目录的 `.env.local-real`。该文件被 `.gitignore` 的 `.env.*` 规则忽略，不能提交 Git。

当前标准配置为：

```text
SYSTEM_MANAGED_PROVIDERS=false
```

因此 LOCAL_REAL 的 Provider 业务配置继续保存在当前 Workspace 的 `IntegrationConfig` 中：

- `TRANSCRIPTION` 保存转写来源、质量和 fallback 选择；
- `DOUBAO_ASR` 保存 Base URL、Resource ID 等普通配置；
- API Key / Access Token 保存在 `encryptedConfig`，由 `INTEGRATION_ENCRYPTION_KEY` 加密；
- 管理员通过 Workspace 的服务设置修改；
- 普通成员只能查看状态，不能修改配置；
- 配置持久化在本地真实数据库中，重启机器不需要重新输入。

不要把 `DOUBAO_API_KEY` 写入 `.env.local-real` 后期待它覆盖当前 Workspace 配置。只有开启 system-managed 模式时，环境变量 Provider 才会生效。

P4 收口后的 LOCAL_REAL 当前策略为：

```text
TRANSCRIPTION.source=LOCAL_FUNASR
TRANSCRIPTION.fallbackToDoubao=false
TRANSCRIPTION.endpoint=http://127.0.0.1:8765
```

Doubao `DOUBAO_ASR` 配置仍保留在 Workspace 中，当前非 Secret 配置为 `API_KEY`、`https://openspeech.bytedance.com`、`RECORDING_FILE_2_0`、`volc.seedasr.auc`；本地策略不会因为该配置存在而调用 Doubao。

### LOCAL_TEST

测试环境使用 `.env.local-test`，必须连接独立的测试数据库、Redis 和 MinIO：

- `MOCK_MODE=true`；
- `SYSTEM_MANAGED_PROVIDERS=false`；
- 普通测试使用 fixture、mock 或显式测试 Provider；
- 禁止放入真实生产 Doubao Key；
- `pnpm test` 不得因为测试配置而产生付费 Doubao 调用；
- 真实 Provider smoke 必须是单独、明确、人工触发的命令。

当前 Worker transcription integration 使用本地 HTTP fixture 验证完整数据流，不等于真实 Doubao 账号已经通过授权。

### PRODUCTION

生产环境由服务端统一管理。`systemManagedProvidersEnabled()` 在 `NODE_ENV=production` 时始终返回 true；非 production 的 staging 环境应显式设置：

```text
SYSTEM_MANAGED_PROVIDERS=true
```

生产推荐配置：

```text
TRANSCRIPTION_PRIMARY=DOUBAO_RECORDING_FILE_2_0
DOUBAO_ASR_BASE_URL=https://openspeech.bytedance.com
DOUBAO_ASR_RESOURCE_ID=volc.seedasr.auc
DOUBAO_API_KEY=<通过部署平台 Secret 注入>
```

也可以使用兼容旧配置的 `DOUBAO_APP_ID` + `DOUBAO_ACCESS_TOKEN`，但新部署优先使用 API Key。两种认证方式不要混填后自行猜测优先级。

真实 Secret 必须来自 Render / Server Environment Secret 或部署平台的 Secret Manager。不得写入 Git、镜像源码、seed、前端 bundle 或公开文档。

## Current Phase Decision

当前阶段正式收口为：

- Development / LOCAL_REAL：Local FunASR primary；
- Production：Doubao Recording File 2.0 primary；
- Local FunASR role：`DEV_FALLBACK`；生产环境不允许静默 fallback。

以下任务状态为 `DEFERRED_TO_PRODUCTION_READINESS`，不是失败或取消：

- Render Media Relay 部署；
- 公网 signed media URL 验证；
- Doubao Recording File 2.0 real smoke；
- Production Worker → Transcript end-to-end 验证。

正式上线时必须依次完成：配置 Production Secrets、部署或启用 Media Relay、验证公网 signed audio URL、执行 Doubao real smoke、执行 Worker → Transcript end-to-end，并确认 `provider=DOUBAO_ASR` 后再开放正式云端转写。

## 2. 系统 Provider 的读取优先级

正式生产的实际读取顺序固定为：

1. `NODE_ENV=production` 或 `SYSTEM_MANAGED_PROVIDERS=true` 开启 system-managed 模式；
2. `getSystemProviderConfig()` 优先读取服务端环境变量；
3. 如果环境变量配置不完整，则尝试保留的 `system-provider-config` Workspace 中的加密 `IntegrationConfig`；
4. 如果两处都没有有效的 `CONFIGURED` 配置，Worker 返回 `DOUBAO_NOT_CONFIGURED`；
5. 环境变量一旦配置完整，会覆盖 system Workspace 中的同 Provider 配置。

在 system-managed 模式下，普通 Workspace 不再承担公司级 Doubao Secret。Workspace 仍然可以保留产品层的转写选择和服务状态，但生产主路径由系统 Provider 统一决定。

## 3. Doubao 配置项

| 配置项 | 用途 | Secret | LOCAL_REAL 当前来源 | Production 推荐来源 | 缺失时行为 |
| --- | --- | --- | --- | --- | --- |
| `DOUBAO_API_KEY` | API Key 认证 | 是 | Workspace `encryptedConfig` 中的 `apiKey` | 部署平台 Secret | system Provider 不可用；首次转写不能通过认证 |
| `DOUBAO_APP_ID` | 旧版认证的 App ID | 否（标识符） | Workspace `publicConfig` | 环境变量或加密系统配置 | 使用旧版认证时缺少会被配置校验拒绝 |
| `DOUBAO_ACCESS_TOKEN` | 旧版认证 | 是 | Workspace `encryptedConfig` 中的 `accessToken` | 部署平台 Secret | 旧版认证无法配置 |
| `DOUBAO_ASR_RESOURCE_ID` | 指定已开通的语音识别资源 | 否（服务标识） | Workspace `publicConfig.resourceId` | 环境变量 | 配置无法解析；Resource 未授权时 provider 返回权限错误 |
| `DOUBAO_ASR_BASE_URL` | Doubao API 基地址 | 否 | Workspace `publicConfig.baseUrl`，默认 `https://openspeech.bytedance.com` | 环境变量 | 使用代码默认地址；无效 URL 会被拒绝 |
| `TRANSCRIPTION_PRIMARY` | system-managed 转写主路径 | 否 | 不读取（LOCAL_REAL 为 Workspace 策略） | `DOUBAO_RECORDING_FILE_2_0` | production 默认使用该值；其他值不会选择 Doubao Recording File 2.0 |
| `SYSTEM_MANAGED_PROVIDERS` | 非 production 环境的统一 Provider 开关 | 否 | `false` | `true`（production 仍由 `NODE_ENV` 强制开启） | 关闭时回到 Workspace IntegrationConfig |
| `INTEGRATION_ENCRYPTION_KEY` | 加密 Workspace / system DB Secret | 是 | `.env.local-real` | 部署平台 Secret | 无法保存或解密 DB Secret；不得轮换后丢失旧 key |

`DOUBAO_APP_ID` 当前由代码视为普通配置字段，但仍应只留在服务端配置中，不要在聊天、日志或浏览器中传播。

## 4. 媒体交付配置

### LOCAL_REAL 的当前状态

LOCAL_REAL 当前使用：

```text
STORAGE_DRIVER=S3_COMPATIBLE
S3_ENDPOINT=http://127.0.0.1:9000
TRANSCRIPTION.source=LOCAL_FUNASR
TRANSCRIPTION.fallbackToDoubao=false
```

这只适合本机开发。LOCAL_REAL 使用 Local FunASR 的本地二进制音频路径，不要求公网 URL，也不会调用 Doubao 或产生 Doubao 费用。本阶段不提前部署公网 Relay。

### PRODUCTION 的推荐状态

生产主路径固定为 Recording File 2.0 时，Doubao 必须能够下载音频 URL。推荐使用已实现的 Render Media Relay，不要把 MinIO 管理端或整个 bucket 暴露到公网：

```text
STORAGE_DRIVER=RENDER_MEDIA_RELAY
APP_URL=https://<public-web-host>
MEDIA_STORAGE_ROOT=<web 可访问的媒体根目录>
MEDIA_RELAY_INTERNAL_BASE_URL=<worker 可访问的 web 内部地址>
MEDIA_RELAY_BASE_URL=<可选的 relay 基地址>
MEDIA_RELAY_INTERNAL_SECRET=<Secret>
MEDIA_RELAY_SIGNING_SECRET=<Secret>
```

其中：

- `APP_URL` 必须是 Doubao 可访问的公网 HTTPS origin；
- `MEDIA_RELAY_INTERNAL_SECRET` 保护 Worker 到 Web 的内部媒体读写；
- `MEDIA_RELAY_SIGNING_SECRET` 签发短期媒体 token；
- `/api/media/<token>?purpose=doubao` 使用 purpose 绑定，不能用于绕过浏览器或其他资产授权；
- 不得关闭 SSRF 防护、允许 localhost 绕过、公开整个 bucket 或暴露 MinIO admin。

如果采用公网对象存储而不是 relay，必须保证签名 URL 可公网解析、在有效期内可下载，并且不指向 loopback、内网 IP 或仅内部 DNS 可解析的地址。

## 5. 管理员与普通员工

### 普通员工

正式生产中普通员工不需要任何 Provider 配置，也不需要知道 Key、Access Token、Resource ID 或模型细节。产品侧只显示服务状态，例如：

```text
语音转写服务
正常
```

或：

```text
语音转写服务暂不可用
请联系管理员
```

### 系统管理员

系统管理员可在系统服务页面查看：

- Provider 是否 `CONFIGURED`；
- 当前生效来源是环境变量还是加密系统配置；
- 协议为固定的 Recording File 2.0；
- 脱敏后的凭证末四位；
- Resource ID 与 Base URL 等非 Secret 配置；
- 基础服务与 Worker 状态。

保存配置只做格式校验与服务端加密，不代表 Doubao 已经授权成功。

当前代码的 live connection test 状态是 `LIVE_API_TEST_NOT_AVAILABLE`：豆包没有被当前实现采用的轻量健康端点，真实可用性需要使用单个非敏感短音频完成显式 smoke。普通测试套件不会自动执行该调用。

## 6. 豆包控制台 Checklist

在执行真实 smoke 前，管理员需要在火山引擎 / 豆包控制台逐项确认：

1. 当前应用或账号确实属于预期公司账户；
2. 语音识别产品已开通；
3. 目标 Resource ID 已开通并绑定到当前应用 / 凭证；
4. Resource ID 与当前 API 类型一致：
   - LOCAL_REAL 当前使用 Local FunASR；Workspace 中保留的 Doubao 配置为 Recording File 2.0、`volc.seedasr.auc`；
   - Production system-managed 路径固定为 Recording File 2.0，Resource ID 为 `volc.seedasr.auc`；
5. 当前凭证类型与代码一致：API Key 使用 API Key；旧版认证才使用 App ID + Access Token；
6. `statusCode=45000030` 对应的服务授权、resource entitlement 和账号绑定已检查；
7. 没有把“Key 存在”误认为“服务已授权”。

本地代码无法把下面几类外部状态进一步区分时，统一标记为 `REQUIRES_CONSOLE_CHECK`：

```text
SERVICE_NOT_ENABLED
RESOURCE_ID_MISMATCH
CREDENTIAL_MISMATCH
CREDENTIAL_INVALID
UNKNOWN
```

不要假设历史 `DOUBAO_PERMISSION_DENIED` 只是忘记填写 Key。

## 7. 配置生效验证

按以下顺序验证，避免批量调用：

1. `pnpm run doctor`：确认 PostgreSQL、Redis、Storage、Worker、Web 与本地 ASR 基础运行状态；
2. 管理员页面确认 Provider 状态为 `CONFIGURED`，并确认生效来源；
3. 确认媒体 URL 对 Doubao 可下载；
4. 准备一段非敏感、清晰普通话的短音频或短视频；
5. 只执行一次显式真实 smoke；
6. 记录 success/failed、脱敏 provider request id、Resource ID、duration 和 Transcript 是否非空；
7. 只有 Transcript 的 `provider=DOUBAO_ASR`、`providerMode=REAL` 且文本非空时，才算真实主路径通过；
8. 如果 Doubao 失败后使用了 Local FunASR，必须记录 `PRIMARY_FAILED` 与 `FALLBACK_USED`，不能把 fallback 当作 Doubao 成功。

不要把完整音频内容、完整 Key、Access Token、请求 body 或 provider 原始异常堆栈粘贴到聊天记录。

## 8. Security

禁止：

- 在聊天记录中粘贴 Secret；
- 将 Key、Token 或 `INTEGRATION_ENCRYPTION_KEY` 写入 Git；
- 将 Secret 写进 `.env.example`、seed、fixture 以外的源码或前端 bundle；
- 在日志中打印完整凭证、请求 body 或签名媒体 URL；
- 通过 API 返回明文 Secret；
- 把 MinIO admin 暴露公网；
- 把整个媒体 bucket 公开；
- 关闭 SSRF 防护或允许 localhost 绕过；
- 用静默 Local FunASR fallback 冒充 Doubao 主路径成功。
