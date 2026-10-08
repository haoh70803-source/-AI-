# System provider policy

Production always enforces system-managed Providers; `SYSTEM_MANAGED_PROVIDERS=false` cannot disable that production guard. Kimi, RedFox, and Doubao credentials come from server environment variables and are resolved through the existing Integration/Provider layer for every Workspace. Historic encrypted Workspace IntegrationConfig rows are preserved but ignored in system-managed mode.

Ordinary users cannot view or update provider configuration. The settings entry and direct integration API are both blocked. System Admin sees only `CONFIGURED` / `UNCONFIGURED` service status; secrets, full Base URLs, access tokens, and model internals are not returned. V1-A deliberately does not add online secret editing: production secrets are `ENV_MANAGED`.

Local development may set `SYSTEM_MANAGED_PROVIDERS=false` to retain the existing encrypted Workspace configuration flow. This override is not the production default.

Resolution order in production is:

```text
server environment
→ system provider policy
→ Provider / Adapter
→ all Workspaces
```

Required public model policy remains Kimi 2.6 with `KIMI_MODEL_ID=kimi-k2.6`. No provider secret may be logged, returned to the browser, or committed.

## CURRENT V0 PROVIDER POLICY

Provider configuration is capability-specific, not a global product startup requirement.

| Provider | Current V0 role | Missing configuration means |
| --- | --- | --- |
| Kimi 2.6 | Active default model for normal Material and Creative Analysis | Only an explicitly requested AI action is unavailable. Materials, Projects, CreativeBrief editing, and Studio remain available. |
| Kimi K3 | Reserved / Deferred | It is not a normal-analysis runtime option and is never selected by the current Kimi policy. |
| RedFox | Optional Integration | Real RedFox collection or refresh cannot run; normal analysis, Studio, CreativeBrief, and project work are unaffected. |
| Doubao | Optional Transcription Integration | Real audio/video transcription cannot run; text and existing-caption materials, normal analysis, and Studio remain available. |

`PLATFORM_CLOUD_ACCEPTANCE` covers authentication, sessions, RBAC, Workspace isolation, database, KV, pages, and media security. `PROVIDER_ACCEPTANCE` is a separate, provider-specific gate. An unconfigured RedFox, Doubao, or Kimi service must not invalidate completed platform cloud acceptance.

The next future real-provider smoke test is `KIMI_2_6_REAL_ACCEPTANCE`. Until a staging environment intentionally receives that capability-specific configuration, its status is `DEFERRED`; it does not make the product globally blocked. No V0 startup validation requires all three Providers to be configured.
