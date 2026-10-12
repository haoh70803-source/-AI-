import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ connection: vi.fn(), document: vi.fn(), member: vi.fn(), transaction: vi.fn() }));
vi.mock('@content-center/db', () => ({ db: { feishuConnection: { findUnique: mocks.connection }, feishuDocument: { findFirst: mocks.document }, workspaceMember: { findFirst: mocks.member }, $transaction: mocks.transaction } }));
import { ensureFeishuSource, syncFeishu, searchFeishu } from '../knowledge/feishu-service';
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it('offline scheduled sync does not purge previously indexed business data', async () => {
  vi.stubEnv('EXTERNAL_CALLS_DISABLED', 'true');
  expect(await syncFeishu('workspace', true)).toMatchObject({ status: 'OFFLINE', synced: 0 });
  expect(mocks.connection).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
});
it('offline retrieval does not query or expose stored chunks', async () => {
  vi.stubEnv('LOCAL_REVIEW_OFFLINE', 'true'); mocks.member.mockResolvedValue({ role: 'ADMIN' });
  expect(await searchFeishu({ workspaceId: 'workspace', userId: 'user' }, '企业知识')).toEqual([]);
  expect(mocks.connection).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
});
it('unrelated uploaded materials remain readable without Feishu connectivity', async () => {
  vi.stubEnv('EXTERNAL_CALLS_DISABLED', 'true'); mocks.document.mockResolvedValue(null);
  await expect(ensureFeishuSource({ workspaceId: 'workspace', userId: 'user' }, 'local-source')).resolves.toBeUndefined();
  expect(mocks.connection).not.toHaveBeenCalled();
});
it('offline selected Feishu sources fail closed before sync or business writes', async () => {
  vi.stubEnv('EXTERNAL_CALLS_DISABLED', 'true'); mocks.document.mockResolvedValue({ id: 'doc' }); mocks.member.mockResolvedValue({ role: 'ADMIN' });
  await expect(ensureFeishuSource({ workspaceId: 'workspace', userId: 'user' }, 'cloud-source')).rejects.toMatchObject({ reason: 'OFFLINE', status: 403 });
  expect(mocks.transaction).not.toHaveBeenCalled();
});
