"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bell, Check, ChevronDown, Download, Plus, RefreshCw, Upload, X } from 'lucide-react';
import type { readVideo } from '@/server/video-operations/service';
import { businessDay, platforms, kinds, stages, states, csvHeaders, csvCell, type Metric, type VideoInput } from '@/server/video-operations/policy';
import './video-center.css';
import { VideoDateFilter, type VideoDateRange } from './video-date-filter';
import { platformLabel } from '@/lib/video-analytics';
type Data = Awaited<ReturnType<typeof readVideo>>;
type Json<T> = T extends Date ? string : T extends (infer E)[] ? Json<E>[] : T extends object ? {
    [K in keyof T]: Json<T[K]>;
} : T;
type View = Json<Data>;
const num = (n: number | null) => n === null ? '—' : new Intl.NumberFormat('zh-CN').format(n);
const date = (s: string | null) => s ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s)) : '尚未录入';
const localInput = (s: string) => { const d = new Date(new Date(s).getTime() + 8 * 3600000); return d.toISOString().slice(0, 16); };
const instant = (s: string) => new Date(s + ':00+08:00').toISOString();
const value = (f: FormData, n: string) => String(f.get(n) ?? '');
const numeric = (f: FormData, n: string) => { const s = value(f, n); if (!s.trim())
    throw Error('请填写' + n); return Number(s); };
function spark(values: (number | null)[]) { const max = Math.max(1, ...values.filter((x): x is number => x !== null)), paths: string[] = []; let p = ''; values.forEach((v, i) => { if (v === null) {
    if (p)
        paths.push(p);
    p = '';
    return;
} p += (p ? ' L' : 'M') + `${i / (values.length - 1 || 1) * 110},${31 - v / max * 26}`; }); if (p)
    paths.push(p); return paths; }
