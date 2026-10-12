import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Connector tests use injected HTTP fixtures only. No Prisma setup, migration, or live API.
export default defineConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('../../apps/web/', import.meta.url)) } },
  test: { include: ['packages/integrations/src/feishu/**/*.test.ts', 'packages/integrations/src/knowledge/feishu-wiki.test.ts', 'apps/web/tests/feishu-browse.test.ts', 'apps/web/tests/feishu-wiki-browser.test.tsx', 'apps/web/tests/assistant-feishu-cache.test.ts', 'apps/web/tests/feishu-knowledge-subscriptions.test.tsx'] },
});
