# Staging Admin Bootstrap

Render Free staging does not provide Shell or One-off Jobs, so the project includes a bounded startup bridge for creating the first system administrator.

The bridge has no HTTP route and is disabled by default. It runs only when all of the following are true:

- `STAGING_ADMIN_BOOTSTRAP_ENABLED=true`
- `APP_ENV=staging`
- `STAGING_ADMIN_BOOTSTRAP_EMAIL` is a valid email
- `STAGING_ADMIN_BOOTSTRAP_PASSWORD` is a strong password (at least 12 characters and 3 character classes)

`NODE_ENV=production` is allowed only when the explicit deployment identity remains `APP_ENV=staging`; `APP_ENV=production` or any other value fails closed.

The bridge reuses the existing Better Auth signup operation, password hashing, system-role promotion, and personal Workspace provisioning. It is idempotent: an existing system administrator is a no-op, and an existing user is promoted without changing their credential.

Successful startup logs contain only `STAGING_ADMIN_BOOTSTRAP: CREATED` or `STAGING_ADMIN_BOOTSTRAP: ALREADY_PRESENT`. Passwords, hashes, sessions, and full secrets are never logged.

After the first successful deployment, disable `STAGING_ADMIN_BOOTSTRAP_ENABLED` and remove `STAGING_ADMIN_BOOTSTRAP_PASSWORD` from the Render service environment, then redeploy. The administrator continues to use the normal login flow.
