# Production transcription

Material transcription (video links, uploaded video and audio) prefers configured workspace Doubao credentials in both development and production. It uses the configured Flash, Recording File Recognition 2.0 or Streaming Recognition 2.0 protocol. Missing or failed cloud recognition falls back to the configured local FunASR service when available; local downtime does not block configured cloud recognition. Legacy `TRANSCRIPTION.source` and `fallbackToDoubao` settings still govern microphone dictation, but no longer override material cloud priority.

```text
Materials: configured workspace Doubao → available local FunASR fallback
Dictation: workspace TRANSCRIPTION policy
```

The product UI continues to say only “转写”. Provider names, resource IDs, CUDA state, and polling details are administrator/technical information.

The production Adapter uses the asynchronous V3 recording-file protocol:

```text
POST /api/v3/auc/bigmodel/submit
POST /api/v3/auc/bigmodel/query
```

Its resource ID is required from `DOUBAO_ASR_RESOURCE_ID`; the application does not guess an account entitlement. Both old App ID + Access Token authentication and current API Key authentication are supported by the shared runtime schema. Polling uses bounded exponential intervals and a finite overall timeout. Provider failures remain retryable only where the classified upstream error allows BullMQ retry.

Worker flow remains video → FFmpeg audio → object storage signed URL → Provider Adapter → Transcript. A production storage URL must be downloadable by Doubao; Local MinIO is not presented as production-ready storage in this stage. Local fallback runs on the worker host using its validated loopback endpoint and installed model policy, never on the browser host. If local fallback is unavailable, the cloud failure remains visible; saved media is retained for retry.

For a local workspace without public storage, `STREAMING_2_0` with `volc.seedasr.sauc.duration` uses `/api/v3/sauc/bigmodel_async` over WebSocket. The worker reads its saved 64kbit/s mono MP3 privately and sends approximately 200ms packets at 200ms intervals. A final response is required before persisting a transcript; partial results from an interrupted connection are discarded. The connection uses pinned public DNS, rejects redirects, enforces the external-call policy and has an eight-minute overall deadline. Longer media can exceed this deadline; use the recording-file protocol with public signed storage for long recordings. Existing saved media is retained on failure. No public bucket or inbound tunnel is needed for streaming recognition.

Every ASR usage row contains provider, Workspace, actor, SourceItem, audio duration, processing time, mode, success, and protocol/fallback metadata. Duration comes from FFprobe/media metadata, never AI estimation.

## Workbench voice input

The microphone beside send records at most 60 seconds / 5 MB. Recognition appends editable text to the draft and never sends it automatically. `/api/voice-input` requires authenticated workspace write membership and serializes recognition per workspace/user. A configuration preflight runs before microphone permission; the POST rechecks configuration before processing. Multipart reading, FFmpeg decoding, provider calls and temporary storage all have finite deadlines. Caller cancellation is forwarded to the recognition client.

Voice input reuses the workspace transcription policy: Local FunASR receives private MP3 bytes; Doubao Flash receives binary audio; Recording File 2.0 receives a signed URL to scoped temporary media. Temporary media is inventoried as an archived `VOICE_INPUT` source, excluded from the normal library, and deleted after recognition. Failed deletion remains inventoried for the existing audio cleanup task. Voice usage records actor, workspace, duration, processing time, protocol, success and `purpose=VOICE_INPUT`; no permanent Transcript is created.

Use a full FFmpeg build with audio codecs, FFprobe and MP3 encoding. `FFMPEG_PATH` / `FFPROBE_PATH` can specify executable paths; otherwise PATH is used. Video-only FFmpeg binaries bundled with some desktop editors cannot handle this flow. Browser recording requires HTTPS or localhost and microphone permission.
