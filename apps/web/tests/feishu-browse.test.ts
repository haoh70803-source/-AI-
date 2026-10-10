import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  member: vi.fn(), allowed: vi.fn(), connection: vi.fn(), current: vi.fn(), decrypt: vi.fn(), context: vi.fn(),
  remote: { listSpaces: vi.fn(), listNodes: vi.fn(), getWikiNode: vi.fn(), readStructured: vi.fn() },
}));
vi.mock('server-only', () => ({}));
vi.mock('@content-center/db', () => ({ db: { feishuConnection: { findUnique: mocks.connection, findFirst: mocks.current } } }));
vi.mock('@content-center/integrations', async () => {
  const { feishuBrowseInput } = await import('../../../packages/integrations/src/feishu/contracts');
  const { FeishuError, parseFeishuUrl } = await import('../../../packages/integrations/src/feishu/policy');
  return { feishuBrowseInput, FeishuError, parseFeishuUrl, feishuMember: mocks.member, feishuExternalCallsAllowed: mocks.allowed,
    decryptSecret: mocks.decrypt, parseMasterEncryptionKey: vi.fn(), FeishuClient: vi.fn(function () { return mocks.remote; }) };
});
vi.mock('../server/api-access', () => ({ getApiWorkspaceContext: mocks.context, apiError: (error: string, status: number, message?: string) => Response.json({ error, message }, { status }) }));
import { browseFeishuWiki } from '../server/knowledge/feishu-browse';
import { POST } from '../app/api/feishu/browse/route';

