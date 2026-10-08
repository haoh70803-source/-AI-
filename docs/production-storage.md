# Production Storage

V1 生产默认使用 `RenderMediaRelayStorageProvider`：Render Web 独占 Persistent Disk，Worker 通过受保护的内部 Media Storage API 流式上传、读取和删除。Cloudflare R2、Alibaba OSS、Backblaze B2 在 V1 不启用。

MinIO 与其它 S3-compatible 对象存储仍由 `S3CompatibleStorageProvider` 保留为可选部署模式；业务代码只依赖 `StorageProvider`，通过 `getStorageProvider()` 解析 driver。

## 配置

```dotenv
STORAGE_DRIVER=S3_COMPATIBLE
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=content-center
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

可选的 S3-compatible 生产模式（例如 Cloudflare R2）使用同一个 Provider：

```dotenv
STORAGE_DRIVER=S3_COMPATIBLE
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=<private-bucket>
S3_ACCESS_KEY_ID=<server-secret>
S3_SECRET_ACCESS_KEY=<server-secret>
S3_FORCE_PATH_STYLE=false
```

R2 凭证只放在部署环境变量中，不进入浏览器、Workspace IntegrationConfig、Git 或日志。系统管理页只显示 `CONFIGURED` / `UNCONFIGURED`。V1 不要求 R2 配置。

Render V1：

```dotenv
STORAGE_DRIVER=RENDER_MEDIA_RELAY
MEDIA_STORAGE_ROOT=/var/data/xsj-media
APP_URL=https://<public-web-host>
MEDIA_RELAY_INTERNAL_BASE_URL=http://<private-web-host>
MEDIA_RELAY_INTERNAL_SECRET=<server-secret>
MEDIA_RELAY_SIGNING_SECRET=<server-secret>
ASR_AUDIO_RETENTION_HOURS=24
```

`MEDIA_RELAY_INTERNAL_BASE_URL` 只供 Worker → Web 内部请求；`APP_URL` 用于用户和 Doubao 可访问的公网 URL。两个 Secret 只放 Render Secret Environment Variable，不通过 query string、浏览器或日志传递。Render Web 将磁盘挂载到 `/var/data`，实际媒体根目录由 `MEDIA_STORAGE_ROOT` 指定。

## 私有对象与 Key

S3-compatible 模式的生产 Bucket 必须保持 private。Render Relay 不使用 Bucket；所有新素材仍由 `StorageObjectKeyBuilder` 生成逻辑 Key，前缀固定为：

```text
workspaces/<workspaceId>/sources/<sourceItemId>/assets/<assetId>/original.mp4
workspaces/<workspaceId>/sources/<sourceItemId>/assets/<assetId>/audio.mp3
workspaces/<workspaceId>/sources/<sourceItemId>/assets/<assetId>/cover.jpg
```

扩展名由服务端检测到的 MIME 类型决定。客户端不能提交 `objectKey`、Bucket 或 filesystem path 来越权访问。

Render Relay 的访问链路是：

```text
Session / Worker scope
→ SourceItem + SourceAsset workspace 校验
→ HMAC-SHA256 token（assetId + workspaceId + sourceItemId + expiry + purpose）
→ GET /api/media/:token
→ safe path resolver
→ stream file
```

内部上传/读取/删除接口位于 `/api/internal/media-storage/:assetId`，必须同时提供 `Authorization: Bearer <MEDIA_RELAY_INTERNAL_SECRET>`、`x-workspace-id`、`x-source-item-id`、`x-asset-id`。服务端从数据库读取 storageKey，不接受调用方提交的 raw key。上传使用临时文件 + atomic rename，失败会清理临时/目标文件。

- 播放与下载：5 分钟
- Doubao Recording File 2.0：15 分钟

访问接口仍为 `GET /api/source-items/:sourceId/assets/:assetId/access`，只接受 `sourceId`、`assetId` 和可选的 `disposition=inline|attachment`。接口先验证 Session、当前 Workspace、SourceItem 与 SourceAsset 归属，再由当前 StorageProvider 生成 URL。Render Relay URL 过期、签名错误、路径不存在和资源不存在均统一返回 404。

## 音频保留

ASR 音频是中间文件，`ASR_AUDIO_RETENTION_HOURS` 默认 24 小时。V1 不新增生命周期模型；清理策略应在后续 job 中复用现有 `SourceAsset` 状态，并在物理删除时同步清空 `storageKey` / 状态，不能继续显示 `STORED`。原始视频不自动删除，直到用户删除 Source。

## 历史 MinIO 数据

本阶段不自动迁移历史对象。开发环境继续使用 MinIO 读取旧数据；后续切换 S3-compatible 需要单独的迁移方案与授权，不在本阶段范围内。
