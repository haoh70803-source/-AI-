import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { db, ensurePersonalWorkspaceForUser } from '@content-center/db';
import { MockLLMProvider } from '@content-center/providers';
import { auth } from '../lib/auth';
import { runProjectAssistant, getProjectAssistantThread } from '../server/assistant/service';
import { createTextArtifact, getArtifact, saveTextArtifact } from '../server/artifacts/service';

const suffix = randomUUID(), email = `prelaunch-${suffix}@example.test`, password = 'qa-isolated-password-123';
let userId = '', otherId = '', workspaceId = '', projectId = '', sourceId = '';
const facts = '测试机构：星桥专升本。提供英语和高数小班辅导，每班最多20人。只提供学习规划，不保证录取，不提供就业承诺。预约免费学习规划咨询。所有名称和内容均为虚构测试资料。';
const actor = () => ({ userId, workspaceId, projectId });
async function artifact(body = facts) {
  const thread = await getProjectAssistantThread(actor());
  const message = await db.assistantMessage.create({ data: { threadId: thread.id, role: 'ASSISTANT', status: 'COMPLETED', content: body, metadata: { resultType: 'TEXT', structuredResult: { type: 'TEXT', content: body } } } });
  return createTextArtifact({ ...actor(), sourceMessageId: message.id, title: '专升本脚本测试成果' });
}
beforeAll(async () => {
  if (process.env.ENVIRONMENT_ID !== 'LOCAL_TEST' || new URL(process.env.DATABASE_URL!).pathname !== '/content_center_agent_test_12') throw Error('QA_ISOLATED_DATABASE_REQUIRED');
  const registration = await auth.api.signUpEmail({ body: { name: '上线测试用户', email, password } });
  userId = registration.user.id;
  otherId = (await db.user.create({ data: { name: '隔离测试用户', email: `other-${email}` } })).id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: 'QA 虚构专升本教培项目' } })).id;
  sourceId = (await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: '虚构业务资料', sourceType: 'TEXT', sourcePlatform: 'GENERIC', status: 'READY', rawText: facts } })).id;
});
afterAll(async () => {
  if (workspaceId) await db.workspace.deleteMany({ where: { id: workspaceId } });
  await db.user.deleteMany({ where: { id: { in: [userId, otherId].filter(Boolean) } } });
  await db.$disconnect();
});
it('QA-P0-01 资料进入模型上下文并连续五轮修改（受控 Mock）', async () => {
  const prompts: string[] = [];
  const provider = new MockLLMProvider(input => { prompts.push(input.prompt); return `第${prompts.length}轮：星桥专升本，英语和高数，每班最多20人，不保证录取。标题：规划学习。开头：不知道如何准备？镜头：展示学习计划。口播：先分析薄弱点。结尾：预约免费学习规划咨询。`; });
  const runtime = { provider, providerName: 'MOCK', model: 'qa-script-fixture', mode: 'MOCK' as const };
  for (const content of ['根据资料写60秒脚本，包含标题、开头、镜头口播和结尾', '缩短到45秒，保留事实', '开头改成问题句', '增加高数学习建议，不能编造结果', '改成自然口语，保留每班人数', '结尾保留免费学习规划咨询']) {
    const message = await runProjectAssistant({ ...actor(), content, references: [{ sourceType: 'MATERIAL', sourceId }], skillVersionId: null }, () => {}, { runtime });
    expect(message.status, `模型调用前状态，错误：${JSON.stringify(message)}`).toBe('COMPLETED');
    expect(prompts.at(-1)).toContain('最多20人');
    if (prompts.length > 1) expect(prompts.at(-1)).toContain(`第${prompts.length - 1}轮`);
  }
  expect(prompts).toHaveLength(6);
});
it('QA-P0-02 成果保存→退出→重新登录→继续编辑→历史版本保留', async () => {
  const saved = await artifact();
  const login = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const headers = new Headers({ cookie: login.headers.getSetCookie().map(s => s.split(';')[0]).join('; ') });
  expect((await auth.api.getSession({ headers }))?.user.id).toBe(userId);
  expect((await auth.api.signOut({ headers, asResponse: true })).ok).toBe(true);
  expect(await auth.api.getSession({ headers })).toBeNull();
  const renewed = await auth.api.signInEmail({ body: { email, password } });
  expect(renewed.user.id).toBe(userId);
  expect((await getArtifact({ ...actor(), artifactId: saved.artifactId })).content).toBe(facts);
  const updated = await saveTextArtifact({ ...actor(), artifactId: saved.artifactId, expectedVersion: saved.version, title: saved.title, body: facts + '\n镜头：老师展示学习计划。' });
  expect(updated.version).toBe(saved.version + 1);
  const row = await db.artifact.findUniqueOrThrow({ where: { id: saved.artifactId } });
  const revisions = await db.draftRevision.findMany({ where: { draftBranchId: row.draftBranchId }, orderBy: { revision: 'asc' } });
  expect(revisions[0]?.body).toBe(facts);
  expect((await getArtifact({ ...actor(), artifactId: saved.artifactId })).content).toContain('镜头：老师');
});
it('QA-P0-03 并发保存只允许一个成功并返回版本冲突', async () => {
  const saved = await artifact();
  const results = await Promise.allSettled(['修改A', '修改B'].map(body => saveTextArtifact({ ...actor(), artifactId: saved.artifactId, expectedVersion: saved.version, title: saved.title, body })));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
  expect(rejected.reason.code).toBe('ARTIFACT_VERSION_CONFLICT');
  expect((await getArtifact({ ...actor(), artifactId: saved.artifactId })).version).toBe(saved.version + 1);
});
it('QA-P0-04 跨账号不能读取或写入他人成果', async () => {
  const saved = await artifact();
  await expect(getArtifact({ ...actor(), userId: otherId, artifactId: saved.artifactId })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
  await expect(saveTextArtifact({ ...actor(), userId: otherId, artifactId: saved.artifactId, expectedVersion: saved.version, title: '越权', body: '越权' })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
  expect((await getArtifact({ ...actor(), artifactId: saved.artifactId })).content).toBe(facts);
});
it('QA-P0-05 同一回复重复保存不创建重复成果', async () => {
  const saved = await artifact();
  const message = await db.assistantMessage.findFirstOrThrow({ where: { artifactId: saved.artifactId } });
  const again = await createTextArtifact({ ...actor(), sourceMessageId: message.id, title: '重复点击' });
  expect(again.artifactId).toBe(saved.artifactId);
  expect(await db.artifact.count({ where: { id: saved.artifactId } })).toBe(1);
});
