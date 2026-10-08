# Integration Secrets

## Scope

RedFox、Doubao ASR 和 LLM 的第三方凭证按 Workspace 存入 `IntegrationConfig`。Storage 仍由部署环境管理，不迁移 MinIO/S3 secret。

只有 Web server 和 Worker 可以调用 `IntegrationService.getDecryptedIntegrationConfig()`。Client Component、HTML、REST response、AuditLog 和结构化日志不得接触完整 secret 或 `encryptedConfig`。

## Master key

环境变量：

```text
INTEGRATION_ENCRYPTION_KEY=
```

它必须是随机 32-byte key 的标准 base64 编码。生成命令：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

不要把输出写入源码、README、容器镜像或 Git。生产环境应通过部署平台的 secret manager 注入。

行为：

- 未配置：读取公开状态仍可用，但保存或解密 secret 会明确失败，不会回退明文。
- 格式或长度错误：`IntegrationService` 初始化时明确报错。
- Key 不匹配、payload 被篡改或认证标签无效：解密失败，不返回部分数据。

## Encryption envelope

算法为 Node.js 原生 `AES-256-GCM`。每次加密生成新的 12-byte IV，使用 authentication tag，并绑定包含 payload version 与 key version 的 AAD。

`encryptedConfig` 保存可升级的 JSON envelope：

```json
{
  "version": 1,
  "keyVersion": 1,
  "algorithm": "AES-256-GCM",
  "iv": "base64",
  "authTag": "base64",
  "ciphertext": "base64"
}
```

`version` 表示 envelope 格式；`keyVersion` 与数据库的 `encryptionKeyVersion` 表示加密 key 世代。两者不能当作 secret。

## Public and secret fields

- RedFox：`baseUrl` 为 public；`apiKey` 加密。
- Doubao ASR：`authMode`、`baseUrl`、`resourceId`、Legacy `appId` 与可选热词表标识为 public 字段；新版 `apiKey` 和旧版 `accessToken` 加密。默认采用官方新版 API Key 协议。
- LLM：`provider`、`baseUrl`、`model` 为 public；`apiKey` 加密。

UI/API 只返回 `configured`、`status`、`lastFour`、`updatedAt` 和 public config。更新时 secret 输入框保持空白；留空会保留现有密文。

## Rotation procedure

当前阶段保留 rotation 所需的数据格式，但不实现自动 KMS 或多 key resolver。执行未来 rotation 时：

1. 在 secret manager 中生成新的随机 32-byte base64 key，并分配递增 `keyVersion`。
2. 在受控维护进程中暂时同时提供旧 key 和新 key；不得把两者写入日志或命令历史。
3. 按 Workspace/Integration 分批读取记录，用旧 key 验证并解密。
4. 使用新 key、随机 IV 和新的 `keyVersion` 重新加密，在数据库事务中同时更新 `encryptedConfig` 与 `encryptionKeyVersion`。
5. 逐批验证 authentication tag、公开状态和 Provider 配置可解密性；失败时保留旧记录并停止该批次。
6. 全部记录完成且验证通过后，再从运行环境移除旧 key。

禁止直接替换 `INTEGRATION_ENCRYPTION_KEY` 而不重加密已有记录，否则旧 payload 将无法恢复。

## Audit and incident handling

凭证变更 AuditLog 只允许记录 `provider`、`status`、`changedFields`。禁止记录 API key、access token、Authorization header、密文 envelope 或请求 body。

若发现 key 泄露，应立即暂停 Integration 使用、保存受影响记录清单、执行受控 rotation，并轮换第三方 Provider 本身的凭证。
