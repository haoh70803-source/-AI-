import process from 'node:process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { validateReview, reviewEnvironment, validateDaily, dailyEnvironment } from './local-profile.mjs';
import { runtimeEnvironment } from './local-release-profile.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const mode = process.argv[2];
  if (!['review', 'daily', 'live'].includes(mode)) throw Error('Explicit local profile required');
  const values = parseEnv(readFileSync(resolve(root, mode === 'daily' ? 'output/account-upgrade-private/formal-cutover-20261004/daily.env' : 'output/account-upgrade-private/review.env'), 'utf8'));
  const profile = mode === 'daily' ? validateDaily(values) : validateReview(values);
  const action = process.argv[3] ?? 'dev';
  const env = mode === 'live' ? { ...runtimeEnvironment('live', values, process.env), NODE_ENV: 'development', APP_URL: values.APP_URL, AUTH_COOKIE_PREFIX: values.AUTH_COOKIE_PREFIX } : mode === 'daily' ? dailyEnvironment(values, process.env) : reviewEnvironment(values, process.env);
  if (mode === 'review') env.NEXT_TELEMETRY_DISABLED = '1';
  if (mode !== 'review' && !['dev', 'check'].includes(action)) throw Error('LOCAL_TESTS_REQUIRE_ISOLATED_DATABASE');
  if (action === 'check') { console.log(mode === 'live' ? 'LOCAL_LIVE: existing local 55438/19020, web 3022, real providers enabled, material queue 16379 and embedded worker' : mode === 'daily' ? 'LOCAL_REAL: approved original 55432, web 3000, original storage 9000, external providers and worker disabled' : 'LOCAL_REVIEW: isolated copy 55438, web 3022, external providers and worker disabled'); }
  else {
    if (mode === 'live') {
      for (const executable of [env.FFMPEG_PATH ?? 'ffmpeg', env.FFPROBE_PATH ?? 'ffprobe']) {
        const probe = spawnSync(executable, ['-version'], { env, windowsHide: true, stdio: 'ignore', timeout: 10000 });
        if (probe.status !== 0) throw Error('LIVE_MEDIA_TOOLS_NOT_READY: configure FFMPEG_PATH and FFPROBE_PATH in the local profile');
      }
      const queue = spawnSync('docker', ['compose', '-f', resolve(root, 'docker-compose.material.yml'), 'up', '-d', '--wait', '--wait-timeout', '45'], { env: process.env, windowsHide: true, stdio: 'inherit', timeout: 55000 });
      if (queue.status !== 0) throw Error('LIVE_QUEUE_NOT_READY: start Docker Desktop and retry');
    }
    const tests = process.argv.slice(4);
    const allowed = new Set(['account-security', 'account-safety', 'account-browser', 'account-security-http', 'auth-errors', 'auth.integration', 'account-space', 'user-lifecycle', 'internal-signup', 'account-sessions', 'account-http-isolation', 'review-asr-probes', 'artifacts', 'research-creation', 'work-research-service', 'account-v2-service', 'research-creation-browser', 'research-abc-flow', 'research-session', 'research-sharing', 'research-news', 'research-news-runtime', 'research-news-api', 'research-news-browser', 'research-api', 'topic-opportunity-v2']);
    if (action !== 'dev' && (action !== 'test' || !tests.length || tests.some(name => !allowed.has(name)))) throw Error('Only explicit review tests are allowed in this runner');
    const args = action === 'dev' ? [resolve(root, 'apps/web/node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', profile.webPort] : [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', ...tests.map(name => 'tests/' + name + '.test.ts'), '--no-file-parallelism'];
    console.log(mode === 'live' ? 'LOCAL_LIVE: real API calls enabled at http://localhost:3022; material queue and embedded worker enabled' : mode === 'daily' ? 'LOCAL_REAL: unique daily entry http://localhost:3000' : 'LOCAL_REVIEW: original 55432 is not this application database');
    const child = spawn(process.execPath, args, { cwd: resolve(root, 'apps/web'), env, stdio: 'inherit' });
    child.on('error', () => { console.error('LOCAL_REVIEW_START_FAILED'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
} catch (error) {
  const known = new Set(['REVIEW_DATABASE_MISMATCH', 'REVIEW_APP_MISMATCH', 'REVIEW_SAFETY_FLAGS_REQUIRED', 'REVIEW_STORAGE_OR_QUEUE_MISMATCH', 'DAILY_DATABASE_MISMATCH', 'DAILY_ENDPOINT_MISMATCH', 'DAILY_SAFETY_FLAGS_REQUIRED', 'DAILY_EXISTING_CONFIGURATION_REQUIRED']);
  console.error(known.has(error.message) || error.message?.startsWith('LIVE_') ? error.message : 'LOCAL_PROFILE_NOT_READY: use the documented local profile; no fallback to another database');
  process.exitCode = 1;
}
