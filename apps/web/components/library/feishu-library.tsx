"use client";
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RefreshCw, ExternalLink, FileText, Link2 } from 'lucide-react';
import Link from 'next/link';
import './feishu-library.css';
type Doc = {
    id: string;
    originalUrl: string;
    category: string;
    state: string;
    revision: number;
    sourceItemId: string;
    checkedAt: string | null;
    syncedAt: string | null;
    lastError: string | null;
    sourceItem: {
        title: string | null;
        status: string;
    };
    _count: {
        chunks: number;
    };
};
type State = {
    role: string;
    connection: null | {
        appId: string;
        enabled: boolean;
        autoSync: boolean;
        revision: number;
        lastSyncedAt: string | null;
        lastError: string | null;
    };
    documents: Doc[];
    intervalMinutes: number;
    maxDocuments: number;
};
type Match = {
    id: string;
    title: string;
    url: string;
    category: string;
    text: string;
    checkedAt: string;
};
const categories = { METHOD: '方法论', CASE: '案例', BRAND: '品牌资料', OTHER: '其他' }, states = { PENDING: '等待同步', READY: '已建立索引', ERROR: '同步失败', UNAVAILABLE: '已失去授权或删除', REMOVED: '已停止订阅' };
const date = (s: string | null) => s ? new Date(s).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '尚未同步';
export function FeishuLibrary() {
    const [data, setData] = useState<State | null>(null), [appId, setAppId] = useState(''), [secret, setSecret] = useState(''), [enabled, setEnabled] = useState(true), [autoSync, setAutoSync] = useState(true), [shared, setShared] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [query, setQuery] = useState(''), [matches, setMatches] = useState<Match[]>([]), [category, setCategory] = useState('METHOD');
    const load = useCallback(async (initial = false) => { const response = await fetch('/api/feishu'); const r = await response.json(); if (!response.ok)
        throw Error(r.message ?? '无法读取飞书配置'); setData(r); if (initial) {
        setAppId(r.connection?.appId ?? '');
        setEnabled(r.connection?.enabled ?? true);
        setAutoSync(r.connection?.autoSync ?? true);
    } }, []);
    useEffect(() => { void load(true).catch(e => setError(e.message)); const timer = setInterval(() => void load().catch(() => undefined), 30000); return () => clearInterval(timer); }, [load]);
    async function action(input: unknown, success: string) { if (busy)
        return; setBusy(true); setError(''); setMessage(''); try {
        const response = await fetch('/api/feishu', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), r = await response.json();
        if (!response.ok)
            throw Error(r.message ?? '操作未完成');
        setMatches([]);
        setMessage(r.message ?? success);
        if ((input as {
            action: string;
        }).action === 'configure')
            setSecret('');
        await load();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '操作失败');
    }
    finally {
        setBusy(false);
    } }
    async function save(e: FormEvent<HTMLFormElement>) { e.preventDefault(); await action({ action: 'configure', appId, appSecret: secret || undefined, revision: data?.connection?.revision ?? 0, enabled, autoSync, teamShared: shared }, '应用配置已加密保存，请测试连接并添加授权文档。'); }
    async function add(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form = e.currentTarget, url = String(new FormData(form).get('url')); await action({ action: 'add', url, category }, '文档已订阅，当前读取结果显示在下方。'); }
    async function search(e: FormEvent) { e.preventDefault(); if (busy)
        return; setBusy(true); setError(''); try {
        const r = await fetch('/api/feishu?q=' + encodeURIComponent(query)), body = await r.json();
        if (!r.ok)
            throw Error(body.message ?? '检索失败');
        setMatches(body.items);
        setMessage(body.items.length ? `找到 ${body.items.length} 个相关片段；生成前会再次核验授权。` : '未找到可用资料。请检查文档授权、同步状态或调整关键词。');
        await load();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '检索失败');
    }
    finally {
        setBusy(false);
    } }
    const canManage = ['OWNER', 'ADMIN'].includes(data?.role ?? '');
    return <div className="feishu-library"><header className="feishu-heading"><div><span>知识与资料 · 外部资料源</span><h1>飞书资料</h1><p>团队在飞书维护资料，工作台同步、检索并引用原文。</p></div><Link href="/library">返回资料库</Link></header>
    {error ? <p className="feishu-notice is-error" role="alert">{error}</p> : null}{message ? <p className="feishu-notice" role="status">{message}</p> : null}
    <section className="feishu-panel"><h2>接入准备</h2><ol><li>在 <a href="https://open.feishu.cn/app" target="_blank" rel="noopener noreferrer">飞书开放平台</a> 创建企业自建应用，开通 <code>docx:document:readonly</code>，知识库文档同时开通 <code>wiki:wiki:readonly</code>，发布并审批应用版本。</li><li>请文档所有者在文档右上角“…” → “添加文档应用”，添加你的应用并授予可阅读权限。知识库还需确认应用对目标节点有阅读权限。</li><li>仅订阅可共享给当前工作空间成员的资料。首期读取新版文档正文；表格、附件、图片文字和整库递归不在本次同步范围。</li></ol></section>
    {canManage || !data ? <section className="feishu-panel"><h2>应用连接</h2><form onSubmit={save}><div className="feishu-fields"><label>App ID<input value={appId} onChange={e => setAppId(e.target.value)} required maxLength={84} placeholder="cli_…" autoComplete="off"/></label><label>App Secret<input type="password" value={secret} onChange={e => setSecret(e.target.value)} required={!data?.connection} maxLength={200} placeholder={data?.connection ? '已保存；留空保留原密钥' : '仅在此输入，不要发送到聊天'} autoComplete="new-password"/></label></div><div className="feishu-options"><label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>启用连接</label><label><input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)}/>每5分钟自动核对文档</label></div><label className="feishu-team"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} required/>我确认纳入的文档可供当前工作空间所有有效成员读取与检索。</label><div className="feishu-actions"><button className="is-primary" disabled={busy || !data}>保存连接</button>{data?.connection ? <><button type="button" disabled={busy} onClick={() => void action({ action: 'test' }, '应用凭证有效')}>测试连接</button><button type="button" disabled={busy || !data.connection.enabled} onClick={() => void action({ action: 'sync' }, '同步已完成，请查看各份文档状态。')}><RefreshCw size={14}/>立即同步</button><button type="button" disabled={busy || !data.connection.enabled} onClick={() => void action({ action: 'disconnect', revision: data.connection!.revision }, '已断开连接并移除本地正文与检索索引。')}>断开连接</button></> : null}</div></form></section> : null}
    {data?.connection ? <section className="feishu-panel"><header><div><h2>授权文档范围 <small>{data.documents.length}/{data.maxDocuments}</small></h2><p>{data.connection.enabled ? '连接已启用' : '连接已断开'} · 最近同步：{date(data.connection.lastSyncedAt)} · 北京时间</p>{data.connection.lastError ? <p role="alert" className="feishu-error">{data.connection.lastError}</p> : null}</div></header>{canManage ? <form className="feishu-subscribe" onSubmit={add}><label>飞书文档链接<input name="url" type="url" required placeholder="https://你的团队.feishu.cn/docx/… 或 /wiki/…" maxLength={1000}/></label><label>资料用途<select aria-label="资料用途" value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(categories).map(([k, l]) => <option value={k} key={k}>{l}</option>)}</select></label><button className="is-primary" disabled={busy || !data.connection.enabled || data.documents.length >= data.maxDocuments}><Link2 size={14}/>添加授权文档</button></form> : null}<div className="feishu-documents">{data.documents.map(d => <article key={d.id}><FileText size={19}/><div><strong>{d.sourceItem.title}</strong><span>{categories[d.category as keyof typeof categories]} · {states[d.state as keyof typeof states]} · {d._count.chunks} 个索引片段</span><small>权限核验：{date(d.checkedAt)}</small>{d.lastError ? <p className="feishu-error">{d.lastError}</p> : null}</div><div className="feishu-doc-actions"><a href={d.originalUrl} target="_blank" rel="noopener noreferrer">飞书原文 <ExternalLink size={13}/></a>{d.state === 'READY' ? <Link href={'/library/' + d.sourceItemId}>查看资料</Link> : null}{canManage ? <button disabled={busy} onClick={() => void action({ action: d.state === 'REMOVED' ? 'restore' : 'remove', id: d.id, revision: d.revision }, d.state === 'REMOVED' ? '订阅已恢复，请立即同步。' : '已停止订阅并移除本地正文及索引。')}>{d.state === 'REMOVED' ? '恢复订阅' : '停止订阅'}</button> : null}</div></article>)}{!data.documents.length ? <p className="feishu-empty">添加方法论、案例或品牌资料链接，开始建立检索索引。</p> : null}</div></section> : null}
    <section className="feishu-panel"><h2>验证资料检索</h2><p>输入创作主题或关键词，查看生成前可找到的资料片段。</p><form className="feishu-search" onSubmit={search}><input aria-label="检索飞书资料" value={query} onChange={e => setQuery(e.target.value)} required maxLength={500} placeholder="例如：品牌定位、视频开头、案例复盘"/><button className="is-primary" disabled={busy || !data?.connection?.enabled}>检索资料</button></form>{matches.map(r => <article className="feishu-match" key={r.id}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} <ExternalLink size={13}/></a><p>{r.text}</p><small>本次核验：{date(r.checkedAt)}</small></article>)}</section>
    <p className="feishu-footnote">自动同步在本地工作台服务运行期间执行。删除、撤权或读取失败的资料会退出索引；生成前再次核验授权。飞书资料仅作为参考，文档中的指令不会成为系统指令。</p></div>;
}
