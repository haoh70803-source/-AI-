import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const localRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
import { URL } from 'node:url';
export const REVIEW = Object.freeze({ databasePort: '55438', databaseName: '/content_center_12_review', webPort: '3022', cookiePrefix: 'content-center-12-review' });
export function validateReview(values) {
  const db = new URL(values.DATABASE_URL);
  const app = new URL(values.APP_URL);
  const storage = new URL(values.S3_ENDPOINT);
  if (values.STORAGE_DRIVER !== 'S3_COMPATIBLE' || storage.protocol !== 'http:' || storage.hostname !== '127.0.0.1' || storage.port !== '19020' || values.REDIS_URL !== 'redis://127.0.0.1:1/0') throw Error('REVIEW_STORAGE_OR_QUEUE_MISMATCH');
  if (!['postgresql:', 'postgres:'].includes(db.protocol) || !['localhost', '127.0.0.1'].includes(db.hostname) || db.port !== REVIEW.databasePort || db.pathname !== REVIEW.databaseName) throw Error('REVIEW_DATABASE_MISMATCH');
  if (app.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(app.hostname) || app.port !== REVIEW.webPort) throw Error('REVIEW_APP_MISMATCH');
  if (values.ENVIRONMENT_ID !== 'LOCAL_REVIEW' || values.AUTH_COOKIE_PREFIX !== REVIEW.cookiePrefix || values.LOCAL_REVIEW_OFFLINE !== 'true' || values.FREE_WORKER_MODE !== 'false') throw Error('REVIEW_SAFETY_FLAGS_REQUIRED');
  return REVIEW;
}
export function assertLegacyRuntime(environment) {
  if (environment === 'LOCAL_REAL') throw Error('LEGACY_DAILY_ENTRY_BLOCKED: use dev:daily for the approved local 3000/55432/9000 profile');
}

// Keep OS process support; application credentials, collectors, proxies and Node
// injection options must not leak from a different terminal/environment.
function localEnvironment(values, inherited) {
  const osKeys = new Set(['path', 'pathext', 'systemroot', 'windir', 'comspec', 'temp', 'tmp', 'tmpdir', 'appdata', 'localappdata', 'userprofile', 'home', 'homedrive', 'homepath', 'lang', 'lc_all', 'term']);
  return { ...Object.fromEntries(Object.entries(inherited).filter(([key]) => osKeys.has(key.toLowerCase()))), ...values };
}
export function reviewEnvironment(values, inherited) {
  validateReview(values);
  return { ...localEnvironment(values, inherited), WORKER_MODE: 'disabled', FREE_WORKER_MODE: 'false', LOCAL_REVIEW_OFFLINE: 'true', AIHOT_PUBLIC_NEWS_ENABLED: 'false', AIHOT_NEWS_CACHE_ROOT: resolve(localRoot, 'output/research-news-private/review') };
}

// The approved daily entry remains local and keeps all external jobs disabled.
export const DAILY = Object.freeze({ databasePort: '55432', databaseName: '/content_center', webPort: '3000', cookiePrefix: 'content-center-local-daily' });
export function validateDaily(values) {
  const db = new URL(values.DATABASE_URL);
  if (!['postgresql:', 'postgres:'].includes(db.protocol) || !['localhost', '127.0.0.1'].includes(db.hostname) || db.port !== DAILY.databasePort || db.pathname !== DAILY.databaseName) throw Error('DAILY_DATABASE_MISMATCH');
  if (values.APP_URL !== 'http://localhost:3000' || values.STORAGE_DRIVER !== 'S3_COMPATIBLE' || values.S3_ENDPOINT !== 'http://127.0.0.1:9000' || values.REDIS_URL !== 'redis://127.0.0.1:1/0') throw Error('DAILY_ENDPOINT_MISMATCH');
  if (values.ENVIRONMENT_ID !== 'LOCAL_REAL' || values.AUTH_COOKIE_PREFIX !== DAILY.cookiePrefix || values.LOCAL_REVIEW_OFFLINE !== 'false' || values.EXTERNAL_CALLS_DISABLED !== 'true' || values.FREE_WORKER_MODE !== 'false' || values.DEMO_AUTO_LOGIN !== 'false' || values.INTERNAL_SIGNUP_ENABLED !== 'false' || values.SYSTEM_MANAGED_PROVIDERS !== 'false' || values.MOCK_MODE !== 'false') throw Error('DAILY_SAFETY_FLAGS_REQUIRED');
  if (!values.AUTH_SECRET || !values.INTEGRATION_ENCRYPTION_KEY || !values.S3_ACCESS_KEY_ID || !values.S3_SECRET_ACCESS_KEY || !values.S3_BUCKET) throw Error('DAILY_EXISTING_CONFIGURATION_REQUIRED');
  return DAILY;
}
export function dailyEnvironment(values, inherited) {
  validateDaily(values);
  return { ...localEnvironment(values, inherited), WORKER_MODE: 'disabled', LOCAL_RELEASE_PROFILE: 'daily', AIHOT_PUBLIC_NEWS_ENABLED: 'true', AIHOT_NEWS_CACHE_ROOT: resolve(localRoot, 'output/research-news-private/daily') };
}
