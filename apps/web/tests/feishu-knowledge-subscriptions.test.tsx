import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FeishuKnowledgeSubscriptions, type WikiSubscription } from '../components/library/feishu-knowledge-subscriptions';
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement('a', { href }, children) }));
type TestDOM = { window: Window & typeof globalThis };
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string, options: { url: string }) => TestDOM };
let dom: TestDOM, root: Root, container: HTMLElement;
const action = vi.fn(), transport = vi.fn();
const subscription: WikiSubscription = { id: 'sub', name: '员工工作台', scope: 'SPACE', originalUrl: 'https://example.feishu.cn/wiki/wikiroottoken123', category: 'OTHER', state: 'ACTIVE', revision: 1, syncStatus: 'SYNCED', lastSyncedAt: '2026-10-09T00:00:00Z', lastError: null, nodes: 31, indexed: 25, unsupported: 6 };
async function render(props: Partial<Parameters<typeof FeishuKnowledgeSubscriptions>[0]> = {}) {
  await act(async () => root.render(createElement(FeishuKnowledgeSubscriptions, { subscriptions: [subscription], enabled: true, canManage: true, connectionEnabled: true, onAction: action, ...props })));
}
beforeEach(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:3000' });
  vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('FormData', dom.window.FormData);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', transport);
  container = document.getElementById('root')!; root = createRoot(container); action.mockResolvedValue(undefined); await render();
});
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label);
  expect(button).toBeTruthy(); await act(async () => { button!.click(); await new Promise(resolve => setTimeout(resolve, 0)); });
}
it('shows real root statistics and makes no upstream request just from opening the panel', () => {
  expect(container.textContent).toContain('31 个可见节点'); expect(container.textContent).toContain('25 份正文已索引'); expect(container.textContent).toContain('6 个正文暂不支持'); expect(transport).not.toHaveBeenCalled();
});
it('submits multiple Wiki entries and the selected scope with explicit sharing confirmation', async () => {
  container.querySelector('textarea')!.value = 'https://example.feishu.cn/wiki/wikiroottoken123\n\nhttps://example.feishu.cn/wiki/wikisecondtoken123';
  const share = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!; share.checked = true;
  await click('添加知识库入口并递归同步');
  expect(action).toHaveBeenCalledWith({ action: 'subscribeWiki', urls: ['https://example.feishu.cn/wiki/wikiroottoken123', 'https://example.feishu.cn/wiki/wikisecondtoken123'], scope: 'SPACE', category: 'OTHER', teamShared: true }, expect.any(String));
});
it('gates persistent writes when deployment is not activated and hides admin actions from readers', async () => {
  await render({ enabled: false }); expect(container.textContent).toContain('持久订阅待启用'); expect(container.querySelector('textarea')).toBeNull();
  await render({ canManage: false }); expect(container.querySelector('form')).toBeNull(); expect(container.textContent).toContain('员工工作台');
});
it('stops or resumes the selected subscription with its actual optimistic revision', async () => {
  await click('停止订阅'); expect(action).toHaveBeenLastCalledWith({ action: 'pauseWiki', id: 'sub', revision: 1 }, expect.any(String));
  await render({ subscriptions: [{ ...subscription, state: 'PAUSED', revision: 2 }] });
  await click('恢复订阅'); expect(action).toHaveBeenLastCalledWith({ action: 'resumeWiki', id: 'sub', revision: 2 }, expect.any(String));
});
it('queues manual synchronization and distinguishes directory status from indexing status', async () => {
  await click('立即同步全部入口'); expect(action).toHaveBeenCalledWith({ action: 'sync' }, expect.any(String));
  expect(container.textContent).toContain('目录扫描完成'); expect(container.textContent).not.toContain('所有正文已完成');
});
it('loads stored multi-level nodes and marks Word files as unsupported instead of indexed', async () => {
  transport.mockResolvedValue(new Response(JSON.stringify({ nodes: [
    { nodeToken: 'root', parentNodeToken: '', title: '制度目录', objType: 'docx', originalUrl: subscription.originalUrl, state: 'DISCOVERED', document: { sourceItemId: 'source', state: 'READY', lastError: null } },
    { nodeToken: 'child', parentNodeToken: 'root', title: '制度.docx', objType: 'file', originalUrl: subscription.originalUrl, state: 'UNSUPPORTED', document: null },
  ] }), { headers: { 'Content-Type': 'application/json' } }));
  await click('员工工作台'); await click('展开 制度目录');
  expect(container.textContent).toContain('制度.docx'); expect(container.textContent).toContain('尚不支持正文入库');
  expect(container.querySelector('a[href="/library/source"]')).not.toBeNull(); expect(transport).toHaveBeenCalledTimes(1);
});
it('discards a displayed directory when its subscription is paused', async () => {
  transport.mockResolvedValue(new Response(JSON.stringify({ nodes: [{ nodeToken: 'root', parentNodeToken: '', title: '已读目录', objType: 'file', originalUrl: subscription.originalUrl, state: 'UNSUPPORTED', document: null }] })));
  await click('员工工作台'); expect(container.textContent).toContain('已读目录');
  await render({ subscriptions: [{ ...subscription, state: 'PAUSED', revision: 2 }] });
  expect(container.textContent).not.toContain('已读目录');
});
