import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db } from '@content-center/db';
import { auth } from '../lib/auth';

const origin = 'http://localhost:3022';
const output = process.env.VIDEO_ANALYTICS_EVIDENCE_DIR ?? resolve(process.cwd(), '../../output/starship-ui/verification');
let browser: Browser, context: BrowserContext, userId = '', workspaceId = '', projectId = '', sourceId = '';
const errors: string[] = [], checks: unknown[] = [];
beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== 'LOCAL_REVIEW' || new URL(process.env.DATABASE_URL!).port !== '55438') throw Error('ISOLATED_REVIEW_REQUIRED');
  await mkdir(output, { recursive: true });
  const email = `starship-${randomUUID()}@example.test`, password = `disposable-${randomUUID()}`;
  userId = (await auth.api.signUpEmail({ body: { name: '星舰视觉验收', email, password } })).user.id;
  workspaceId = (await db.workspace.create({ data: { name: '临时视觉验收空间', slug: `starship-${randomUUID()}`, members: { create: { userId, role: 'OWNER' } } } })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: '教培运营内容项目 · 临时测试', description: '仅用于验证已有界面，不调用模型。' } })).id;
  sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: 'TEXT', title: '招生咨询素材 · 临时测试', rawText: '说明课程适用年龄、家长关心的问题和试听安排。', status: 'READY' } })).id;
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  expect(response.ok).toBe(true);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(response.headers.getSetCookie().map(value => { const pair = value.split(';')[0]!, i = pair.indexOf('='); return { name: pair.slice(0, i), value: pair.slice(i + 1), url: origin }; }));
}, 90000);
afterAll(async () => {
  await context?.close(); await browser?.close();
  if (workspaceId) {
    await db.contentProject.deleteMany({ where: { workspaceId } });
    await db.sourceItem.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: workspaceId } });
  }
  if (userId) await db.user.deleteMany({ where: { id: userId } });
  await writeFile(resolve(output, '全站视觉验收.json'), JSON.stringify({ checks, errors, fixtureCleanupVerified: userId ? await db.user.count({ where: { id: userId } }) === 0 : true, paidModelCalls: 0 }, null, 2));
  await db.$disconnect();
}, 30000);

it('retains the exact original light root token block', async () => {
  const css = await readFile(resolve(process.cwd(), 'app/globals.css'), 'utf8');
  const baseline = JSON.parse(await readFile(resolve(process.cwd(), '../../output/starship-ui/baseline.json'), 'utf8'));
  expect(createHash('sha256').update(css.match(/:root\s*\{[^}]*\}/)![0]).digest('hex')).toBe(baseline.lightRoot);
});

it('preserves the existing shell dimensions, sidebar pinning and focus ring', async () => {
  const page = await context.newPage();
  await page.goto(origin + '/dashboard', { waitUntil: 'load' });
  const sidebar = page.locator('.xsj-app-sidebar');
  await sidebar.hover();
  const pin = page.getByRole('button', { name: '固定展开侧栏', exact: true });
  if (await pin.count()) await pin.click();
  await page.locator('.xsj-app-sidebar[data-sidebar-state="PINNED_EXPANDED"]').waitFor();
  await page.waitForTimeout(250);
  expect((await sidebar.boundingBox())!.width).toBe(236);
  expect((await page.locator('.xsj-app-topbar').boundingBox())!.height).toBe(44);
  await page.getByRole('button', { name: '取消固定侧栏', exact: true }).click();
  await page.mouse.move(800, 300);
  await page.locator('.xsj-app-sidebar[data-sidebar-state="COLLAPSED"]').waitFor();
  await page.waitForTimeout(250);
  expect((await sidebar.boundingBox())!.width).toBe(68);
  await sidebar.hover();
  await page.getByRole('button', { name: '固定展开侧栏', exact: true }).click();
  const group = page.getByRole('button', { name: '知识与资料', exact: true });
  await group.focus(); await page.keyboard.press('Enter');
  expect(await group.getAttribute('aria-expanded')).toBe('true');
  expect(await group.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await group.evaluate(el => getComputedStyle(el).outlineColor)).toBe('rgb(76, 201, 255)');
  const topbar = await page.locator('.xsj-app-topbar').evaluate(el => ({ color: getComputedStyle(el).backgroundColor, material: getComputedStyle(el).backgroundImage }));
  expect(topbar.color).toBe('rgb(7, 11, 20)');
  expect(topbar.material).toContain('linear-gradient');
  await page.screenshot({ path: resolve(output, '工作台-最终壳层.png'), fullPage: true, caret: 'initial' });
  await page.close(); checks.push('壳层44px/236px/68px、侧栏固定与收起、键盘焦点');
}, 90000);

