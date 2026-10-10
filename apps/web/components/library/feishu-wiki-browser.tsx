'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FeishuPage, WikiNode, WikiSpace, ParsedDocx, FeishuSnapshot } from '@content-center/integrations';

type DocumentPreview = { status: string; node: WikiNode; document: (ParsedDocx & FeishuSnapshot) | null; message?: string };
type BrowseInput = { action: 'spaces'; pageToken?: string } | { action: 'nodes'; spaceId: string; parentToken?: string; pageToken?: string } | { action: 'document'; nodeToken: string } | { action: 'resolve'; url: string };
type WikiScope = { spaceId: string; node: WikiNode; originalUrl: string; connectionVersion: string };
type DirectoryPage = FeishuPage<WikiNode> & { connectionVersion: string };
type PageState = FeishuPage<WikiNode> & { cursors: string[] };
type DirectoryScan = { status: 'READING' | 'COMPLETE' | 'FAILED' | 'CANCELLED'; nodes: number; pages: number };

export function FeishuWikiBrowser({ initialWikiUrl = '' }: { initialWikiUrl?: string }) {
  const [spaces, setSpaces] = useState<FeishuPage<WikiSpace> | null>(null), [spaceId, setSpaceId] = useState('');
  const [pages, setPages] = useState<Record<string, PageState>>({}), [expanded, setExpanded] = useState<string[]>([]);
  const [preview, setPreview] = useState<DocumentPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null), spaceCursors = useRef(new Set<string>());
  const wikiInput = useRef<HTMLInputElement | null>(null);
  const [scope, setScope] = useState<WikiScope | null>(null);
  const [scan, setScan] = useState<DirectoryScan | null>(null), [scanning, setScanning] = useState(false);
  const [directoryMode, setDirectoryMode] = useState<'space' | 'subtree'>('space');
  const scanRef = useRef<AbortController | null>(null);
  const working = busy || scanning;
  useEffect(() => () => { scanRef.current?.abort(); requestRef.current?.abort(); }, []);

  async function read<T>(input: BrowseInput, receive: (data: T) => void, signal?: AbortSignal): Promise<T | undefined> {
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    const abort = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/feishu/browse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: abort });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '无法读取飞书目录');
      if (!abort.aborted) { receive(result); return result as T; }
    } catch (failure) {
      if (!abort.aborted) setError(failure instanceof Error ? failure.message : '读取失败');
    } finally { if (requestRef.current === controller) { requestRef.current = null; setBusy(false); } }
  }
  async function loadSpaces(cursor?: string) {
    await read<FeishuPage<WikiSpace>>({ action: 'spaces', pageToken: cursor }, result => {
      if (result.pageToken && spaceCursors.current.has(result.pageToken)) { setError('重复分页标记，空间读取未完成'); return; }
      if (result.pageToken) spaceCursors.current.add(result.pageToken);
      setSpaces(previous => ({ ...result, items: cursor ? [...(previous?.items ?? []), ...result.items] : result.items }));
    });
  }
  async function loadNodes(parentToken?: string, cursor?: string, selectedSpace = spaceId) {
    const key = parentToken ?? 'root';
    await read<FeishuPage<WikiNode>>({ action: 'nodes', spaceId: selectedSpace, parentToken, pageToken: cursor }, result => {
      const prior = pages[key], cursors = cursor ? prior?.cursors ?? [] : [];
      if (result.pageToken && cursors.includes(result.pageToken)) { setError('重复分页标记，目录读取未完成'); return; }
      setPages(previous => ({ ...previous, [key]: { ...result, items: cursor ? [...(previous[key]?.items ?? []), ...result.items] : result.items,
        cursors: result.pageToken ? [...cursors, result.pageToken] : cursors } }));
    });
  }
  async function selectSpace(value: string) {
    requestRef.current?.abort(); setScope(null); setScan(null); setDirectoryMode('space'); setSpaceId(value); setPages({}); setExpanded([]); setPreview(null); setError('');
    if (value) await loadNodes(undefined, undefined, value);
  }
  async function resolveWiki() {
    const url = wikiInput.current?.value.trim();
    if (!url) { setError('请填写飞书 Wiki 页面链接'); return; }
    setScope(null); setSpaceId(''); setPages({}); setExpanded([]); setPreview(null);
    setScan(null); setDirectoryMode('subtree');
    const located = await read<WikiScope>({ action: 'resolve', url }, result => {
      setScope(result); setSpaceId(result.spaceId);
      setPages({ root: { items: [result.node], hasMore: false, pageToken: null, cursors: [] } });
    });
    if (located) await loadEntireDirectory(located.spaceId, located.node, located.connectionVersion);
  }
  // Fetch bounded pages separately: each page rechecks server-side role and connection,
  // and large spaces are not truncated by one route's 30-second request budget.
  async function loadEntireDirectory(selectedSpace: string, root?: WikiNode, expectedVersion?: string) {
    scanRef.current?.abort();
    const controller = new AbortController(); scanRef.current = controller;
    setScanning(true); setError(''); setPreview(null); setDirectoryMode(root ? 'subtree' : 'space');
    const collected: Record<string, PageState> = root ? { root: { items: [root], hasMore: false, pageToken: null, cursors: [] } } : {};
    const queue: { parent?: string; depth: number }[] = root ? root.has_child ? [{ parent: root.node_token, depth: 1 }] : [] : [{ depth: 0 }];
    const seen = new Set(root ? [root.node_token] : []);
    let pageCount = 0;
    let connectionVersion = expectedVersion;
    const progress = (status: DirectoryScan['status']) => setScan({ status, nodes: seen.size, pages: pageCount });
    setPages({ ...collected }); setExpanded(root ? [root.node_token] : []); progress('READING');
    try {
      for (let index = 0; index < queue.length; index++) {
        const current = queue[index]!, key = current.parent ?? 'root';
        const cursors = new Set<string>();
        let cursor: string | undefined;
        do {
          if (controller.signal.aborted) { progress('CANCELLED'); return; }
          if (pageCount >= 2000) throw new Error('目录超过 2000 页读取预算，未完成读取');
          const page = await read<DirectoryPage>({ action: 'nodes', spaceId: selectedSpace, parentToken: current.parent, pageToken: cursor }, () => undefined, controller.signal);
          if (!page) { progress(controller.signal.aborted ? 'CANCELLED' : 'FAILED'); return; }
          if (!page.connectionVersion || (connectionVersion && page.connectionVersion !== connectionVersion)) {
            setPages({}); throw new Error('飞书连接已变化或响应缺少连接版本，已丢弃目录，请重新定位空间');
          }
          connectionVersion = page.connectionVersion;
          if (page.hasMore && (!page.pageToken || cursors.has(page.pageToken))) throw new Error('目录分页标记缺失或重复，未完成读取');
          for (const node of page.items) {
            if ((node.space_id && node.space_id !== selectedSpace) || (node.parent_node_token ?? '') !== (current.parent ?? '')) throw new Error('目录归属不一致，未完成读取');
            if (seen.has(node.node_token)) throw new Error('目录节点重复或循环，未完成读取');
            if (seen.size >= 10000) throw new Error('目录超过 10000 个节点读取预算，未完成读取');
            seen.add(node.node_token);
            if (node.has_child) {
              if (current.depth >= 64) throw new Error('目录超过 64 层读取预算，未完成读取');
              queue.push({ parent: node.node_token, depth: current.depth + 1 });
            }
          }
          if (page.pageToken) cursors.add(page.pageToken);
          collected[key] = { ...page, items: [...(collected[key]?.items ?? []), ...page.items], cursors: [...cursors] };
          pageCount++; setPages({ ...collected }); progress('READING');
          cursor = page.hasMore ? page.pageToken! : undefined;
        } while (cursor);
      }
      progress(controller.signal.aborted ? 'CANCELLED' : 'COMPLETE');
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '目录读取未完成');
      progress(controller.signal.aborted ? 'CANCELLED' : 'FAILED');
    } finally {
      if (scanRef.current === controller) { scanRef.current = null; setScanning(false); }
    }
  }
  async function toggle(node: WikiNode) {
    if (expanded.includes(node.node_token)) { setExpanded(values => values.filter(id => id !== node.node_token)); return; }
    setExpanded(values => [...values, node.node_token]);
    if (!pages[node.node_token]) await loadNodes(node.node_token);
  }
  function tree(parent = 'root', depth = 0, ancestors: string[] = []): ReactNode {
    const page = pages[parent];
    if (!page) return null;
    if (depth > 64) return <p role="status">目录超过预览层级，未完成展开。</p>;
    return <ul className="feishu-wiki-tree">{page.items.map(node => {
      if (ancestors.includes(node.node_token)) return <li key={node.node_token}>目录循环，已停止展开</li>;
      return <li key={node.node_token}><div className="feishu-wiki-node">
        {node.has_child ? <button type="button" disabled={working} aria-label={`${expanded.includes(node.node_token) ? '收起' : '展开'} ${node.title}`} aria-expanded={expanded.includes(node.node_token)} onClick={() => void toggle(node)}>{expanded.includes(node.node_token) ? '−' : '+'}</button> : <span aria-hidden="true">·</span>}
        <button type="button" disabled={working} onClick={() => { setPreview(null); void read<DocumentPreview>({ action: 'document', nodeToken: node.node_token }, setPreview); }}>{node.title || '未命名文档'}</button>
        <small>{node.obj_type === 'docx' ? '新版文档 · 可读取正文' : `${node.obj_type} · 暂未支持正文`}</small>
      </div>{expanded.includes(node.node_token) ? <>{tree(node.node_token, depth + 1, [...ancestors, node.node_token])}{!pages[node.node_token] && !working ? <button disabled={working} onClick={() => void loadNodes(node.node_token)}>重试读取子目录</button> : null}</> : null}</li>;
    })}{page.hasMore ? <li><button type="button" disabled={working} onClick={() => void loadNodes(parent === 'root' ? undefined : parent, page.pageToken ?? undefined)}>加载此层更多节点</button></li> : null}{page.items.length === 0 ? <li>当前层没有可见节点。</li> : null}</ul>;
  }
  return <section className="feishu-panel"><h2>Wiki 空间与目录</h2>
    <p>读取应用有权访问的空间和多级目录。此处是管理员只读预览，尚未订阅、建立整库索引或共享给成员。</p>
    <div className="feishu-actions"><button type="button" disabled={working} onClick={() => { spaceCursors.current.clear(); setScope(null); setScan(null); setSpaces(null); setSpaceId(''); setPages({}); setExpanded([]); setPreview(null); void loadSpaces(); }}>读取授权空间</button>
      {spaces?.hasMore ? <button type="button" disabled={working} onClick={() => void loadSpaces(spaces.pageToken ?? undefined)}>加载更多空间</button> : null}</div>
    {spaces || scope ? <label>知识空间<select value={scope ? `node:${scope.node.node_token}` : spaceId} disabled={working} onChange={event => { if (event.target.value !== `node:${scope?.node.node_token}`) void selectSpace(event.target.value); }}><option value="">选择空间</option>{scope ? <option value={`node:${scope.node.node_token}`}>链接定位的空间 {scope.spaceId}（{directoryMode === 'space' ? '整个空间' : '当前子树'}）</option> : null}{spaces?.items.map(space => <option key={space.space_id} value={space.space_id}>{space.name}</option>)}</select></label> : null}
    {spaces && spaces.items.length === 0 ? <p role="status">{spaces.hasMore ? '本页没有可见空间，请继续加载更多空间。' : '空间列表为空。当前使用应用身份读取，这不代表你的个人账号没有知识库。可用已授权的 Wiki 链接定位；具体访问权限以读取结果为准。'}</p> : null}
    <form className="feishu-wiki-link" onSubmit={event => { event.preventDefault(); void resolveWiki(); }}>
      <label>Wiki 页面链接<input ref={wikiInput} defaultValue={initialWikiUrl} type="url" required maxLength={2048} placeholder="https://你的企业.feishu.cn/wiki/节点令牌" disabled={working} /></label>
      <button type="submit" disabled={working}>定位知识空间</button>
    </form>
    <p>请使用 /wiki/ 页面链接。若读取被拒绝，需要在飞书侧向当前应用授权该页面；个人账号能打开页面不等于应用可读取。</p>
    {scope ? <p role="status">已定位知识空间：{scope.spaceId}。链接节点：<a href={scope.originalUrl} target="_blank" rel="noopener noreferrer">{scope.node.title || '未命名节点'}</a>。当前读取范围：{directoryMode === 'space' ? '整个知识空间的应用可见目录' : '该节点及其可访问子目录'}。</p> : null}
    {spaceId ? <div className="feishu-actions">{scope ? <button type="button" disabled={working} onClick={() => void loadEntireDirectory(spaceId, scope.node, scope.connectionVersion)}>读取当前节点全部子目录</button> : null}<button type="button" disabled={working} onClick={() => void loadEntireDirectory(spaceId, undefined, scope?.connectionVersion)}>读取整个知识空间目录</button>{scanning ? <button type="button" onClick={() => { scanRef.current?.abort(); requestRef.current?.abort(); }}>取消目录读取</button> : null}</div> : null}
    {scan ? <p role="status">{scan.status === 'COMPLETE' ? '目录读取完成' : scan.status === 'READING' ? '正在递归读取目录' : scan.status === 'CANCELLED' ? '目录读取已取消，结果不完整' : '目录读取失败，结果不完整'}：{scan.nodes} 个节点，{scan.pages} 页。仅统计应用可见目录，不代表正文已同步或建立索引。</p> : null}
    {error ? <p className="feishu-error" role="alert">{error}</p> : null}{busy ? <p role="status">正在读取飞书，请稍候…</p> : null}{tree()}
    {preview ? <article className="feishu-wiki-preview"><h3>{preview.document?.title || preview.node.title}</h3>
      {preview.document ? <><p>第 {preview.document.remoteRevision} 版 · {preview.document.sections.length} 个解析段落 · {preview.document.coverage === 'COMPLETE' ? '支持的正文块已完整解析' : '部分解析'}</p>
        {preview.document.warnings.map(warning => <p className="feishu-error" key={warning}>{warning}</p>)}<pre>{preview.document.text || '文档没有可读取的正文。'}</pre></> : <p role="status">{preview.message}</p>}
    </article> : null}
  </section>;
}
