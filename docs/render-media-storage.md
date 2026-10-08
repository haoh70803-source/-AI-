# Render Media Relay

V1 的生产媒体策略是 Render Media Relay，不是第三方对象存储。

## 拓扑

```text
Render Web + Persistent Disk (/var/data)
        ↑ authenticated HTTP stream
Render Background Worker
        ↑
Render PostgreSQL / Key Value
```

Render Background Worker 不能接收公网 HTTP，也不能访问 Web 的 Persistent Disk。Worker 只通过 `RenderMediaRelayStorageProvider` 请求 Web 内部 API；Web 是唯一的媒体文件所有者。

## Environment

Web 和 Worker 都必须设置：

```dotenv
STORAGE_DRIVER=RENDER_MEDIA_RELAY
MEDIA_RELAY_INTERNAL_SECRET=<secret>
MEDIA_RELAY_SIGNING_SECRET=<secret>
```

Web 还需要：

```dotenv
MEDIA_STORAGE_ROOT=/var/data/xsj-media
APP_URL=https://<public-web-host>
MEDIA_RELAY_INTERNAL_BASE_URL=http://<private-web-host>
ASR_AUDIO_RETENTION_HOURS=24
```

Worker 需要同一个私网地址（优先）或 `MEDIA_RELAY_BASE_URL` 兼容别名：

```dotenv
MEDIA_RELAY_INTERNAL_BASE_URL=http://<private-web-host>
APP_URL=https://<public-web-host>
```

`APP_URL` 是浏览器和 Doubao 的公网地址；`MEDIA_RELAY_INTERNAL_BASE_URL` 只用于 Worker → Web 内部操作，不能拿给 Doubao。Secret 不能写入 Git、日志、浏览器或 query string。

Worker 每小时扫描超过 `ASR_AUDIO_RETENTION_HOURS` 的 `AUDIO / STORED` 资产：先通过当前 StorageProvider 删除物理文件，成功后再将记录置为现有 `FAILED` 并清空 `storageKey`；删除失败会保留 `STORED`，并输出不含 Secret 的失败告警。原始 VIDEO 不参与该清理。

## Internal API

以下接口只接受 Worker/server-side 的 Bearer Secret：

```text
PUT    /api/internal/media-storage/:assetId
GET    /api/internal/media-storage/:assetId
DELETE /api/internal/media-storage/:assetId
```

请求必须带 `x-workspace-id`、`x-source-item-id`、`x-asset-id`。Web 重新查询三者的数据库关系并从数据库获取 `storageKey`；请求方不能提交 raw `storageKey`、Bucket 或 filesystem path。缺少 Secret、scope 不匹配和不存在的资源都不会泄漏资源信息。

上传通过 Node stream pipeline 写入 Web 磁盘的临时目录，再 rename 到最终路径。数据库更新失败时会清理目标文件；中断上传的 `.tmp` 文件也会被清理。下载响应使用 `createReadStream`，不会把完整媒体读入 Node 内存。

## Public media URL

用户访问接口保持不变：

```text
GET /api/source-items/:sourceId/assets/:assetId/access
```

Relay Provider 生成 HMAC-SHA256 token，payload 包含 `assetId`、`workspaceId`、`sourceItemId`、`expiresAt`、`disposition` 和 `purpose`。浏览器播放/下载 TTL 为 300 秒，Doubao ASR TTL 为 900 秒。公网端点为：

```text
GET /api/media/:token
```

端点验证签名和过期时间，重新查询并校验 SourceAsset，经过 safe path resolver 后流式响应。签名错误、过期、scope 不匹配、路径穿越和文件不存在统一返回 404。

## Logical keys and path security

逻辑 Key 继续由 `StorageObjectKeyBuilder` 生成：

```text
workspaces/<workspaceId>/sources/<sourceItemId>/assets/<assetId>/original.<ext>
workspaces/<workspaceId>/sources/<sourceItemId>/assets/<assetId>/audio.mp3
workspaces/<workspaceId>/sources/<sourceItemId>/assets/<assetId>/cover.<ext>
```

`resolveStoragePath(root, storageKey)` 会解码并规范化路径，拒绝 `../`、`..\\`、绝对路径、盘符路径、空字节、重复编码穿越及 root 外结果。Relay API 永远从 DB/Builder 得到 Key。

## S3-compatible fallback

本地开发默认继续使用 MinIO：

```dotenv
STORAGE_DRIVER=S3_COMPATIBLE
S3_ENDPOINT=http://localhost:9000
```

现有 `S3CompatibleStorageProvider`、R2 兼容配置和 MinIO 测试保留。未来如果媒体规模需要切回 S3-compatible，只需切换 driver 和部署环境变量，业务代码不分叉。

## Render blueprint

仓库根目录的 `render.yaml` 仅为后续 staging/deploy 准备，不代表已经部署。它包含 Web、Background Worker、PostgreSQL、Key Value 和 Web Persistent Disk 的配置草案；实际 host、secret 和容量必须在 Render 中确认后再部署。