it('renders the main authenticated pages with consistent tokens and no runtime errors', async () => {
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  const routes = ['/dashboard', '/projects', '/projects/new', `/projects/${projectId}`, `/projects/${projectId}/studio`, '/library', `/library/${sourceId}`, '/library/methods', '/library/feishu', '/research', '/research/new', '/research/results', '/research/sources', '/research/works', '/research/benchmarks', '/research/trends', '/topics', '/knowledge', '/knowledge/facts', '/ip-context', '/content-review', '/calendar', '/short-video/tasks'];
  for (const [index, route] of routes.entries()) {
    const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    await page.locator('.app-main').waitFor();
    await page.waitForLoadState('load');
    await page.locator('.research-loading, .studio-assistant-loading').first().waitFor({ state: 'hidden', timeout: 60000 });
    expect(response?.status(), route).toBeLessThan(400);
    const surface = await page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--surface').trim());
    expect(surface, route).toBe('#0e1626');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    await page.screenshot({ path: resolve(output, `全站-${String(index + 1).padStart(2, '0')}-${route.split('/')[1]}.png`), fullPage: true, caret: 'initial' });
    checks.push({ route, status: response?.status(), finalPath: new URL(page.url()).pathname, surface });
  }
  expect(errors).toEqual([]); await page.close();
}, 360000);

it('preserves the settings dialog, its navigation and Escape behavior', async () => {
  let page = await context.newPage();
  for (const route of ['/settings', '/settings/account', '/settings/workspace', '/settings/members', '/settings/integrations', '/settings/storage', '/settings/diagnostics', '/settings/creator-profile', '/settings/about']) {
    await page.close(); page = await context.newPage(); page.setDefaultNavigationTimeout(60000);
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), route).toBe(200);
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    await dialog.waitFor();
    expect(await dialog.evaluate(el => getComputedStyle(el).getPropertyValue('--surface').trim()), route).toBe('#0e1626');
    expect(await dialog.getByRole('button', { name: '关闭设置' }).isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    checks.push({ route, settingsDialog: true });
    await page.screenshot({ path: resolve(output, `设置-${route.split('/').at(-1)}.png`), fullPage: true, caret: 'initial' });
  }
  await page.screenshot({ path: resolve(output, '全站-设置窗口.png'), fullPage: true, caret: 'initial' });
  await page.keyboard.press('Escape');
  await page.waitForURL('**/dashboard');
  expect(await page.getByRole('dialog', { name: '设置', exact: true }).count()).toBe(0);
  expect(await page.locator('body').evaluate(el => el.style.overflow)).not.toBe('hidden');
  expect(errors).toEqual([]); await page.close();
}, 180000);

it('keeps narrow layouts usable and honors reduced motion', async () => {
  const page = await context.newPage(); page.setDefaultNavigationTimeout(90000); await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['/dashboard', '/projects', '/library', '/research', '/settings']) {
    await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    await page.locator('.app-main').waitFor();
    await page.waitForLoadState('load');
    await page.locator('.research-loading, .studio-assistant-loading').first().waitFor({ state: 'hidden', timeout: 60000 });
    await page.locator('.xsj-app-sidebar[data-sidebar-state="COLLAPSED"]').waitFor();
    expect((await page.locator('.app-main').boundingBox())!.width, route).toBeGreaterThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    const button = page.locator('button').first();
    if (await button.count()) expect(await button.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
    await page.screenshot({ path: resolve(output, `窄屏-${route.slice(1)}.png`), fullPage: true, caret: 'initial' });
    checks.push({ route, narrow: true, reducedMotion: true });
  }
  await page.close();
}, 240000);

it('styles public authentication forms without changing their existing behavior', async () => {
  const anonymous = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await anonymous.newPage(); page.setDefaultNavigationTimeout(90000); page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/login', '/register', '/account/recovery']) {
    const response = await page.goto(origin + route, { waitUntil: 'load' });
    expect(response?.status(), route).toBe(200);
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--surface').trim())).toBe('#0e1626');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(output, `公共-${route.split('/').at(-1)}.png`), fullPage: true, caret: 'initial' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/login', { waitUntil: 'load' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(output, '公共-登录窄屏.png'), fullPage: true, caret: 'initial' });
  expect(errors).toEqual([]); await anonymous.close();
}, 120000);
