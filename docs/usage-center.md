# Usage center

The System Admin Usage Center supports today, the latest seven days, and the current month. It aggregates existing `ApiUsage`, `SourceItem`, and `ContentProject` data by user and personal Workspace.

It shows AI calls, Kimi input/output tokens, RedFox calls and outcomes, Doubao/FunASR minutes, failed transcription count, material count, creation count, and recent activity. User detail also breaks down recorded AI operations.

User-triggered Kimi, RedFox, and ASR calls require both `userId` and `workspaceId`. Scheduled/system attribution is not introduced in this stage; a future system-triggered path must explicitly mark its origin instead of silently using a user.

The global usage endpoint is protected by the System Admin gate. Ordinary users cannot query another user's usage.

This is observability only:

- no quota
- no limit
- no billing or currency
- no package or subscription
- no balance
- no automatic blocking

Storage capacity is not calculated by scanning object storage. It remains unavailable until durable production storage metadata exists.
