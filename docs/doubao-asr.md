# Doubao ASR Provider

核验日期：2026-09-01。

本阶段只实现火山引擎豆包语音「大模型录音文件极速版识别 API」。协议依据为火山引擎官方文档：

- [大模型录音文件极速版识别 API](https://www.volcengine.com/docs/6561/1631584?lang=zh)
- [录音文件识别标准版 HTTP](https://www.volcengine.com/docs/6561/1354868?lang=zh)（极速版声明复用其请求字段；用于确认 `request.corpus` 热词参数）
- [自学习平台热词](https://www.volcengine.com/docs/6561/155739?lang=zh)

没有依据博客、社区文章或第三方 SDK 猜测协议，也没有复制官方 Demo 源码。

## Official protocol

```text
POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash
```

新版控制台认证（默认）：

```text
X-Api-Key
X-Api-Resource-Id: volc.bigasr.auc_turbo
X-Api-Request-Id: UUID
X-Api-Sequence: -1
```

旧版控制台兼容认证：

```text
X-Api-App-Key
X-Api-Access-Key
X-Api-Resource-Id: volc.bigasr.auc_turbo
X-Api-Request-Id: UUID
X-Api-Sequence: -1
```

请求使用 `audio.url` 或 `audio.data` 二选一，并固定 `request.model_name = bigmodel`。为获得分段时间，本项目同时发送 `request.show_utterances = true`。如配置了现有热词表，则发送：

```json
{
  "request": {
    "corpus": {
      "boosting_table_id": "...",
      "boosting_table_name": "..."
    }
  }
}
```

本阶段只消费以下官方响应字段：

```text
result.text
result.utterances[].start_time
result.utterances[].end_time
result.utterances[].text
audio_info.duration
```

HTTP 成功不足以表示识别成功；客户端还要求响应 Header `X-Api-Status-Code = 20000000`。内部只记录用于排错的 `X-Api-Status-Code` 与 `X-Tt-Logid`，不记录请求正文、音频 URL、API Key 或完整响应。

## Limits

极速版当前官方限制：

- 音频时长不超过 2 小时。
- 音频大小不超过 100 MB。
- 支持 WAV、MP3、OGG OPUS。
- 二进制上传建议尽量在 20 MB 内。

本项目使用 FFmpeg 输出 MP3、单声道、16 kHz、64 kbps，并在调用豆包前检查实际文件大小和 ffprobe 时长。超限不会 fallback 到标准版。

## Input selection

```text
公网可访问的短期 Signed URL → audio.url
私网 / localhost 且音频 <= 20 MB → audio.data
私网 / localhost 且音频 > 20 MB → ASR_AUDIO_NOT_PUBLICLY_REACHABLE
```

生产优先使用 30 分钟短期 Signed URL。开发 MinIO 默认是 localhost，豆包云端无法访问，因此自动使用受大小约束的 `audio.data`；不会让真实豆包尝试拉取 localhost。

## Pipeline

```text
SourceAsset VIDEO STORED
→ FFmpegMediaProcessor
→ SourceAsset AUDIO STORED
→ TRANSCRIBE_SOURCE
→ DoubaoTranscriptionProvider
→ Transcript (DOUBAO_ASR / REAL)
```

已存在的 STORED AUDIO 会被后续重新转写复用。旧 Transcript 只在新识别成功后原子 upsert；失败时继续保留。

## Error and retry

可重试：网络失败、超时、HTTP 429、HTTP 5xx、官方 `550xxxx` 临时服务错误。BullMQ 最多尝试 3 次并使用指数退避。

不可自动重试：未配置、已禁用、认证失败、权限失败、无效响应、空转写、音频格式错误、FFmpeg 缺失/失败、大小/时长超限、不可公网访问且无法使用受控二进制上传。

## Connection test

官方没有无需音频的轻量 health endpoint。设置页只显示 `CONFIGURED` 与 masked 凭证状态；真实可用性由首次转写验证，不会自动产生付费识别调用。
