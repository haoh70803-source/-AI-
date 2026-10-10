import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeishuClient } from './client';
import type { WikiNode } from './contracts';

const doc = 'documenttoken123', root = 'wikiroottoken123', leaf = 'wikileaftoken123';
const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, data }), { headers: { 'Content-Type': 'application/json' } });
const auth = () => new Response(JSON.stringify({ code: 0, tenant_access_token: 'test-token', expire: 7200 }));
const node = (id: string, parent = '', children = false): WikiNode => ({ node_token: id, obj_token: doc, obj_type: 'docx', title: id, has_child: children, parent_node_token: parent, space_id: '7001' });
function fixture(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  let clock = 1000;
  const wait = vi.fn(async (milliseconds: number) => { clock += milliseconds; });
  const transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => String(url).includes('/auth/') ? auth() : handler(new URL(String(url)), init));
  const client = new FeishuClient('cli_test12345', 'test-secret-never-real', transport as typeof fetch, { now: () => clock, sleep: wait });
  return { client, transport, wait, advance: (ms: number) => { clock += ms; } };
}
beforeEach(() => { vi.stubEnv('EXTERNAL_CALLS_DISABLED', 'false'); vi.stubEnv('LOCAL_REVIEW_OFFLINE', 'false'); });
afterEach(() => vi.unstubAllEnvs());

