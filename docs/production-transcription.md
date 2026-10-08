# Production transcription

Production primary transcription is Doubao Recording File Recognition 2.0. Development primary remains Local FunASR.

```text
Development: TRANSCRIPTION_PRIMARY=LOCAL_FUNASR
Production:  TRANSCRIPTION_PRIMARY=DOUBAO_RECORDING_FILE_2_0
```

The product UI continues to say only “转写”. Provider names, resource IDs, CUDA state, and polling details are administrator/technical information.

The production Adapter uses the asynchronous V3 recording-file protocol:

```text
POST /api/v3/auc/bigmodel/submit
POST /api/v3/auc/bigmodel/query
```

Its resource ID is required from `DOUBAO_ASR_RESOURCE_ID`; the application does not guess an account entitlement. Both old App ID + Access Token authentication and current API Key authentication are supported by the shared runtime schema. Polling uses bounded exponential intervals and a finite overall timeout. Provider failures remain retryable only where the classified upstream error allows BullMQ retry.

Worker flow remains video → FFmpeg audio → object storage signed URL → Provider Adapter → Transcript. A production storage URL must be downloadable by Doubao; Local MinIO is not presented as production-ready storage in this stage. No automatic fallback to a user's localhost is allowed in production.

Every ASR usage row contains provider, Workspace, actor, SourceItem, audio duration, processing time, mode, success, and protocol/fallback metadata. Duration comes from FFprobe/media metadata, never AI estimation.
