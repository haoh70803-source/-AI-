# Runtime environments

The repository has four explicit environment identities:

- `LOCAL_REAL`: reviewed local development runtime backed by the persistent Docker Compose project volume. It must not point at the native temporary `55432` clusters or Render staging.
- `LOCAL_TEST`: isolated database, Redis and storage used by Vitest and Playwright. Destructive test cleanup is only allowed here.
- `STAGING`: Render services and environment-managed providers. It is a review target, not a test sandbox.
- `PRODUCTION`: deployment-managed services and credentials. It is never a local test target.

Copy the appropriate template to the ignored root file before starting:

```text
config/environments/local-real.env.example  -> .env.local-real
config/environments/local-test.env.example  -> .env.local-test
```

The isolated test dependencies are defined in `docker-compose.test.yml` and use PostgreSQL `55433`, Redis `6380`, and MinIO `9002`/`9003`. Start them only when intentionally running the isolated test environment with `pnpm infra:test:up`; they are never started by `pnpm dev:real`.

`pnpm dev:up` prepares the Docker Compose services, applies idempotent `prisma migrate deploy`, and starts Local ASR, Worker and Web. It never resets or removes volumes. `pnpm dev` / `pnpm dev:real` remain the process-only variants and fail closed until `.env.local-real` exists and its database and Redis endpoints are reachable. `pnpm test` and `pnpm test:e2e` fail closed unless `.env.local-test` identifies a dedicated test database and Redis endpoint. No command in this folder prints credentials.