function Spark({ values }: {
    values: (number | null)[];
}) { return <svg viewBox="0 0 110 36" className="video-spark" aria-hidden="true">{spark(values).map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="2"/>)}</svg>; }
function Delta({ n, label }: {
    n: number | null;
    label: string;
}) { return <span className={n === null ? 'video-muted' : n < 0 ? 'video-loss' : 'video-gain'}>{n === null ? '—' : `${n >= 0 ? '↗' : '↘'} ${Math.abs(n)}%`} <small>{label}</small></span>; }
function Field({ name, label, type = 'text', required = true, defaultValue, min }: {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    defaultValue?: string | number;
    min?: number;
}) { return <label>{label}<input name={name} aria-label={label} type={type} required={required} defaultValue={defaultValue} min={min} step={type === 'number' ? 1 : undefined}/></label>; }
function download(text: string, name: string) { const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
export function VideoCenter({ mode = 'data', taskId, initialAccount = '', initialTab = 'overview', initialStage = 'all', initialPlatform = '' }: {
    mode?: 'home' | 'data' | 'tasks' | 'task';
    taskId?: string;
    initialAccount?: string;
    initialTab?: string;
    initialStage?: string;
    initialPlatform?: string;
}) {
    const [data, setData] = useState<View | null>(null), [account, setAccount] = useState(initialAccount), [days, setDays] = useState(30), [metric, setMetric] = useState<'plays' | 'exposures'>('plays'), [selectedDay, setSelectedDay] = useState(''), [tab, setTab] = useState(initialTab), [stageFilter, setStageFilter] = useState(initialStage), [taskFilter, setTaskFilter] = useState('today'), [statusFilter, setStatusFilter] = useState('all'), [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState(''), [dialog, setDialog] = useState<'account' | 'metric' | 'import' | 'content' | 'task' | 'delay' | null>(null), [targetTask, setTargetTask] = useState<View['tasks'][number] | null>(null), [preview, setPreview] = useState<{
        preview: Metric[];
        creates: number;
        updates: number;
    } | null>(null), [metricAccount, setMetricAccount] = useState(''), [metricDay, setMetricDay] = useState(businessDay()), [taskAccount, setTaskAccount] = useState(''), [note, setNote] = useState('');
    const [platform, setPlatform] = useState(initialPlatform), [range, setRange] = useState<VideoDateRange>(), [recordPage, setRecordPage] = useState(1), [importPlatform, setImportPlatform] = useState<keyof typeof platforms>('DOUYIN');
    const modalRef = useRef<HTMLElement>(null), requestRun = useRef(0), [lookup, setLookup] = useState<View['records'][number] | null>(null), [lookupBusy, setLookupBusy] = useState(false);
    const load = useCallback(async () => { const run = ++requestRun.current; setLoading(true); try {
        const q = new URLSearchParams({ days: String(days), ...(account ? { account } : {}), ...(platform ? { platform } : {}), ...(range ?? {}), ...(taskId ? { task: taskId } : {}) });
        const r = await fetch('/api/video-data?' + q, { cache: 'no-store' });
        const v = await r.json();
        if (!r.ok)
            throw Error(v.message || '数据读取失败');
        if (run === requestRun.current) {
            setData(v);
            setError('');
        }
    }
    catch (e) {
        if (run === requestRun.current)
            setError((e as Error).message);
    }
    finally {
        if (run === requestRun.current)
            setLoading(false);
    } }, [account, days, taskId, platform, range]);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => { setRecordPage(1); }, [account, days, platform, range]);
    useEffect(() => { if (data && taskId)
        setNote(data.tasks[0]?.note ?? ''); }, [data, taskId]);
    useEffect(() => { if (dialog !== 'metric' || !metricAccount)
        return; let active = true; setLookupBusy(true); setLookup(null); void fetch('/api/video-data?' + new URLSearchParams({ account: metricAccount, date: metricDay, days: '7' }), { cache: 'no-store' }).then(async (r) => { const v = await r.json(); if (!r.ok)
        throw Error(v.message || '数据读取失败'); if (active)
        setLookup(v.records.find((x: View['records'][number]) => x.accountId === metricAccount && x.day === metricDay) ?? null); }).catch(e => { if (active)
        setError(e.message); }).finally(() => { if (active)
        setLookupBusy(false); }); return () => { active = false; }; }, [dialog, metricAccount, metricDay]);
    useEffect(() => { if (!dialog)
        return; const previous = document.activeElement as HTMLElement | null; const modal = modalRef.current; const targets = () => [...(modal?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') ?? [])].filter(e => e.getBoundingClientRect().height > 0); targets()[0]?.focus(); const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        setDialog(null);
    } if (e.key === 'Tab') {
        const all = targets(), first = all[0], last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
        }
    } }; document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); previous?.focus(); }; }, [dialog, busy]);
    useEffect(() => { setTab(initialTab); setStageFilter(initialStage); setAccount(initialAccount); }, [initialTab, initialStage, initialAccount]);
    function toggleTask(t: View['tasks'][number]) {
        if (busy || !t.editable) return;
        const status = t.status === 'DONE' ? 'TODO' : 'DONE';
        setData(current => current ? { ...current, tasks: current.tasks.map(row => row.id === t.id ? { ...row, status, completedAt: status === 'DONE' ? new Date().toISOString() : null, state: status === 'DONE' ? 'DONE' : new Date(row.dueAt) < new Date() ? 'OVERDUE' : 'TODO' } : row) } : current);
        void mutate({ action: 'task.update', id: t.id, revision: t.revision, status }, true);
    }
    async function request(input: VideoInput) { const r = await fetch('/api/video-data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); const v = await r.json(); if (!r.ok)
        throw Error(v.message || '操作未完成'); return v; }
    async function mutate(input: VideoInput, keep = false) { if (busy)
        return; setBusy(true); setError(''); setMessage(''); try {
        await request(input);
        setMessage('已保存，数据与任务已更新。');
        if (!keep)
            setDialog(null);
        await load();
    }
    catch (e) {
        await load();
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    function open(which: typeof dialog, t?: View['tasks'][number]) { setError(''); setMessage(''); setPreview(null); setImportPlatform((platform || 'DOUYIN') as keyof typeof platforms); setTargetTask(t ?? null); setMetricAccount(account || data?.accounts.find(x => !x.archivedAt && (!platform || x.platform === platform))?.id || ''); setTaskAccount(account || data?.accounts.find(x => !x.archivedAt && (!platform || x.platform === platform))?.id || ''); setMetricDay(data?.today || businessDay()); setDialog(which); }
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
            if (dialog === 'account')
                await mutate({ action: 'account.create', handle: value(f, 'handle'), platform: value(f, 'platform') as keyof typeof platforms, externalId: value(f, 'externalId') });
            if (dialog === 'metric') {
                if (lookupBusy)
                    throw Error('请等待原有快照读取完成');
                const found = lookup;
                await mutate({ action: 'metrics.save', source: 'MANUAL', rows: [{ accountId: metricAccount, day: metricDay, plays: numeric(f, '播放量'), exposures: value(f, '曝光量') === '' ? null : Number(value(f, '曝光量')), likes: numeric(f, '点赞'), comments: numeric(f, '评论'), shares: numeric(f, '分享'), saves: numeric(f, '收藏'), netFollowers: numeric(f, '净增粉丝'), negativeComments: numeric(f, '负面评论'), limited: f.get('limited') === 'on', isFinal: f.get('isFinal') === 'on', observedAt: instant(value(f, 'observedAt')), revision: found?.revision ?? 0 }] });
            }
            if (dialog === 'content')
                await mutate({ action: 'content.create', accountId: value(f, 'accountId'), title: value(f, 'title'), projectId: value(f, 'projectId') || null, stage: value(f, 'stage') as Exclude<keyof typeof stages, 'ARCHIVED'> });
            if (dialog === 'task')
                await mutate({ action: 'task.create', accountId: taskAccount, contentId: value(f, 'contentId') || null, assigneeId: value(f, 'assigneeId'), kind: value(f, 'kind') as keyof typeof kinds, title: value(f, 'title'), dueAt: instant(value(f, 'dueAt')), note: value(f, 'note') });
            if (dialog === 'delay' && targetTask)
                await mutate({ action: 'task.update', id: targetTask.id, revision: targetTask.revision, dueAt: instant(value(f, 'dueAt')) });
        }
        catch (e) {
            setError((e as Error).message);
        }
    }
    async function importFile(file: File) { setBusy(true); setError(''); setPreview(null); try {
        if (file.size > 240000)
            throw Error('CSV 文件需小于240KB');
        const text = await file.text();
        if (text.includes('\ufffd'))
            throw Error('请将 CSV 保存为 UTF-8 编码');
        setPreview(await request({ action: 'csv.preview', platform: importPlatform, csv: text }));
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    if (!data)
        return <section className="video-center video-initial" aria-busy={loading}><p>{loading ? '正在读取数据中台…' : error}</p>{!loading ? <button onClick={() => void load()}>重新加载</button> : null}</section>;
    const writable = data.role !== 'VIEWER', privileged = ['OWNER', 'ADMIN'].includes(data.role), active = data.accounts.filter(a => !a.archivedAt && (!platform || a.platform === platform)), todayTasks = data.tasks.filter(t => businessDay(new Date(t.dueAt)) === data.today || t.state === 'OVERDUE'), incomplete = todayTasks.filter(t => t.status !== 'DONE'), todayDone = todayTasks.filter(t => t.status === 'DONE');
    const filteredTasks = data.tasks.filter(t => (taskFilter === 'all' || (taskFilter === 'today' && (businessDay(new Date(t.dueAt)) === data.today || t.state === 'OVERDUE')) || (taskFilter === 'overdue' && t.state === 'OVERDUE')) && (statusFilter === 'all' || t.state === statusFilter) && (!search || t.title.includes(search) || t.account.handle.includes(search)));
    const records = [...data.records].reverse(), pageCount = Math.max(1, Math.ceil(records.length / 20)), page = Math.min(recordPage, pageCount), pageRecords = records.slice((page - 1) * 20, page * 20);
    const chartDay = selectedDay || data.today, point = data.trend.find(x => x.day === chartDay), max = Math.max(1, ...data.trend.map(x => x[metric] ?? 0)), metricRow = lookup, selected = data.tasks.find(x => x.id === taskId);
    const accountSelect = (label = '关联账号', name = 'accountId', controlled = false) => <label>{label}<select aria-label={label} name={name} required value={controlled ? taskAccount : undefined} onChange={controlled ? e => setTaskAccount(e.target.value) : undefined} defaultValue={controlled ? undefined : account || active[0]?.id}>{active.map(a => <option key={a.id} value={a.id}>{a.handle} · {platformLabel(a.platform)}</option>)}</select></label>;
    const taskRow = (t: View['tasks'][number]) => <div className={'video-task-row ' + (t.status === 'DONE' ? 'is-done' : '')} key={t.id}><input type="checkbox" aria-label={'标记完成：' + t.title} checked={t.status === 'DONE'} disabled={!t.editable || busy} onChange={() => toggleTask(t)}/><div className="video-task-copy"><div><span className="video-kind">{kinds[t.kind as keyof typeof kinds]}</span><Link href={'/short-video/tasks/' + t.id}>{t.title}</Link></div><small>{t.account.handle} · {platformLabel(t.account.platform)} · {data.members.find(m => m.id === t.assigneeId)?.name ?? '负责人已停用'}</small></div><span className={'video-state state-' + t.state}>{states[t.state as keyof typeof states]}</span><time className={t.state === 'OVERDUE' ? 'video-loss' : ''} dateTime={t.dueAt}>{date(t.dueAt)} 前</time><div className="video-task-actions"><Link href={'/short-video/tasks/' + t.id}>去执行 <ArrowUpRight size={13}/></Link>{t.kind === 'PUBLISH' && t.account.platform === 'DOUYIN' ? <a href="https://creator.douyin.com/creator-micro/content/upload" target="_blank" rel="noopener noreferrer">发布页 <ArrowUpRight size={13}/></a> : null}{t.editable && t.status !== 'DONE' ? <button disabled={busy} onClick={() => open('delay', t)}>延期</button> : null}</div></div>;
    const tasksPanel = (full = false) => <section className="video-panel video-tasks"><header><div><h2>{full ? '今日任务' : '今日行动'}</h2><p>{incomplete.length} 项待处理 · {todayDone.length} 项已完成{data.tasks.length === 1000 ? ' · 仅显示最早1000项' : ''}</p></div>{full && writable ? <button className="video-primary" disabled={!active.length} onClick={() => open('task')}><Plus size={15}/>添加任务</button> : <Link href="/short-video/tasks">全部任务 <ArrowUpRight size={14}/></Link>}</header>{full ? <div className="video-task-filters"><select aria-label="任务日期范围" value={taskFilter} onChange={e => setTaskFilter(e.target.value)}><option value="today">今日与逾期</option><option value="overdue">仅逾期</option><option value="all">全部日期</option></select><select aria-label="任务状态筛选" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">全部状态</option>{Object.entries(states).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><input aria-label="搜索任务" placeholder="搜索任务或账号" value={search} onChange={e => setSearch(e.target.value)}/></div> : null}{(full ? filteredTasks : todayTasks.slice(0, 5)).map(taskRow)}{!(full ? filteredTasks : todayTasks).length ? <div className="video-empty"><Check size={22}/><strong>{full ? '当前筛选没有任务' : '今天没有待处理任务'}</strong><p>发布、直播、回复评论、剪辑和投流，都可以安排截止时间。</p>{writable ? <button disabled={!active.length} onClick={() => open('task')}>安排任务</button> : null}</div> : null}</section>;
    const lifecycle = <section className="video-panel video-lifecycle"><header><div><h2>内容生命周期</h2><p>运营台账 · 已完成任务不会自动视为已发布</p></div><Link href="/short-video?tab=content">管理内容 <ArrowUpRight size={14}/></Link></header><div>{Object.entries(stages).map(([key, label]) => <Link href={'/short-video?tab=content&stage=' + key} key={key}><span>{label}</span><strong>{data.contents.filter(c => c.stage === key).length}</strong></Link>)}</div></section>;
    function exportData() { const rows = data!.records.map(r => [data!.accounts.find(a => a.id === r.accountId)?.externalId ?? '', r.day, r.plays, r.exposures ?? '', r.likes, r.comments, r.shares, r.saves, r.netFollowers, r.negativeComments, r.limited ? '是' : '否', r.isFinal ? '是' : '否', r.observedAt]); download([csvHeaders.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\r\n'), '平台日数据-' + data!.today + '.csv'); }
    const hasTrend = data.trend.some(row => row[metric] !== null);
    const overview = <><div className="video-metrics"><article><span>今日总流量 <small>{metric === 'plays' ? '播放量' : '曝光量'}</small></span><strong>{num(data.metrics[metric])}</strong><div className="video-deltas"><Delta n={data.changes[metric].yesterday} label="较昨日全日"/><Delta n={data.changes[metric].lastWeek} label="较上周同期全日"/></div></article><article><span>今日总互动 <small>赞 · 评 · 转 · 藏</small></span><strong>{num(data.metrics.interactions)}</strong><div className="video-card-foot"><small>累计互动次数</small><Spark values={data.trend.slice(-7).map(x => x.interactions)}/></div></article><article><span>今日净增粉丝 <small>新增 − 取关</small></span><strong className={data.metrics.netFollowers === null ? '' : data.metrics.netFollowers < 0 ? 'video-loss' : 'video-gain'}>{data.metrics.netFollowers !== null && data.metrics.netFollowers > 0 ? '+' : ''}{num(data.metrics.netFollowers)}</strong><div className="video-card-foot"><small>{data.metrics.plays !== null && data.metrics.plays > 0 && data.metrics.interactions !== null ? '互动/播放 ' + (data.metrics.interactions / data.metrics.plays * 100).toFixed(2) + '%' : '等待今日快照'}</small><span className="video-coverage">{data.coverage.recorded}/{data.coverage.total} 账号已录入</span></div></article></div>
 <section className={'video-panel video-trend' + (!hasTrend ? ' is-empty' : '')}><header><div><h2>流量趋势 <span>{num(hasTrend ? data.trend.reduce((n, r) => n + (r[metric] ?? 0), 0) : null)}</span></h2><p>已录入快照累计 · 缺失日期显示空档，不计为零</p></div><div className="video-segment"><button aria-pressed={metric === 'plays'} onClick={() => setMetric('plays')}>播放量</button><button aria-pressed={metric === 'exposures'} onClick={() => setMetric('exposures')}>曝光量</button></div></header><div className="video-chart">{!hasTrend ? <div className="video-chart-empty"><strong>尚无流量快照</strong><span>录入或导入数据后查看趋势；未录入不代表零流量。</span></div> : null}<div className="video-chart-axis"><span>{num(max)}</span><span>{num(Math.round(max / 2))}</span><span>0</span></div><div className="video-chart-plot"><div className="video-chart-grid"/><div className="video-bars" style={{ gridTemplateColumns: `repeat(${data.trend.length},minmax(0,1fr))` }}>{data.trend.map(p => <button key={p.day} aria-label={`${p.day} ${metric === 'plays' ? '播放量' : '曝光量'} ${p[metric] === null ? '未录入' : p[metric]}；${p.coverage}/${p.accounts}账号`} aria-pressed={chartDay === p.day} className={p[metric] === null ? 'is-missing' : ''} onMouseEnter={() => setSelectedDay(p.day)} onFocus={() => setSelectedDay(p.day)} onClick={() => setSelectedDay(p.day)}><i style={{ height: p[metric] === null ? '2px' : `${Math.max(1, p[metric]! / max * 100)}%` }}/></button>)}</div><div className="video-chart-labels"><span>{data.trend[0]?.day.slice(5)}</span><span>{data.trend[Math.floor(data.trend.length / 2)]?.day.slice(5)}</span><span>{data.today.slice(5)}</span></div></div></div><footer><strong>{chartDay} <span>{num(point?.[metric] ?? null)}</span></strong><span>{point?.coverage ?? 0}/{point?.accounts ?? 0} 账号有记录 · 今日为阶段快照</span></footer></section>
 <div className="video-bottom-grid">{tasksPanel()}<section className="video-panel video-accounts-summary"><header><div><h2>账号表现</h2><p>今日快照 · 播放量口径</p></div><Link href="/short-video?tab=accounts">管理账号</Link></header>{active.filter(a => !account || a.id === account).map(a => { const r = data.records.find(x => x.accountId === a.id && x.day === data.today); return <button key={a.id} onClick={() => setAccount(a.id)}><span><b>{a.handle}</b><small>{platformLabel(a.platform)} · {a.externalId}</small></span><strong>{num(r?.plays ?? null)}</strong><span className={(r?.netFollowers ?? 0) < 0 ? 'video-loss' : 'video-gain'}>{r ? '净增 ' + num(r.netFollowers) : '未录入'}</span></button>; })}{!active.length ? <div className="video-empty"><strong>先登记你的第一个抖音账号</strong><p>只有真实录入的数据会显示在大盘中。</p>{privileged ? <button onClick={() => open('account')}>添加账号</button> : null}</div> : null}</section></div>{lifecycle}</>;
    return <section className="video-center" aria-busy={loading}>
 <header className="video-main-header"><div><span className="video-eyebrow">CONTENT OS · DATA CENTER</span><h1>{mode === 'tasks' ? '今日任务' : mode === 'task' ? '任务执行' : '短视频数据中台'}</h1><p>{mode === 'home' ? '一眼看清全局，一键直达任务。' : '多平台 · 账号矩阵、内容进度与每日行动。'}</p></div><div className="video-header-actions">{mode === 'home' ? <><Link href="/short-video">完整大盘 <ArrowUpRight size={15}/></Link><Link href="/dashboard">打开工作台</Link></> : <Link href="/home">返回首页</Link>}<details className="video-alerts"><summary aria-label={`预警 ${data.alerts.length} 条`}><Bell size={18}/>{data.alerts.length ? <b>{data.alerts.length}</b> : null}<ChevronDown size={13}/></summary><section><strong>运营预警 · {data.alerts.length} 条</strong>{data.alerts.map(a => <Link href={a.href} key={a.id}><b>{a.title}</b><span>{a.detail}</span></Link>)}{!data.alerts.length ? <p>暂无符合规则的预警。未录入数据不代表经营正常。</p> : null}</section></details></div></header>
 <div className="video-toolbar"><label className="video-filter-pill"><span>平台</span><select aria-label="运营平台筛选" value={platform} onChange={e => { setPlatform(e.target.value); setAccount(''); }}><option value="">全部平台</option>{Object.entries(platforms).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><VideoDateFilter className="video-filter-pill" label="趋势时间范围" days={days} range={range} onChange={(next, dates) => { setDays(next); setRange(dates); setSelectedDay(''); }} /><label className="video-filter-pill"><span>账号</span><select aria-label="数据账号筛选" value={account} onChange={e => setAccount(e.target.value)}><option value="">全部有效账号</option>{active.map(a => <option value={a.id} key={a.id}>{a.handle}</option>)}</select></label><div className="video-toolbar-actions">{writable ? <><button disabled={!active.length || busy} onClick={() => open('import')}><Upload size={14}/>导入 CSV</button><button className="video-primary" disabled={!active.length || busy} onClick={() => open('metric')}><Plus size={14}/>录入数据</button></> : null}<button disabled={!data.records.length} onClick={exportData}><Download size={14}/>导出</button></div></div>
 <div className="video-updated"><span>数据截至 <strong>{date(data.observedAt)}</strong> · 北京时间 · 手动/CSV 快照{data.coverage.recorded < data.coverage.total ? ' · 今日数据不完整' : ''}</span><button aria-label="刷新数据" disabled={loading || busy} onClick={() => void load()}><RefreshCw size={13} className={loading ? 'is-loading' : ''}/>刷新</button></div>
 {message ? <p role="status" className="video-feedback">{message}</p> : null}{error ? <p role="alert" className="video-feedback is-error">{error}</p> : null}
 {mode === 'home' ? overview : mode === 'tasks' ? tasksPanel(true) : mode === 'task' ? (selected ? <section className="video-panel video-execution"><header><div><span className="video-kind">{kinds[selected.kind as keyof typeof kinds]}</span><h2>{selected.title}</h2><p>{selected.account.handle} · 截止 {date(selected.dueAt)} · {states[selected.state as keyof typeof states]}</p></div><Link href="/short-video/tasks">返回任务列表</Link></header><p>关联内容：{selected.content?.title ?? '未关联内容'}</p>{selected.content?.projectId && data.projects.some(p => p.id === selected.content!.projectId) ? <Link className="video-primary" href={'/dashboard?project=' + selected.content.projectId}>打开关联创作项目 <ArrowUpRight size={15}/></Link> : null}{selected.account.platform === 'DOUYIN' ? <a className="video-platform-link" href={selected.kind === 'PUBLISH' ? 'https://creator.douyin.com/creator-micro/content/upload' : 'https://creator.douyin.com/'} target="_blank" rel="noopener noreferrer">{selected.kind === 'PUBLISH' ? '打开抖音发布页' : '打开抖音创作者平台'} <ArrowUpRight size={15}/></a> : null}<p className="video-muted">平台操作在创作者平台完成；这里的完成勾选仅记录任务进度。</p><label>执行记录<textarea aria-label="执行记录" rows={5} maxLength={4000} value={note} disabled={!selected.editable} onChange={e => setNote(e.target.value)}/></label><div className="video-execution-actions">{selected.editable ? <><button disabled={busy} onClick={() => void mutate({ action: 'task.update', id: selected.id, revision: selected.revision, note }, true)}>保存执行记录</button><button className="video-primary" disabled={busy} onClick={() => void mutate({ action: 'task.update', id: selected.id, revision: selected.revision, status: selected.status === 'DONE' ? 'TODO' : 'DONE' }, true)}>{selected.status === 'DONE' ? '重新打开' : '标记完成'}</button>{selected.status !== 'DONE' ? <><button disabled={busy} onClick={() => void mutate({ action: 'task.update', id: selected.id, revision: selected.revision, status: 'IN_PROGRESS' }, true)}>开始执行</button><button disabled={busy} onClick={() => open('delay', selected)}>延期</button></> : null}</> : null}</div></section> : <p>任务不存在或无权访问。</p>) : <><nav className="video-tabs" aria-label="数据中台页面">{[['overview', '流量概览'], ['accounts', '账号矩阵'], ['content', '内容台账'], ['records', '数据记录']].map(([k, l]) => <button key={k} aria-selected={tab === k} onClick={() => setTab(k!)}>{l}</button>)}<Link href="/short-video/tasks">今日任务 <ArrowUpRight size={13}/></Link></nav>{tab === 'overview' ? overview : tab === 'accounts' ? <section className="video-panel"><header><div><h2>平台账号矩阵</h2><p>账号编号用于匹配 CSV；归档只退出统计，不删除历史。</p></div>{privileged ? <button className="video-primary" onClick={() => open('account')}><Plus size={14}/>添加账号</button> : null}</header>{data.accounts.filter(a => !platform || a.platform === platform).map(a => <div key={a.id} className="video-account-row"><div><strong>{a.handle}</strong><small>{platformLabel(a.platform)} · {a.externalId}</small></div><span>{a.archivedAt ? '已归档' : '有效账号'}</span>{privileged ? <button disabled={busy} onClick={() => void mutate({ action: 'account.archive', id: a.id, revision: a.revision, archived: !a.archivedAt }, true)}>{a.archivedAt ? '恢复' : '归档'}</button> : null}</div>)}{!data.accounts.length ? <div className="video-empty">尚未登记账号，请添加第一个平台账号。</div> : null}</section> : tab === 'content' ? <section className="video-panel"><header><div><h2>内容生命周期台账</h2><p>记录选题到发布的运营进度，不替代创作项目中的审核。</p></div>{writable ? <button className="video-primary" disabled={!active.length} onClick={() => open('content')}><Plus size={14}/>登记内容</button> : null}</header>{lifecycle}<label className="video-muted">内容阶段筛选 <select aria-label="内容阶段筛选" value={stageFilter} onChange={e => setStageFilter(e.target.value)}><option value="all">全部阶段</option>{Object.entries(stages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><div className="video-content-grid">{data.contents.filter(c => stageFilter === 'all' || c.stage === stageFilter).map(c => <article key={c.id}><span>{c.account.handle} · {platformLabel(c.account.platform)}</span><h3>{c.title}</h3>{writable ? <select aria-label={'内容阶段：' + c.title} value={c.stage} disabled={busy} onChange={e => void mutate({ action: 'content.stage', id: c.id, revision: c.revision, stage: e.target.value as keyof typeof stages }, true)}>{Object.entries(stages).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <span>{stages[c.stage as keyof typeof stages]}</span>}{c.projectId && data.projects.some(p => p.id === c.projectId) ? <Link href={'/dashboard?project=' + c.projectId}>打开创作项目</Link> : null}</article>)}</div>{!data.contents.length ? <div className="video-empty">尚无内容记录，可关联已有创作项目。</div> : null}</section> : <section className="video-panel video-records"><header><div><h2>日数据记录</h2><p>同一账号同一日期仅保存一份快照，重录与导入会更新；历史修改写入操作记录。</p></div></header><div className="video-table-wrap"><table><thead><tr>{['日期', '账号', '播放', '曝光', '互动', '净增粉丝', '数据截至', '来源', '版本'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{pageRecords.map(r => <tr key={r.id}><td>{r.day}{r.isFinal ? ' · 完整日' : ''}</td><td>{data.accounts.find(a => a.id === r.accountId)?.handle}</td><td>{num(r.plays)}</td><td>{num(r.exposures)}</td><td>{num(r.likes + r.comments + r.shares + r.saves)}</td><td>{num(r.netFollowers)}</td><td>{date(r.observedAt)}</td><td>{r.source === 'CSV' ? 'CSV' : '手动'}</td><td>V{r.revision}</td></tr>)}</tbody></table></div><nav className="video-pagination" aria-label="数据记录分页"><span>共 {records.length} 条 · 每页20条 · 第 {page}/{pageCount} 页</span><button disabled={page <= 1 || loading} onClick={() => setRecordPage(page - 1)}>上一页</button><button disabled={page >= pageCount || loading} onClick={() => setRecordPage(page + 1)}>下一页</button></nav>{!data.records.length ? <div className="video-empty">当前范围没有快照。</div> : null}</section>}</>}
 {dialog ? <div className="video-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy)
            setDialog(null); }}><section className="video-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="video-dialog-title"><header><h2 id="video-dialog-title">{{ account: '添加平台账号', metric: '录入日数据', import: '导入 CSV', content: '登记内容', task: '添加任务', delay: '延期任务' }[dialog]}</h2><button aria-label="关闭数据弹窗" disabled={busy} onClick={() => setDialog(null)}><X size={18}/></button></header>{error ? <p role="alert" className="video-feedback is-error">{error}</p> : null}{dialog === 'import' ? <><p>先下载模板，填写已登记账号的编号。曝光量可留空，其他数值必须为整数；数据截至需含时区（如 +08:00）。</p><button onClick={() => download(csvHeaders.join(',') + '\r\n', '平台日数据模板.csv')}><Download size={14}/>下载 CSV 模板</button><label>导入平台<select aria-label="导入平台" value={importPlatform} disabled={busy} onChange={e => { setImportPlatform(e.target.value as keyof typeof platforms); setPreview(null); }}>{Object.entries(platforms).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="video-file">选择 UTF-8 CSV<input aria-label="选择 CSV 文件" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f)
                void importFile(f); e.target.value = ''; }}/></label>{preview ? <div className="video-import-preview"><strong>预览 {preview.preview.length} 行：新增 {preview.creates}，更新 {preview.updates}</strong><p>更新将替换该账号当天的全部指标，整批验证通过后一次保存。</p><div className="video-table-wrap"><table><thead><tr><th>日期</th><th>账号</th><th>播放</th><th>操作</th></tr></thead><tbody>{preview.preview.slice(0, 20).map(r => <tr key={r.accountId + r.day}><td>{r.day}</td><td>{data.accounts.find(a => a.id === r.accountId)?.handle}</td><td>{num(r.plays)}</td><td>{r.revision ? '更新' : '新增'}</td></tr>)}</tbody></table></div><button className="video-primary" disabled={busy} onClick={() => void mutate({ action: 'metrics.save', source: 'CSV', rows: preview.preview })}>确认导入 {preview.preview.length} 行</button></div> : null}</> : <form onSubmit={submit}><fieldset disabled={busy || lookupBusy && dialog === 'metric'}>
 {dialog === 'account' ? <><label>账号平台<select name="platform" aria-label="账号平台" defaultValue={platform || 'DOUYIN'}>{Object.entries(platforms).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><Field name="handle" label="账号名称"/><Field name="externalId" label="账号编号（平台账号或内部编号）"/><p className="video-muted">登记不会自动登录或绑定平台，CSV 用此编号定位账号。</p></> : null}
 {dialog === 'metric' ? <><label>数据账号<select aria-label="数据账号" required value={metricAccount} onChange={e => setMetricAccount(e.target.value)}>{active.map(a => <option key={a.id} value={a.id}>{a.handle}</option>)}</select></label><label>数据日期<input aria-label="数据日期" required type="date" max={data.today} value={metricDay} onChange={e => setMetricDay(e.target.value)}/></label><div key={metricAccount + metricDay + (metricRow?.revision ?? 0)} className="video-form-grid">{[['播放量', 'plays'], ['曝光量', 'exposures'], ['点赞', 'likes'], ['评论', 'comments'], ['分享', 'shares'], ['收藏', 'saves'], ['净增粉丝', 'netFollowers'], ['负面评论', 'negativeComments']].map(([label, key]) => <Field key={key} name={label!} label={label! + (key === 'exposures' ? '（可选）' : '')} type="number" required={key !== 'exposures'} min={key === 'netFollowers' ? undefined : 0} defaultValue={metricRow?.[key as keyof typeof metricRow] as number | undefined ?? (key === 'exposures' ? '' : 0)}/>)}<Field name="observedAt" label="数据截至（北京时间）" type="datetime-local" defaultValue={localInput(metricRow?.observedAt ?? new Date().toISOString())}/><label className="video-check"><input name="limited" type="checkbox" defaultChecked={metricRow?.limited}/>已人工确认限流</label><label className="video-check"><input name="isFinal" type="checkbox" defaultChecked={metricRow?.isFinal} disabled={metricDay === data.today}/>完整日数据（仅历史日期）</label></div><p className="video-muted">{metricRow ? `将更新 V${metricRow.revision}；不是追加，指标不会重复累加。` : '今日快照不是实时采集，已录入0与未录入会分开展示。'}</p></> : null}
 {dialog === 'content' ? <>{accountSelect()}<Field name="title" label="内容标题"/><label>关联创作项目<select name="projectId" aria-label="关联创作项目"><option value="">不关联</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>内容阶段<select name="stage" aria-label="内容阶段">{Object.entries(stages).filter(([k]) => k !== 'ARCHIVED').map(([k, l]) => <option value={k} key={k}>{l}</option>)}</select></label></> : null}
 {dialog === 'task' ? <>{accountSelect('关联账号', 'accountId', true)}<label>任务类型<select aria-label="任务类型" name="kind">{Object.entries(kinds).map(([k, l]) => <option value={k} key={k}>{l}</option>)}</select></label><Field name="title" label="任务标题"/><label>关联内容<select aria-label="关联内容" name="contentId"><option value="">不关联内容</option>{data.contents.filter(c => c.accountId === taskAccount && c.stage !== 'ARCHIVED').map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><label>负责人<select aria-label="负责人" name="assigneeId" defaultValue={data.userId}>{data.members.filter(m => privileged || m.id === data.userId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><Field name="dueAt" label="截止时间（北京时间）" type="datetime-local" defaultValue={localInput(new Date(Date.now() + 3600000).toISOString())}/><label>任务说明<textarea name="note" rows={3} maxLength={4000}/></label></> : null}
 {dialog === 'delay' ? <><p>{targetTask?.title}</p><Field name="dueAt" label="新的截止时间（北京时间）" type="datetime-local" defaultValue={localInput(new Date(Date.now() + 86400000).toISOString())}/></> : null}
 <footer><button type="button" onClick={() => setDialog(null)}>取消</button><button className="video-primary" type="submit">{busy ? '保存中…' : '保存'}</button></footer></fieldset></form>}</section></div> : null}
 </section>;
}

