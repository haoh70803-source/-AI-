# RedFox Source Provider

核验日期：2026-09-01。

## 官方来源

- `redfox-data/redfox-community`：`82f35863d0eb42267eb7fb75024f4ecf88a2444c`
- `skills/video-downloader` 最近相关提交：`826071af4146a17d9399a9f9a010fc783790819d`
- `redfox-data/redfox-python-sdk`：`a711fcbde85fe7632ab91ec6b3b018504bac7e43`（v0.4.0）

## 当前采用协议

```text
POST https://redfox.hk/story/api/parseWork/parse
Content-Type: application/json
X-API-KEY: <Workspace encrypted Integration secret>

{"url":"<Douyin work URL>","source":"AI内容生产中心"}
```

官方 `video-downloader` 以字符串化的 `code` 是否以 `2` 开头判断成功；视频读取 `data.videoUrl`，图文读取非空 `data.imageUrls`。已知 `3106`、`3107` 为凭证错误，`400` 为请求错误。

Python SDK v0.4.0 默认请求超时为 30 秒，并建议对网络异常、HTTP 429、500、502、503、504 做最多 3 次指数退避。项目不在 Client 内重复重试，而是沿用 `CONTENT_INGEST` 的 BullMQ attempts/backoff，使每一次真实 API call 都能准确写入 `ApiUsage`。

## 官方差异

Python SDK 通用 Client 当前发送 `REDFOX_API_KEY` Header，而官方 `video-downloader/assets/downloader.py` 对目标 `parseWork/parse` 协议发送 `X-API-KEY`。本阶段目标是复现 `video-downloader` 作品解析链路，因此采用 `X-API-KEY`。

官方公开仓库没有提供无需作品 URL 的轻量 account/health/auth-only endpoint。项目不会虚构测试接口，也不会在页面打开时调用付费 parse endpoint；设置页显示 `LIVE_API_TEST_NOT_AVAILABLE`。

## 产品边界

- 仅支持 `v.douyin.com` 作品短链、`douyin.com/video/*`、`douyin.com/note/*` 与带 `modal_id` 的 `douyin.com/jingxuan`。
- RedFox 返回其它平台或未知 `awemeType` 时明确失败。
- RedFox 媒体 URL 不返回前端；Worker 下载到私有 Storage，UI 只播放短期 Signed URL。
- 不创建 Transcript；阶段 3C 才接入 Doubao ASR。
