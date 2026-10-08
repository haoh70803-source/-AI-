# Multi-user security

## Tenant model

V1-A uses one personal Workspace per user. `ensurePersonalWorkspaceForUser(userId)` creates exactly one first Workspace with an `OWNER` membership when an account first becomes usable. The operation is idempotent. Team invitations and complex organizations are intentionally outside this stage.

`SystemRole` and `WorkspaceRole` are separate. `SYSTEM_ADMIN` can manage users, inspect system service state, and read global usage aggregates. It does not bypass ordinary content APIs. Content access still requires membership in the active Workspace.

Public signup is denied by the server unless `ALLOW_PUBLIC_SIGNUP=true`. Hiding the registration page is only a secondary UI measure. Internal accounts are created by a System Admin or the one-time bootstrap command.

## IDOR rules

- Workspace-owned reads and mutations include `workspaceId` in the database predicate.
- Relationship writes validate both parents in the same Workspace before creating the relationship.
- Unknown or foreign resource IDs return 404 (or 403 for explicit permission gates), never a successful empty object.
- Lists and search always start from the current Workspace predicate.
- System Admin has no implicit support-session or impersonation path.
- Asset metadata returned from content APIs excludes remote source URLs. Any future download endpoint must call the scoped asset lookup before signing a URL.

## Worker isolation

BullMQ payloads carry `workspaceId`, `requestedById`, the job ID, and resource IDs. Workers re-read the job with all these values and reject a mismatch as unrecoverable. They additionally compare the parent SourceItem Workspace before writing Transcript, SourceAsset, status, audit, or usage rows. Retries reuse the original persisted tenant and actor; there is no default-Workspace fallback.

## Cache and fingerprints

Discovery cache keys start with `workspaceId`. Unified creative analysis fingerprints can be equal across users, but lookup uniqueness includes the owning project and all reads include Workspace scope. No cross-Workspace cache record is reused.

## System administration

Admin API routes use the shared `getSystemAdminApiContext()` gate. Ordinary users receive HTTP 403. There is no email-string permission check, impersonation, or automatic content access.
