import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { db, ensurePersonalWorkspaceForUser } from '@content-center/db';
import { expect, test } from '@playwright/test';
import { auth } from '../lib/auth';

test('QA-E2E-01 资料引用→六轮对话→保存→刷新→退出重登→编辑保存（Mock AI）', async ({ page, browser, baseURL }) => {
  test.setTimeout(240000);
  const suffix = randomUUID(), email = `qa-e2e-${suffix}@example.test`, password = 'qa-browser-password-123';
  const registration = await auth.api.signUpEmail({ body: { name: 'QA 教培案例', email, password } });
  const userId = registration.user.id, workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: 'QA 虚构专升本项目' } });
  const material = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: 'TEXT', sourcePlatform: 'GENERIC', title: `QA业务资料-${suffix}`, rawText: '虚构机构：星桥专升本。英语和高数，每班最多20人。不保证录取。预约免费学习规划咨询。', status: 'READY' } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const signIn = await page.request.post('/api/auth/sign-in/email', { data: { email, password }, headers: { origin: baseURL! } });
    expect(signIn.ok()).toBe(true);
    await page.goto(`/dashboard?project=${project.id}`);
    await expect(page.getByLabel('和鑫小助说')).toBeVisible();
    for (const [width, height] of [[1920,1080],[1440,900],[1366,768]] as const) {
      await page.setViewportSize({ width, height });
      await expect(page.getByLabel('和鑫小助说')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: resolve(`qa-reports/screenshots/core-${width}x${height}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: '引用已有内容', exact: true }).click();
    await page.getByLabel('搜索引用').fill(material.title!);
    await page.getByRole('button', { name: new RegExp(material.title!) }).click();
    const modifications = ['根据资料写60秒专升本短视频脚本', '缩短到45秒', '开头改成问题句', '增加镜头建议', '改为自然口语，保留每班20人', '结尾保留免费咨询，不承诺录取'];
    for (const [index, content] of modifications.entries()) {
      await page.getByLabel('和鑫小助说').fill(content);
      await page.getByRole('button', { name: '发送给鑫小助' }).click();
      await expect(page.getByRole('button', { name: '保存为成果', exact: true })).toHaveCount(index + 1, { timeout: 60000 });
    }
    await page.getByRole('button', { name: '保存为成果', exact: true }).last().click();
    await page.getByRole('dialog', { name: '保存为项目成果' }).getByLabel('名称').fill('QA可恢复脚本');
    await page.getByRole('button', { name: '保存成果', exact: true }).click();
    await expect.poll(() => db.artifact.count({ where: { projectId: project.id } })).toBe(1);
    const saved = await db.artifact.findFirstOrThrow({ where: { projectId: project.id }, include: { draftBranch: true } });
    await page.reload();
    await expect(page.getByRole('button', { name: '打开项目成果' })).toBeVisible();
    await page.getByRole('button', { name: '打开项目成果' }).click();
    await expect(page.getByLabel('成果名称')).toHaveValue('QA可恢复脚本');
    expect((await page.request.post('/api/auth/sign-out', { data: {}, headers: { origin: baseURL! } })).ok()).toBe(true);
    const anonymous = await page.request.get(`/api/projects/${project.id}/artifacts/${saved.id}`);
    expect(anonymous.status()).toBe(401);
    const context = await browser.newContext({ baseURL });
    try {
      expect((await context.request.post('/api/auth/sign-in/email', { data: { email, password }, headers: { origin: baseURL! } })).ok()).toBe(true);
      const resumed = await context.newPage();
      await resumed.goto(`/dashboard?project=${project.id}`);
      await expect(resumed.getByRole('button', { name: '打开项目成果' })).toBeVisible();
      const url = `/api/projects/${project.id}/artifacts/${saved.id}`;
      const restored = await (await context.request.get(url)).json();
      expect(restored.content).toBe(saved.draftBranch.workingBody);
      const body = restored.content + '\n镜头：展示学习规划表。';
      const updated = await context.request.put(url, { data: { title: 'QA可恢复脚本', body, expectedVersion: restored.version } });
      expect(updated.ok()).toBe(true);
      expect((await updated.json()).version).toBe(restored.version + 1);
      await resumed.reload();
      await resumed.getByRole('button', { name: '打开项目成果' }).click();
      await expect(resumed.getByLabel('成果正文')).toHaveValue(body);
      await resumed.screenshot({ path: resolve('qa-reports/screenshots/restored-artifact.png'), fullPage: true });
      const durations: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        expect((await context.request.get(url)).ok()).toBe(true);
        durations.push(performance.now() - start);
      }
      durations.sort((a,b) => a-b);
      writeFileSync(resolve('qa-reports/logs/api-performance.json'), JSON.stringify({ samples: 10, concurrency: 1, endpoint: 'GET /api/projects/:id/artifacts/:id', p50Ms: durations[4], p95Ms: durations[9], errorRate: 0, environment: 'isolated release, localhost:3016, Mock AI', measurementsMs: durations }, null, 2));
    } finally { await context.close(); }
    expect(errors).toEqual([]);
  } finally { await db.workspace.deleteMany({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect(); }
});

test('QA-E2E-02 实际登录页及跨账号项目/API隔离', async ({ page, browser, baseURL }) => {
  const suffix = randomUUID(), password = 'qa-security-password-123';
  const users: string[] = [], spaces: string[] = [];
  try {
    const owner = await auth.api.signUpEmail({ body: { name: 'QA账号A', email: `qa-a-${suffix}@example.test`, password } }); users.push(owner.user.id);
    const otherEmail = `qa-b-${suffix}@example.test`;
    const other = await auth.api.signUpEmail({ body: { name: 'QA账号B', email: otherEmail, password } }); users.push(other.user.id);
    const workspace = await ensurePersonalWorkspaceForUser(db, { userId: owner.user.id }); spaces.push(workspace.id);
    const otherSpace = await ensurePersonalWorkspaceForUser(db, { userId: other.user.id }); spaces.push(otherSpace.id);
    const project = await db.contentProject.create({ data: { workspaceId: workspace.id, createdById: owner.user.id, title: 'QA_A_PRIVATE_CONTENT' } });
    await page.goto('/login');
    await page.getByLabel('邮箱').fill(otherEmail); await page.getByLabel('密码').fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 30000 });
    for (const path of [`/api/projects/${project.id}`, `/api/projects/${project.id}/artifacts`, `/api/projects/${project.id}/assistant`]) {
      const response = await page.request.get(path);
      expect([403,404]).toContain(response.status());
      expect(await response.text()).not.toContain('QA_A_PRIVATE_CONTENT');
    }
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    const anonymous = await browser.newContext({ baseURL });
    try { expect((await anonymous.request.get(`/api/projects/${project.id}/artifacts`)).status()).toBe(401); } finally { await anonymous.close(); }
  } finally { await db.workspace.deleteMany({ where: { id: { in: spaces } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect(); }
});