const actor = { workspaceId: 'workspace', userId: 'admin' };
const wikiNode = { node_token: 'wikiroottoken123', obj_token: 'documenttoken123', obj_type: 'docx', title: '知识', has_child: false };
beforeEach(() => {
  vi.stubEnv('APP_URL', 'http://localhost:3000'); mocks.member.mockResolvedValue({ role: 'ADMIN' }); mocks.allowed.mockReturnValue(true);
  mocks.connection.mockResolvedValue({ id: 'connection', enabled: true, revision: 3, appId: 'cli_test12345', encryptedSecret: 'ciphertext' });
  mocks.current.mockResolvedValue({ id: 'connection' }); mocks.decrypt.mockReturnValue('test-only-secret');
  mocks.context.mockResolvedValue({ workspace: { id: 'workspace' }, session: { user: { id: 'admin' } }, role: 'ADMIN' });
  mocks.remote.listSpaces.mockResolvedValue({ items: [], hasMore: false, pageToken: null });
  mocks.remote.listNodes.mockResolvedValue({ items: [wikiNode], hasMore: false, pageToken: null });
  mocks.remote.getWikiNode.mockResolvedValue(wikiNode);
  mocks.remote.readStructured.mockResolvedValue({ title: '知识', text: '正文', coverage: 'COMPLETE', sections: [], warnings: [], unsupportedBlockIds: [], documentId: wikiNode.obj_token, remoteRevision: '1' });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const create = () => mocks.remote;

describe('admin-only Wiki discovery boundary', () => {
  it('locates an authorized subtree even when space enumeration is empty, without widening the read', async () => {
    mocks.remote.getWikiNode.mockResolvedValue({ ...wikiNode, space_id: '7001' });
    const result = await browseFeishuWiki(actor, { action: 'resolve', url: 'https://example.feishu.cn/wiki/wikiroottoken123?from=share#section' }, undefined, create);
    expect(result).toMatchObject({ type: 'scope', spaceId: '7001', originalUrl: 'https://example.feishu.cn/wiki/wikiroottoken123', node: wikiNode });
    expect(mocks.remote.getWikiNode).toHaveBeenCalledWith(wikiNode.node_token);
    expect(mocks.remote.listSpaces).not.toHaveBeenCalled(); expect(mocks.remote.listNodes).not.toHaveBeenCalled();
    expect(mocks.remote.readStructured).not.toHaveBeenCalled(); expect(mocks.member).toHaveBeenCalledTimes(2);
  });
  it.each(['http://127.0.0.1/wiki/wikiroottoken123', 'https://example.feishu.cn.evil.test/wiki/wikiroottoken123', 'https://example.feishu.cn/docx/documenttoken123'])('rejects invalid scope links before credentials or upstream reads: %s', async url => {
    await expect(browseFeishuWiki(actor, { action: 'resolve', url }, undefined, create)).rejects.toMatchObject({ status: 400 });
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.remote.getWikiNode).not.toHaveBeenCalled();
  });
  it('does not fabricate a space ID when the node response omits it', async () => {
    await expect(browseFeishuWiki(actor, { action: 'resolve', url: 'https://example.feishu.cn/wiki/wikiroottoken123' }, undefined, create)).rejects.toMatchObject({ reason: 'INCOMPLETE_RESPONSE' });
  });
  it('propagates denied node access without pretending the scope was located', async () => {
    const { FeishuError } = await import('../../../packages/integrations/src/feishu/policy');
    mocks.remote.getWikiNode.mockRejectedValue(new FeishuError(403, '节点未授权'));
    await expect(browseFeishuWiki(actor, { action: 'resolve', url: 'https://example.feishu.cn/wiki/wikiroottoken123' }, undefined, create)).rejects.toMatchObject({ status: 403 });
  });
  it('reads selected space pages without returning stored credentials', async () => {
    const result = await browseFeishuWiki(actor, { action: 'nodes', spaceId: '7001', pageToken: 'next' }, undefined, create);
    expect(mocks.member).toHaveBeenCalledWith(actor, true); expect(mocks.remote.listNodes).toHaveBeenCalledWith('7001', undefined, 'next');
    expect(JSON.stringify(result)).not.toMatch(/secret|ciphertext/);
  });
  it('denies non-admin access before credential reads', async () => {
    mocks.member.mockRejectedValueOnce(new Error('forbidden'));
    await expect(browseFeishuWiki(actor, { action: 'spaces' }, undefined, create)).rejects.toThrow('forbidden');
    expect(mocks.connection).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled();
  });
  it('never connects when the environment is offline', async () => {
    mocks.allowed.mockReturnValue(false);
    await expect(browseFeishuWiki(actor, { action: 'spaces' }, undefined, create)).rejects.toMatchObject({ reason: 'OFFLINE' });
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.remote.listSpaces).not.toHaveBeenCalled();
  });
  it('rejects disabled connections', async () => {
    mocks.connection.mockResolvedValue({ enabled: false });
    await expect(browseFeishuWiki(actor, { action: 'spaces' }, undefined, create)).rejects.toMatchObject({ status: 400 });
  });
  it('resolves Wiki object tokens before structured reads', async () => {
    const result = await browseFeishuWiki(actor, { action: 'document', nodeToken: wikiNode.node_token }, undefined, create);
    expect(mocks.remote.readStructured).toHaveBeenCalledWith(wikiNode.obj_token); expect(result).toMatchObject({ status: 'READ' });
  });
  it('reports unsupported types without attempting Docx reads', async () => {
    mocks.remote.getWikiNode.mockResolvedValue({ ...wikiNode, obj_type: 'sheet' });
    expect(await browseFeishuWiki(actor, { action: 'document', nodeToken: wikiNode.node_token }, undefined, create)).toMatchObject({ status: 'UNSUPPORTED', document: null });
    expect(mocks.remote.readStructured).not.toHaveBeenCalled();
  });
  it('discards a response if local permissions are revoked during the read', async () => {
    mocks.member.mockResolvedValueOnce({ role: 'ADMIN' }).mockRejectedValueOnce(new Error('revoked'));
    await expect(browseFeishuWiki(actor, { action: 'spaces' }, undefined, create)).rejects.toThrow('revoked');
  });
  it('discards a response if the connection changed during the read', async () => {
    mocks.current.mockResolvedValue(null);
    await expect(browseFeishuWiki(actor, { action: 'spaces' }, undefined, create)).rejects.toMatchObject({ status: 409 });
    expect(mocks.current.mock.calls[0]![0].where).toMatchObject({ workspaceId: actor.workspaceId, revision: 3, enabled: true });
  });
});
function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/feishu/browse', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
describe('Wiki browse API', () => {
  it('accepts a Wiki link and returns only the verified node scope', async () => {
    mocks.remote.getWikiNode.mockResolvedValue({ ...wikiNode, space_id: '7001' });
    const response = await POST(request({ action: 'resolve', url: ' https://example.feishu.cn/wiki/wikiroottoken123 ' }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ type: 'scope', spaceId: '7001' });
  });
  it('rejects cross-origin requests', async () => { expect((await POST(request({ action: 'spaces' }, 'https://evil.example'))).status).toBe(403); expect(mocks.context).not.toHaveBeenCalled(); });
  it('requires login', async () => { mocks.context.mockResolvedValue(null); expect((await POST(request({ action: 'spaces' }))).status).toBe(401); });
  it.each(['EDITOR', 'VIEWER'])('does not disclose app-visible spaces to %s', async role => {
    mocks.context.mockResolvedValue({ role }); expect((await POST(request({ action: 'spaces' }))).status).toBe(403); expect(mocks.connection).not.toHaveBeenCalled();
  });
  it('validates parameters and rejects arbitrary URLs', async () => { expect((await POST(request({ action: 'nodes', spaceId: '../evil', url: 'http://127.0.0.1' }))).status).toBe(400); expect(mocks.connection).not.toHaveBeenCalled(); });
  it('returns real read results with no-store headers', async () => {
    const response = await POST(request({ action: 'spaces' })); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ type: 'spaces', items: [], connectionVersion: 'connection:3' });
  });
});