describe('Feishu authorization and requests', () => {
  it('caches expiring tokens with a single concurrent refresh', async () => {
    const test = fixture(() => ok({ items: [], has_more: false }));
    expect(await Promise.all([test.client.accessToken(), test.client.accessToken(), test.client.accessToken()])).toEqual(['test-token', 'test-token', 'test-token']);
    expect(test.transport).toHaveBeenCalledTimes(1);
    test.advance(7140001); await test.client.accessToken(); expect(test.transport).toHaveBeenCalledTimes(2);
  });
  it('does not retain credentials indefinitely if expiry is missing', async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ code: 0, tenant_access_token: 'temporary' })));
    const client = new FeishuClient('id', 'secret', transport, { sleep: async () => {} });
    await client.accessToken(); await client.accessToken(); expect(transport).toHaveBeenCalledTimes(2);
  });
  it('refreshes an expired token once then repeats the read', async () => {
    let calls = 0;
    const test = fixture(() => ++calls === 1 ? new Response(JSON.stringify({ code: 99991663 })) : ok({ items: [], has_more: false }));
    await test.client.listSpaces(); expect(test.transport.mock.calls.filter(([url]) => String(url).includes('/auth/'))).toHaveLength(2);
  });
  it('honors bounded Retry-After even if rate limiting returns HTML', async () => {
    let calls = 0;
    const test = fixture(() => ++calls === 1 ? new Response('busy', { status: 429, headers: { 'Retry-After': '2' } }) : ok({ items: [], has_more: false }));
    expect((await test.client.listSpaces()).items).toEqual([]); expect(test.wait).toHaveBeenCalledWith(2000, undefined);
  });
  it('stops on a long rate-limit delay', async () => {
    const test = fixture(() => new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
    await expect(test.client.listSpaces()).rejects.toMatchObject({ reason: 'RATE_LIMIT' });
    expect(test.transport.mock.calls.filter(([url]) => !String(url).includes('/auth/'))).toHaveLength(1);
  });
  it('retries service failures at most three times', async () => {
    const test = fixture(() => new Response('unavailable', { status: 503 }));
    await expect(test.client.listSpaces()).rejects.toMatchObject({ reason: 'API' });
    expect(test.transport.mock.calls.filter(([url]) => !String(url).includes('/auth/'))).toHaveLength(3);
  });
  it('does not retry withdrawn permissions or expose upstream messages', async () => {
    const test = fixture(() => new Response(JSON.stringify({ code: 1770032, msg: 'secret-upstream-text' }), { status: 403 }));
    await expect(test.client.listSpaces()).rejects.toMatchObject({ reason: 'UNAVAILABLE' });
    expect(test.transport).toHaveBeenCalledTimes(2);
  });
  it.each([131005, 131006, 99991672])('preserves safe diagnostics for denied space reads (%s)', async code => {
    const test = fixture(() => new Response(JSON.stringify({ code, msg: 'secret-upstream-text' }), { status: 400, headers: { 'x-tt-logid': 'safe_request_123' } }));
    const failure = await test.client.listNodes('7001').catch(error => error);
    expect(failure).toMatchObject({ reason: 'UNAVAILABLE', status: 403 });
    expect(failure.message).toContain('空间根目录读取失败');
    expect(failure.message).toContain(`接口 wiki.nodes，HTTP 400，错误码 ${code}`);
    expect(failure.message).toContain('请求编号 safe_request_123');
    expect(failure.message).not.toMatch(/secret-upstream-text|test-secret-never-real|test-token/);
    expect(test.transport).toHaveBeenCalledTimes(2);
  });
  it('distinguishes child directory denial and excludes unsafe request IDs', async () => {
    const test = fixture(() => new Response(JSON.stringify({ code: 131006 }), { status: 403, headers: { 'x-request-id': '<unsafe-marker>' } }));
    const failure = await test.client.listNodes('7001', root).catch(error => error);
    expect(failure.message).toContain('节点子目录读取失败');
    expect(failure.message).not.toContain('空间根目录读取失败');
    expect(failure.message).not.toMatch(/unsafe-marker|请求编号/);
    expect(test.transport).toHaveBeenCalledTimes(2);
  });
  it('preserves fixed API origin, no redirects, no response caching, and safe logs', async () => {
    const log = vi.fn(), transport = vi.fn(async (url: RequestInfo | URL) => String(url).includes('/auth/') ? auth() : ok({ items: [], has_more: false }));
    const client = new FeishuClient('cli_test12345', 'do-not-log-secret', transport as typeof fetch, { sleep: async () => {}, log });
    await client.listSpaces();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/do-not-log-secret|test-token|Bearer|app_id|app_secret/);
    expect(log.mock.calls.map(([event]) => event.operation)).toEqual(['auth.token', 'wiki.spaces']);
    expect(transport.mock.calls.every(([url]) => String(url).startsWith('https://open.feishu.cn/open-apis/'))).toBe(true);
  });
  it.each(['EXTERNAL_CALLS_DISABLED', 'LOCAL_REVIEW_OFFLINE'])('blocks %s before network access', async name => {
    const test = fixture(() => ok({})); vi.stubEnv(name, 'true');
    await expect(test.client.accessToken()).rejects.toMatchObject({ reason: 'OFFLINE' }); expect(test.transport).not.toHaveBeenCalled();
  });
  it('rejects malformed successful payloads', async () => {
    const test = fixture(() => new Response('not json'));
    await expect(test.client.listSpaces()).rejects.toMatchObject({ reason: 'PROTOCOL' });
  });
  it('rejects oversized responses', async () => {
    const test = fixture(() => new Response('{}', { headers: { 'Content-Length': '4000001' } }));
    await expect(test.client.listSpaces()).rejects.toMatchObject({ status: 413 });
  });
  it('honors cancellation before making requests', async () => {
    const controller = new AbortController(); controller.abort(); const transport = vi.fn();
    const client = new FeishuClient('id', 'secret', transport, { signal: controller.signal });
    await expect(client.listSpaces()).rejects.toThrow(); expect(transport).not.toHaveBeenCalled();
  });
});

