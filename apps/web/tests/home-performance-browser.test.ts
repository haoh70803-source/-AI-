import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { auth } from '../lib/auth';
import { db } from '@content-center/db';
import { businessDay } from '../server/video-operations/policy';

const origin = 'http://localhost:3022';
const output = resolve(process.cwd(), '../../output/home-performance');
const phase = process.env.HOME_PERFORMANCE_PHASE ?? 'after';
let userId = '', workspaceId = '', browser: Browser, context: BrowserContext;
const samples: unknown[] = [], errors: string[] = [];
beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== 'LOCAL_REVIEW' || new URL(process.env.DATABASE_URL!).port !== '55438') throw Error('ISOLATED_REVIEW_REQUIRED');
  if (!/^[a-z-]+$/.test(phase)) throw Error('INVALID_PERFORMANCE_PHASE');
  await mkdir(output, { recursive: true });
  const email = `home-performance-${randomUUID()}@example.test`, password = `disposable-${randomUUID()}`;
  userId = (await auth.api.signUpEmail({ body: { name: '首页性能临时验收', email, password } })).user.id;
  workspaceId = (await db.workspace.create({ data: { name: '临时首页性能空间', slug: `home-performance-${randomUUID()}`, members: { create: { userId, role: 'OWNER' } } } })).id;
  const account = await db.videoAccount.create({ data: { workspaceId, handle: '首页性能验收账号', externalId: randomUUID() } });
  await db.videoDailyMetric.create({ data: { workspaceId, accountId: account.id, day: new Date(businessDay() + 'T00:00:00Z'), plays: 1234, likes: 40, comments: 5, shares: 3, saves: 10, netFollowers: -2, negativeComments: 0, observedAt: new Date(), source: 'MANUAL', updatedById: userId } });
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  expect(response.ok).toBe(true);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultNavigationTimeout(90000);
  context.setDefaultTimeout(60000);
  await context.addCookies(response.headers.getSetCookie().map(value => { const pair = value.split(';')[0]!, i = pair.indexOf('='); return { name: pair.slice(0, i), value: pair.slice(i + 1), url: origin }; }));
}, 90000);
afterAll(async () => {
  await context?.close(); await browser?.close();
  if (workspaceId) {
    await db.videoDailyMetric.deleteMany({ where: { workspaceId } });
    await db.videoAccount.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  }
  if (userId) await db.user.deleteMany({ where: { id: userId } });
  await writeFile(resolve(output, `${phase}.json`), JSON.stringify({ samples, errors, fixtureCleanupVerified: userId ? await db.user.count({ where: { id: userId } }) === 0 : true, paidModelCalls: 0 }, null, 2));
  await db.$disconnect();
}, 30000);

it('measures authenticated home readiness and preserves analytics, navigation and management', async () => {
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  for (let attempt = 1; attempt <= 5; attempt++) {
    const started = Date.now();
    const response = await page.goto(origin + '/home', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await page.locator('.va-metrics strong').first().waitFor();
    expect(await page.locator('.va-metrics strong').first().textContent()).toMatch(/[0-9]/);
    expect(await page.locator('.va-status').count()).toBe(0);
    expect(await page.getByRole('button', { name: '体验演示数据', exact: true }).count()).toBe(0);
    const readyMs = Date.now() - started;
    const navigation = await page.evaluate(() => {
      const item = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return { ttfbMs: Math.round(item.responseStart - item.startTime), domMs: Math.round(item.domContentLoadedEventEnd - item.startTime) };
    });
    const apiStarted = Date.now(); const api = await page.request.get(origin + '/api/video-data?days=30');
    expect(api.status()).toBe(200);
    samples.push({ attempt, readyMs, apiMs: Date.now() - apiStarted, ...navigation });
  }
  await page.getByRole('button', { name: '账号矩阵', exact: true }).click();
  await page.locator('.video-account-row strong').filter({ hasText: '首页性能验收账号' }).waitFor();
  await page.getByRole('button', { name: '添加账号', exact: true }).click();
  await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
  expect(await page.getByRole('dialog').count()).toBe(0);
  await page.getByRole('button', { name: '流量概览', exact: true }).click();
  await page.locator('.va-metrics strong').first().waitFor();
  expect(await page.locator('.va-profile-head strong').count()).toBe(1);
  expect(errors).toEqual([]); await page.close();
}, 240000);
