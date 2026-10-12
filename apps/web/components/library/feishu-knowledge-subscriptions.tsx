'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

export type WikiSubscription = {
  id: string; name: string; scope: string; originalUrl: string; category: string;
  state: string; revision: number; syncStatus: string; lastSyncedAt: string | null;
  lastError: string | null; nodes: number; indexed: number; unsupported: number;
};
type StoredNode = { nodeToken: string; parentNodeToken: string; title: string; objType: string; originalUrl: string; state: string; document: { sourceItemId: string; state: string; lastError: string | null } | null };
type Props = { subscriptions: WikiSubscription[]; enabled: boolean; canManage: boolean; connectionEnabled: boolean; autoSync?: boolean; onAction: (input: unknown, success: string) => Promise<void> };
const categories = { METHOD: '方法论', CASE: '案例', BRAND: '品牌资料', OTHER: '其他' };
const statuses: Record<string, string> = { PENDING: '等待同步', SCANNING: '扫描目录中', SYNCED: '目录扫描完成', ERROR: '目录扫描失败' };

export function FeishuKnowledgeSubscriptions({ subscriptions, enabled, canManage, connectionEnabled, autoSync = true, onAction }: Props) {
  const [selectedId, setSelectedId] = useState(''), [nodes, setNodes] = useState<StoredNode[] | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]), [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selected = subscriptions.find(root => root.id === selectedId);
  useEffect(() => {
    setNodes(null); setError(''); setExpanded([]);
    if (!selectedId || !enabled || !connectionEnabled || selected?.state !== 'ACTIVE') return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/feishu?subscriptionId=' + encodeURIComponent(selectedId), { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? '无法读取已同步目录');
        if (!controller.signal.aborted) setNodes(result.nodes);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '目录读取失败'); }
    })();
    return () => controller.abort();
  }, [selectedId, enabled, connectionEnabled, selected?.revision, selected?.state, selected?.lastSyncedAt, selected?.syncStatus, selected?.indexed]);

  async function act(input: unknown, success: string) {
    if (saving) return;
    setSaving(true);
    try { await onAction(input, success); } finally { setSaving(false); }
  }
  function tree(items: StoredNode[], ancestors: string[] = []): ReactNode {
    return <ul className="feishu-wiki-tree">{items.map(node => {
      if (ancestors.includes(node.nodeToken) || ancestors.length > 64) return <li key={node.nodeToken}>目录结构异常，已停止展开。</li>;
      const children = nodes?.filter(child => child.parentNodeToken === node.nodeToken) ?? [];
      return <li key={node.nodeToken}><div className="feishu-wiki-node">
        {children.length ? <button type="button" aria-label={`${expanded.includes(node.nodeToken) ? '收起' : '展开'} ${node.title}`} onClick={() => setExpanded(ids => ids.includes(node.nodeToken) ? ids.filter(id => id !== node.nodeToken) : [...ids, node.nodeToken])}>{expanded.includes(node.nodeToken) ? '−' : '+'}</button> : <span>·</span>}
        <a href={node.originalUrl} target="_blank" rel="noopener noreferrer">{node.title || '未命名文档'}</a>
        <small>{node.document ? node.document.state === 'READY' ? '正文已索引' : `正文状态：${node.document.state}` : `${node.objType} · 尚不支持正文入库`}</small>
        {node.document?.state === 'READY' ? <Link href={'/library/' + node.document.sourceItemId}>查看资料</Link> : null}
      </div>{node.document?.lastError ? <p className="feishu-error">{node.document.lastError}</p> : null}{expanded.includes(node.nodeToken) ? tree(children, [...ancestors, node.nodeToken]) : null}</li>;
    })}</ul>;
  }
  const tokens = new Set(nodes?.map(node => node.nodeToken));
  const top = nodes?.filter(node => !tokens.has(node.parentNodeToken)) ?? [];
  return <section className="feishu-panel"><h2>持续同步的企业知识库</h2>
    <p>可保存多个知识空间或目录入口。子目录逐层同步；新增、修改、移动、删除及访问变化会在后台核对。飞书原文保持只读。</p>
    {enabled && !autoSync ? <p role="status">当前自动同步已关闭。首次接入及手动请求仍会处理，后续更新需手动同步或在应用连接中开启自动核对。</p> : null}
    {!enabled ? <p role="status">持久订阅待启用：需要先审核并执行数据库迁移，再启用知识库同步。下方只读目录预览仍可使用。</p> : null}
    {enabled && canManage ? <form onSubmit={event => {
      event.preventDefault(); const fields = new FormData(event.currentTarget);
      void act({ action: 'subscribeWiki', urls: String(fields.get('urls')).split(/\r?\n/).map(url => url.trim()).filter(Boolean), scope: fields.get('scope'), category: fields.get('category'), teamShared: fields.get('teamShared') === 'on' }, '知识库入口已保存，等待后台递归同步。');
    }}><label>知识库入口链接（每行一个 Wiki 链接）<textarea name="urls" required rows={4} maxLength={20000} placeholder="https://你的企业.feishu.cn/wiki/…" /></label>
      <div className="feishu-fields"><label>同步范围<select name="scope" defaultValue="SPACE"><option value="SPACE">链接所属的整个知识空间</option><option value="SUBTREE">链接节点及所有层级子目录</option></select></label><label>资料用途<select name="category" defaultValue="OTHER">{Object.entries(categories).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
      <label className="feishu-team"><input type="checkbox" name="teamShared" required />我确认这些入口内的资料可供当前工作空间成员读取与检索。</label>
      <div className="feishu-actions"><button className="is-primary" disabled={saving || !connectionEnabled}>添加知识库入口并递归同步</button><button type="button" disabled={saving || !connectionEnabled} onClick={() => void act({ action: 'sync' }, '同步请求已提交。')}>立即同步全部入口</button></div>
    </form> : null}
    {enabled && !subscriptions.length ? <p className="feishu-empty">尚未添加知识库入口。可同时接入员工工作台、销售部、新媒体等多个空间。</p> : null}
    {subscriptions.map(root => <article className="feishu-knowledge-root" key={root.id}>
      <button type="button" onClick={() => setSelectedId(root.id)} disabled={!connectionEnabled || root.state !== 'ACTIVE'}>{root.name}</button>
      <p>{root.scope === 'SPACE' ? '整个知识空间' : '目录及全部子目录'} · {root.state === 'PAUSED' ? '已停止订阅' : statuses[root.syncStatus] ?? root.syncStatus} · {root.nodes} 个可见节点 · {root.indexed} 份正文已索引 · {root.unsupported} 个正文暂不支持</p>
      <small>最近目录同步：{root.lastSyncedAt ? new Date(root.lastSyncedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Singapore' }) : '尚未完成'}</small>
      {root.lastError ? <p className="feishu-error" role="alert">{root.lastError}</p> : null}
      {canManage ? <details><summary>管理订阅</summary><form key={root.revision} onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); void act({ action: 'updateWiki', id: root.id, revision: root.revision, name: fields.get('name'), category: fields.get('category') }, '订阅信息已更新。'); }}>
        <label>入口名称<input name="name" defaultValue={root.name} required maxLength={200} /></label><label>资料用途<select name="category" defaultValue={root.category}>{Object.entries(categories).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <div className="feishu-actions"><button disabled={saving}>保存订阅信息</button><button type="button" disabled={saving} onClick={() => void act({ action: root.state === 'PAUSED' ? 'resumeWiki' : 'pauseWiki', id: root.id, revision: root.revision }, root.state === 'PAUSED' ? '订阅已恢复，需重新同步后使用。' : '订阅已停止，不再覆盖的资料已退出索引。')}>{root.state === 'PAUSED' ? '恢复订阅' : '停止订阅'}</button></div>
      </form></details> : null}
    </article>)}
    {error ? <p role="alert" className="feishu-error">{error}</p> : null}
    {selected && selected.state === 'ACTIVE' && connectionEnabled ? <article><h3>{selected.name} · 已同步目录</h3>{nodes === null && !error ? <p role="status">正在读取本地目录…</p> : null}{nodes?.length === 0 ? <p>当前没有已核验目录，请查看后台同步状态。</p> : null}{nodes?.length && !top.length ? <p className="feishu-error">目录关系异常，请重新同步。</p> : tree(top)}</article> : null}
  </section>;
}