describe('Wiki pagination and traversal', () => {
  it('retains encoded space pagination cursors', async () => {
    const test = fixture(url => { expect(url.searchParams.get('page_token')).toBe('next /+&'); return ok({ items: [{ space_id: '7001', name: '企业知识' }], has_more: true, page_token: 'another' }); });
    expect(await test.client.listSpaces('next /+&')).toMatchObject({ hasMore: true, pageToken: 'another' });
  });
  it('reads every page at every level including unsupported objects', async () => {
    const test = fixture(url => {
      const parent = url.searchParams.get('parent_node_token'), cursor = url.searchParams.get('page_token');
      if (!parent && !cursor) return ok({ items: [node(root, '', true)], has_more: true, page_token: 'next' });
      if (!parent) return ok({ items: [{ ...node('wikispreadsheet1'), obj_type: 'sheet' }], has_more: false });
      if (parent === root) return ok({ items: [node(leaf, root, true)], has_more: false });
      return ok({ items: [node('wikigrandchild1', leaf)], has_more: false });
    });
    const nodes = []; for await (const item of test.client.walkWiki('7001')) nodes.push(item);
    expect(nodes.map(item => item.node_token)).toEqual([root, 'wikispreadsheet1', leaf, 'wikigrandchild1']);
    expect(nodes[1]!.obj_type).toBe('sheet');
  });
  it('fails closed on a missing cursor', async () => {
    const test = fixture(() => ok({ items: [], has_more: true }));
    await expect(test.client.listNodes('7001')).rejects.toMatchObject({ reason: 'PROTOCOL' });
  });
  it('does not loop on repeated cursors', async () => {
    const test = fixture(() => ok({ items: [], has_more: true, page_token: 'same' }));
    const collect = async () => { for await (const item of test.client.walkWiki('7001')) void item; };
    await expect(collect()).rejects.toMatchObject({ reason: 'PROTOCOL' });
  });
  it.each(['cycle', 'wrong-space', 'wrong-parent'])('rejects %s instead of reporting a complete directory', async mode => {
    const test = fixture(() => ok({ items: [{ ...node(root), ...(mode === 'wrong-space' ? { space_id: '9999' } : {}), ...(mode === 'wrong-parent' ? { parent_node_token: leaf } : {}) }], has_more: mode === 'cycle', page_token: 'next' }));
    const collect = async () => { for await (const item of test.client.walkWiki('7001')) void item; };
    await expect(collect()).rejects.toMatchObject({ reason: 'PROTOCOL' });
  });
  it('reports budget exhaustion rather than silently dropping descendants', async () => {
    const test = fixture(() => ok({ items: [node(root), node(leaf)], has_more: false }));
    const collect = async () => { for await (const item of test.client.walkWiki('7001', undefined, { maxNodes: 1 })) void item; };
    await expect(collect()).rejects.toMatchObject({ reason: 'LIMIT' });
  });
  it('validates node and space IDs before API calls', async () => {
    const test = fixture(() => ok({}));
    await expect(test.client.listNodes('../evil')).rejects.toMatchObject({ status: 400 }); expect(test.transport).not.toHaveBeenCalled();
  });
});

describe('Document reads and legacy compatibility', () => {
  it('reads paginated blocks and verifies revision without requesting edit-only historical versions', async () => {
    const test = fixture(url => {
      if (!url.pathname.endsWith('/blocks')) return ok({ document: { title: '正文', revision_id: 2 } });
      expect(url.searchParams.get('document_revision_id')).toBe('-1');
      return url.searchParams.has('page_token') ? ok({ items: [{ block_id: 'paragraph0001', block_type: 2, text: { elements: [{ text_run: { content: '尾部知识' } }] } }], has_more: false })
        : ok({ items: [{ block_id: doc, block_type: 1, children: ['paragraph0001'] }], has_more: true, page_token: 'next' });
    });
    expect(await test.client.readStructured(doc)).toMatchObject({ text: '尾部知识', coverage: 'COMPLETE', remoteRevision: '2' });
  });
  it('does not publish a mixture of changed document revisions', async () => {
    let revision = 0;
    const test = fixture(url => url.pathname.endsWith('/blocks') ? ok({ items: [{ block_id: doc, block_type: 1 }], has_more: false }) : ok({ document: { title: '正文', revision_id: ++revision } }));
    await expect(test.client.readStructured(doc)).rejects.toMatchObject({ reason: 'CHANGED' });
  });
  it('retains existing raw-content link reads and rejects unsupported types', async () => {
    const test = fixture(url => url.pathname.includes('/get_node') ? ok({ node: { obj_type: 'docx', obj_token: doc } }) : url.pathname.endsWith('/raw_content') ? ok({ content: '原有正文' }) : ok({ document: { title: '原有资料', revision_id: 1 } }));
    expect(await test.client.read('wiki', root)).toMatchObject({ text: '原有正文', documentId: doc });
    await expect(test.client.read('sheet', root)).rejects.toMatchObject({ reason: 'UNSUPPORTED' });
  });
});
