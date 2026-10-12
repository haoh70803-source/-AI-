import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as url from 'node:url';
import * as path from 'node:path';
import * as profiles from './local-profile.mjs';
import * as releases from './local-release-profile.mjs';

const fixture = {
  DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:55438/content_center_12_review',
  APP_URL: 'http://localhost:3022', STORAGE_DRIVER: 'S3_COMPATIBLE',
  S3_ENDPOINT: 'http://127.0.0.1:19020', REDIS_URL: 'redis://127.0.0.1:1/0',
  ENVIRONMENT_ID: 'LOCAL_REVIEW', AUTH_COOKIE_PREFIX: 'content-center-12-review',
  LOCAL_REVIEW_OFFLINE: 'true', FREE_WORKER_MODE: 'false', AUTH_SECRET: 'isolated-test-fixture',
  INTEGRATION_ENCRYPTION_KEY: 'fixture', S3_ACCESS_KEY_ID: 'fixture',
  S3_SECRET_ACCESS_KEY: 'fixture', S3_BUCKET: 'fixture',
};

async function runEntry(mode, action = 'dev', failedCommand) {
  const calls = [], errors = [];
  const fakeProcess = { argv: ['node', 'local-web.mjs', mode, action], env: {}, execPath: process.execPath };
  const context = vm.createContext({});
  const dependencies = {
    'node:process': { default: fakeProcess },
    'node:console': { default: { log() {}, error(value) { errors.push(value); } } },
    'node:fs': { readFileSync: () => '' },
    'node:util': { parseEnv: () => ({ ...fixture }) },
    'node:url': url, 'node:path': path,
    './local-profile.mjs': profiles, './local-release-profile.mjs': releases,
    'node:child_process': {
      spawnSync(command, args, options) {
        calls.push({ command, args, options });
        return { status: command === failedCommand ? 1 : 0 };
      },
      spawn(command, args) {
        calls.push({ command, args, web: true });
        return { on() {} };
      },
    },
  };
  const module = new vm.SourceTextModule(readFileSync(new URL('./local-web.mjs', import.meta.url), 'utf8'), {
    context, initializeImportMeta(meta) { meta.url = new URL('./local-web.mjs', import.meta.url).href; },
  });
  await module.link(specifier => {
    const exports = dependencies[specifier];
    assert.ok(exports, `Unexpected dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { calls, errors, exitCode: fakeProcess.exitCode };
}

test('live startup prepares ASR before queue and Web', async () => {
  const result = await runEntry('live');
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.calls.slice(0, 4).map(call => call.command), ['ffmpeg', 'ffprobe', 'powershell.exe', 'docker']);
  assert.match(result.calls[2].args.at(-1), /start-local-asr\.ps1$/);
  assert.equal(result.calls[2].options.windowsHide, true);
  assert.equal(result.calls.at(-1).web, true);
});

test('ASR startup failure is reported while other workspace functions remain available', async () => {
  const result = await runEntry('live', 'dev', 'powershell.exe');
  assert.match(result.errors[0], /^LIVE_ASR_UNAVAILABLE/);
  assert.equal(result.calls.some(call => call.command === 'docker'), true);
  assert.equal(result.calls.at(-1).web, true);
});

test('offline review startup does not start ASR or queue', async () => {
  const result = await runEntry('review');
  assert.equal(result.errors.length, 0);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].web, true);
});

test('configuration check does not launch any service', async () => {
  const result = await runEntry('live', 'check');
  assert.equal(result.errors.length, 0);
  assert.equal(result.calls.length, 0);
});
