import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReview, assertLegacyRuntime, reviewEnvironment, validateDaily, dailyEnvironment } from './local-profile.mjs';
const values = { STORAGE_DRIVER: 'S3_COMPATIBLE', S3_ENDPOINT: 'http://127.0.0.1:19020', REDIS_URL: 'redis://127.0.0.1:1/0', DATABASE_URL: 'postgresql://placeholder@127.0.0.1:55438/content_center_12_review', APP_URL: 'http://localhost:3022', ENVIRONMENT_ID: 'LOCAL_REVIEW', AUTH_COOKIE_PREFIX: 'content-center-12-review', LOCAL_REVIEW_OFFLINE: 'true', FREE_WORKER_MODE: 'false' };
test('accepts only the identified upgraded copy', () => assert.equal(validateReview(values).webPort, '3022'));
test('rejects original, old integration, remote, and misnamed databases', () => {
  for (const DATABASE_URL of ['postgresql://placeholder@localhost:55432/content_center', 'postgresql://placeholder@localhost:55435/content_center_agent_test_integration', 'postgresql://placeholder@remote.invalid:55438/content_center_12_review', 'postgresql://placeholder@localhost:55438/other']) assert.throws(() => validateReview({ ...values, DATABASE_URL }));
});
test('requires isolated cookie, offline mode, worker off, and matching browser port', () => {
  for (const patch of [{ S3_ENDPOINT: 'https://remote.invalid' }, { REDIS_URL: 'redis://127.0.0.1:6381/7' },{ AUTH_COOKIE_PREFIX: 'better-auth' }, { LOCAL_REVIEW_OFFLINE: 'false' }, { FREE_WORKER_MODE: 'true' }, { APP_URL: 'http://localhost:3000' }]) assert.throws(() => validateReview({ ...values, ...patch }));
});
test('legacy daily entry cannot silently operate the original database', () => assert.throws(() => assertLegacyRuntime('LOCAL_REAL')));

test('review launcher does not inherit collectors, proxy or Node injection options', () => {
  const env = reviewEnvironment(values, { Path: 'fixture-path', SystemRoot: 'fixture-system', TEMP: 'fixture-temp', BENCHMARK_F2_PYTHON: 'fixture-python', BENCHMARK_F2_COOKIE: 'fixture-cookie', LOCAL_ASR_ENDPOINT: 'https://asr.invalid', HTTPS_PROXY: 'https://proxy.invalid', NODE_OPTIONS: '--import=fixture', DATABASE_URL: 'postgresql://fixture@localhost:55432/content_center' });
  assert.equal(env.Path, 'fixture-path'); assert.equal(env.SystemRoot, 'fixture-system'); assert.equal(env.TEMP, 'fixture-temp');
  assert.equal(env.DATABASE_URL, values.DATABASE_URL);
  for (const key of ['BENCHMARK_F2_PYTHON', 'BENCHMARK_F2_COOKIE', 'LOCAL_ASR_ENDPOINT', 'HTTPS_PROXY', 'NODE_OPTIONS']) assert.equal(env[key], undefined);
});

const daily = { ...values, DATABASE_URL: 'postgresql://placeholder@127.0.0.1:55432/content_center', APP_URL: 'http://localhost:3000', S3_ENDPOINT: 'http://127.0.0.1:9000', ENVIRONMENT_ID: 'LOCAL_REAL', AUTH_COOKIE_PREFIX: 'content-center-local-daily', LOCAL_REVIEW_OFFLINE: 'false', EXTERNAL_CALLS_DISABLED: 'true', DEMO_AUTO_LOGIN: 'false', INTERNAL_SIGNUP_ENABLED: 'false', SYSTEM_MANAGED_PROVIDERS: 'false', MOCK_MODE: 'false', AUTH_SECRET: 'fixture', INTEGRATION_ENCRYPTION_KEY: 'fixture', S3_ACCESS_KEY_ID: 'fixture', S3_SECRET_ACCESS_KEY: 'fixture', S3_BUCKET: 'fixture' };
test('daily accepts the original only and rejects unsafe targets and flags', () => {
  assert.equal(validateDaily(daily).webPort, '3000');
  for (const patch of [{ DATABASE_URL: values.DATABASE_URL }, { S3_ENDPOINT: values.S3_ENDPOINT }, { AUTH_COOKIE_PREFIX: values.AUTH_COOKIE_PREFIX }, { EXTERNAL_CALLS_DISABLED: 'false' }, { FREE_WORKER_MODE: 'true' }, { DEMO_AUTO_LOGIN: 'true' }, { SYSTEM_MANAGED_PROVIDERS: 'true' }, { AUTH_SECRET: '' }]) assert.throws(() => validateDaily({ ...daily, ...patch }));
});
test('daily strips inherited secrets and process injection and retains explicit original configuration', () => {
  const env = dailyEnvironment(daily, { Path: 'fixture', NODE_OPTIONS: '--import=fixture', KIMI_API_KEY: 'fixture', BENCHMARK_F2_COOKIE: 'fixture', DATABASE_URL: values.DATABASE_URL });
  assert.equal(env.Path, 'fixture'); assert.equal(env.DATABASE_URL, daily.DATABASE_URL);
  for (const k of ['NODE_OPTIONS', 'KIMI_API_KEY', 'BENCHMARK_F2_COOKIE']) assert.equal(env[k], undefined);
});

test('validated daily explicitly selects its profile and ignores inherited or supplied foreign markers', () => {
 const env=dailyEnvironment({...daily,LOCAL_RELEASE_PROFILE:'review'},{LOCAL_RELEASE_PROFILE:'review',NODE_ENV:'production'});
 assert.equal(env.LOCAL_RELEASE_PROFILE,'daily'); assert.equal(env.NODE_ENV,undefined);
 assert.equal(env.DATABASE_URL,daily.DATABASE_URL); assert.equal(env.EXTERNAL_CALLS_DISABLED,'true'); assert.equal(env.FREE_WORKER_MODE,'false');
 assert.throws(()=>dailyEnvironment({...daily,DATABASE_URL:values.DATABASE_URL},{}),/DAILY_DATABASE_MISMATCH/);
});

test('daily public-news permission is narrow and review remains default-off', () => {
 const d=dailyEnvironment({...daily,AIHOT_PUBLIC_NEWS_ENABLED:'false',AIHOT_NEWS_CACHE_ROOT:'https://malicious.invalid'}, {AIHOT_PUBLIC_NEWS_ENABLED:'false'});
 assert.equal(d.AIHOT_PUBLIC_NEWS_ENABLED,'true'); assert.match(d.AIHOT_NEWS_CACHE_ROOT,/research-news-private[\\/]daily$/);
 assert.equal(d.EXTERNAL_CALLS_DISABLED,'true'); assert.equal(d.WORKER_MODE,'disabled'); assert.equal(d.FREE_WORKER_MODE,'false');
 const r=reviewEnvironment({...values,AIHOT_PUBLIC_NEWS_ENABLED:'true',AIHOT_NEWS_CACHE_ROOT:'foreign'},{AIHOT_PUBLIC_NEWS_ENABLED:'true'});
 assert.equal(r.AIHOT_PUBLIC_NEWS_ENABLED,'false'); assert.match(r.AIHOT_NEWS_CACHE_ROOT,/research-news-private[\\/]review$/);
});
