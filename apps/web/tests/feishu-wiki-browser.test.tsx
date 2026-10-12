import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FeishuWikiBrowser } from '../components/library/feishu-wiki-browser';

// Use the installed DOM runtime without adding a declaration dependency just for this test.
type TestDOM = { window: Window & typeof globalThis };
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string, options: { url: string }) => TestDOM };
let dom: TestDOM, root: Root, container: HTMLElement;
const transport = vi.fn();
beforeEach(async () => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost:3000' });
  vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', transport);
  container = document.getElementById('root')!; root = createRoot(container);
  await act(async () => root.render(createElement(FeishuWikiBrowser)));
});
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
const ok = (data: object) => new Response(JSON.stringify({ connectionVersion: 'connection:3', ...data }), { headers: { 'Content-Type': 'application/json' } });
const node = { node_token: 'wikiroottoken123', obj_token: 'documenttoken123', title: '品牌手册', obj_type: 'docx', has_child: true, parent_node_token: '' };
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(element => element.textContent === label || element.getAttribute('aria-label') === label);
  expect(button, label).toBeTruthy();
  await act(async () => { button!.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function selectSpace() {
  await act(async () => { const select = container.querySelector('select')!; select.value = '7001'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 0)); });
}
function respond(extra?: (input: Record<string, string>) => Response) {
  transport.mockImplementation(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body));
    if (input.action === 'spaces') return ok({ items: [{ space_id: '7001', name: '企业知识' }], hasMore: false, pageToken: null });
    return extra?.(input) ?? ok({ items: [node], hasMore: false, pageToken: null });
  });
}
it('does not automatically call Feishu or claim documents are indexed', async () => {
  expect(transport).not.toHaveBeenCalled(); expect(container.textContent).toContain('尚未订阅、建立整库索引或共享给成员');
});
it('prefills an existing Wiki subscription without making an automatic upstream read', async () => {
  await act(async () => root.render(createElement(FeishuWikiBrowser, { initialWikiUrl: 'https://example.feishu.cn/wiki/wikiroottoken123' })));
  expect(container.querySelector('input')?.value).toBe('https://example.feishu.cn/wiki/wikiroottoken123');
  expect(transport).not.toHaveBeenCalled();
});
it('loads each requested level and preserves pagination instead of showing only the first page', async () => {
  respond(input => {
    if (input.parentToken) return ok({ items: [{ ...node, node_token: 'wikileaftoken123', title: '子文档', has_child: false }], hasMore: false, pageToken: null });
    if (input.pageToken) return ok({ items: [{ ...node, node_token: 'wikilasttoken123', title: '第二页文档', has_child: false }], hasMore: false, pageToken: null });
    return ok({ items: [node], hasMore: true, pageToken: 'next' });
  });
  await click('读取授权空间'); await selectSpace(); await click('展开 品牌手册'); expect(container.textContent).toContain('子文档');
  await click('加载此层更多节点'); expect(container.textContent).toContain('第二页文档'); expect(container.textContent).toContain('品牌手册');
});
it('renders a partial document as plain data and shows its coverage gaps', async () => {
  respond(input => input.action === 'document' ? ok({ node, status: 'READ', document: { title: '品牌手册', text: '<script>execute()</script>\n文末内容', coverage: 'PARTIAL', remoteRevision: '2', sections: [], warnings: ['图片文字未读取'] } }) : ok({ items: [node], hasMore: false, pageToken: null }));
  await click('读取授权空间'); await selectSpace(); await click('品牌手册');
  expect(container.textContent).toContain('部分解析'); expect(container.textContent).toContain('图片文字未读取'); expect(container.textContent).toContain('文末内容');
  expect(container.querySelector('script')).toBeNull();
});
it('shows API failures and permits a fresh read without fabricating data', async () => {
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ message: '没有空间阅读权限' }), { status: 403 }));
  await click('读取授权空间'); expect(container.querySelector('[role="alert"]')?.textContent).toBe('没有空间阅读权限'); expect(container.querySelector('select')).toBeNull();
  respond(); await click('读取授权空间'); expect(container.querySelector('select')?.textContent).toContain('企业知识');
});
it('offers link discovery on an empty space list and reads only the located subtree', async () => {
  transport.mockImplementation(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body));
    if (input.action === 'spaces') return ok({ items: [], hasMore: false, pageToken: null });
    if (input.action === 'resolve') return ok({ type: 'scope', spaceId: '7001', node, originalUrl: 'https://example.feishu.cn/wiki/wikiroottoken123' });
    return ok({ items: [{ ...node, node_token: 'wikileaftoken123', title: '子文档', has_child: false, parent_node_token: input.parentToken }], hasMore: false, pageToken: null });
  });
  await click('读取授权空间'); expect(container.textContent).toContain('这不代表你的个人账号没有知识库');
  container.querySelector('input')!.value = 'https://example.feishu.cn/wiki/wikiroottoken123';
  await click('定位知识空间'); expect(container.textContent).toContain('已定位知识空间：7001');
  expect(container.querySelector('a')?.href).toBe('https://example.feishu.cn/wiki/wikiroottoken123');
  expect(container.textContent).toContain('子文档'); expect(container.textContent).toContain('目录读取完成：2 个节点，1 页');
  const nodeReads = transport.mock.calls.map(call => JSON.parse(String(call[1].body))).filter(input => input.action === 'nodes');
  expect(nodeReads).toEqual([{ action: 'nodes', spaceId: '7001', parentToken: node.node_token }]);
  respond(); await click('读取授权空间'); expect(container.textContent).not.toContain('已定位知识空间');
});
it('does not misdiagnose an empty nonfinal page as a completed empty list', async () => {
  transport.mockResolvedValueOnce(ok({ items: [], hasMore: true, pageToken: 'next' }))
    .mockResolvedValueOnce(ok({ items: [{ space_id: '7001', name: '第二页知识空间' }], hasMore: false, pageToken: null }));
  await click('读取授权空间'); expect(container.textContent).toContain('本页没有可见空间');
  expect(container.textContent).not.toContain('空间列表为空');
  await click('加载更多空间'); expect(container.querySelector('select')?.textContent).toContain('第二页知识空间');
});
it('keeps denied link reads actionable without showing a successful scope', async () => {
  container.querySelector('input')!.value = 'https://example.feishu.cn/wiki/wikiroottoken123';
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ message: '节点未授权' }), { status: 403 }));
  await click('定位知识空间'); expect(container.querySelector('[role="alert"]')?.textContent).toBe('节点未授权');
  expect(container.textContent).not.toContain('已定位知识空间'); expect(container.querySelector('input')).not.toBeNull();
});
it('reads a whole space across every page and nested level, without the 20-document subscription limit', async () => {
  const branch = { ...node, node_token: 'wikibranchtoken123', title: '深层目录', parent_node_token: node.node_token };
  respond(input => {
    if (input.parentToken === branch.node_token) return ok({ items: [{ ...node, node_token: 'wikideepesttoken123', title: '最深文档', has_child: false, parent_node_token: branch.node_token }], hasMore: false, pageToken: null });
    if (input.parentToken === node.node_token) return ok({ items: [...Array.from({ length: 25 }, (_, index) => ({ ...node, node_token: `wikileaftoken${index}000`, title: `资料${index}`, has_child: false, parent_node_token: node.node_token })), branch], hasMore: false, pageToken: null });
    if (input.pageToken) return ok({ items: [{ ...node, node_token: 'wikilasttoken123', title: '第二页表格', obj_type: 'sheet', has_child: false }], hasMore: false, pageToken: null });
    return ok({ items: [node], hasMore: true, pageToken: 'next' });
  });
  await click('读取授权空间'); await selectSpace(); await click('读取整个知识空间目录');
  expect(container.textContent).toContain('目录读取完成：29 个节点，4 页');
  expect(container.textContent).toContain('第二页表格');
  const calls = transport.mock.calls.length;
  await click('展开 品牌手册'); await click('展开 深层目录');
  expect(container.textContent).toContain('资料24'); expect(container.textContent).toContain('最深文档');
  expect(transport).toHaveBeenCalledTimes(calls);
});
it('allows explicitly reading the entire linked space, including siblings outside the linked subtree', async () => {
  transport.mockImplementation(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body));
    if (input.action === 'resolve') return ok({ spaceId: '7001', node, originalUrl: 'https://example.feishu.cn/wiki/wikiroottoken123' });
    if (input.parentToken) return ok({ items: [], hasMore: false, pageToken: null });
    return ok({ items: [node, { ...node, node_token: 'wikisiblingtoken123', title: '同空间其他目录', has_child: false }], hasMore: false, pageToken: null });
  });
  container.querySelector('input')!.value = 'https://example.feishu.cn/wiki/wikiroottoken123';
  await click('定位知识空间'); expect(container.textContent).not.toContain('同空间其他目录');
  await click('读取整个知识空间目录'); expect(container.textContent).toContain('同空间其他目录');
  expect(container.textContent).toContain('整个知识空间的应用可见目录');
  expect(container.textContent).toContain('目录读取完成：2 个节点，2 页');
});
it('marks a descendant permission failure incomplete and can retry the full scan', async () => {
  let deny = true;
  respond(input => input.parentToken ? deny ? new Response(JSON.stringify({ message: '子目录未授权' }), { status: 403 }) : ok({ items: [], hasMore: false, pageToken: null }) : ok({ items: [node], hasMore: false, pageToken: null }));
  await click('读取授权空间'); await selectSpace(); await click('读取整个知识空间目录');
  expect(container.textContent).toContain('目录读取失败，结果不完整'); expect(container.textContent).not.toContain('目录读取完成');
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('子目录未授权');
  deny = false; await click('读取整个知识空间目录'); expect(container.textContent).toContain('目录读取完成');
});
it('stops repeated cursors without reporting a complete tree', async () => {
  respond(() => ok({ items: [], hasMore: true, pageToken: 'repeat' }));
  await click('读取授权空间'); await selectSpace(); await click('读取整个知识空间目录');
  expect(container.textContent).toContain('分页标记缺失或重复'); expect(container.textContent).not.toContain('目录读取完成');
  expect(transport).toHaveBeenCalledTimes(4);
});
it.each(['cycle', 'space', 'parent'])('rejects invalid directory topology: %s', async invalid => {
  respond(input => input.parentToken ? ok({ items: [{ ...node, node_token: invalid === 'cycle' ? node.node_token : 'wikileaftoken123', has_child: false, parent_node_token: invalid === 'parent' ? '' : node.node_token, space_id: invalid === 'space' ? '7002' : '7001' }], hasMore: false, pageToken: null }) : ok({ items: [node], hasMore: false, pageToken: null }));
  await click('读取授权空间'); await selectSpace(); await click('读取整个知识空间目录');
  expect(container.textContent).toContain('目录读取失败，结果不完整'); expect(container.textContent).not.toContain('目录读取完成');
});
it('discards directory data when the connection changes between pages', async () => {
  respond(input => input.parentToken ? ok({ connectionVersion: 'connection:4', items: [], hasMore: false, pageToken: null }) : ok({ items: [node], hasMore: false, pageToken: null }));
  await click('读取授权空间'); await selectSpace(); await click('读取整个知识空间目录');
  expect(container.textContent).toContain('已丢弃目录'); expect(container.querySelector('.feishu-wiki-tree')).toBeNull();
});
it('cancels an active scan and does not request more descendant pages', async () => {
  respond(input => input.parentToken ? ok({ items: [], hasMore: false, pageToken: null }) : ok({ items: [node], hasMore: false, pageToken: null }));
  await click('读取授权空间'); await selectSpace();
  transport.mockImplementation(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body));
    if (!input.parentToken) return ok({ items: [node], hasMore: false, pageToken: null });
    return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  await click('读取整个知识空间目录'); expect(container.textContent).toContain('正在递归读取目录');
  const calls = transport.mock.calls.length;
  await click('取消目录读取'); expect(container.textContent).toContain('目录读取已取消，结果不完整');
  expect(transport).toHaveBeenCalledTimes(calls); expect(container.textContent).not.toContain('目录读取完成');
});
it('continues through empty nonfinal directory pages', async () => {
  respond(input => input.pageToken ? ok({ items: [{ ...node, has_child: false }], hasMore: false, pageToken: null }) : ok({ items: [], hasMore: true, pageToken: 'next' }));
  await click('读取授权空间'); await selectSpace(); await click('读取整个知识空间目录');
  expect(container.textContent).toContain('目录读取完成：1 个节点，2 页'); expect(container.textContent).toContain('品牌手册');
});
it('reports depth-budget exhaustion as incomplete instead of silently truncating the tree', async () => {
  let count = 0;
  respond(input => ok({ items: [{ ...node, node_token: `wikidepthtoken${count++}000`, parent_node_token: input.parentToken ?? '' }], hasMore: false, pageToken: null }));
  await click('读取授权空间'); await selectSpace(); await click('读取整个知识空间目录');
  expect(container.textContent).toContain('超过 64 层读取预算'); expect(container.textContent).not.toContain('目录读取完成');
});
