'use client';
import { platforms } from '@/server/video-operations/policy';
import { VideoDateFilter, type VideoDateRange } from './video-date-filter';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { ConsoleCard, ConsoleCardTitle, ConsoleKpi } from '@content-center/ui';
import { ArrowUpRight, ChevronRight, Compass, Download, RefreshCw, TrendingDown, TrendingUp, X } from 'lucide-react';
import { createVideoDemo, fromVideoRecords, platformLabel, rankWorks, selectVideoAnalytics, type AnalyticsDataset, type RankedWork, type RealVideoData, type VideoAnalytics } from '@/lib/video-analytics';
import { csvCell } from '@/server/video-operations/policy';
import './video-analytics-workspace.css';

const VideoCenter = dynamic(() => import('./video-center').then(module => module.VideoCenter), {
  ssr: false,
  loading: () => <p className="va-notice" role="status">正在加载运营管理…</p>,
});

const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('zh-CN');
const compact = (value: number | null | undefined) => value == null ? '—' : Math.abs(value) >= 10000 ? `${(value / 10000).toFixed(1)}万` : number(value);
type Tab = 'overview' | 'works' | 'audience' | 'review' | 'accounts' | 'content' | 'records';
const tabs: [Tab, string][] = [['overview', '流量概览'], ['works', '作品表现'], ['audience', '粉丝画像'], ['review', 'AI复盘'], ['accounts', '账号矩阵'], ['content', '内容台账'], ['records', '数据记录']];
const isTab = (value: string): value is Tab => tabs.some(([key]) => key === value);

function positionReviewMascot(image: HTMLImageElement | null) {
  const card = image?.parentElement;
  if (!image || !card) return;
  const resize = () => {
    const bounds = card.getBoundingClientRect();
    // After mirroring, the hands sit 16% from the image's left edge.
    const outsideSpace = Math.max(0, window.innerWidth - bounds.right - 8);
    image.style.width = `${Math.max(0, Math.min(bounds.height - 24, outsideSpace / .84))}px`;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(card);
  window.addEventListener('resize', resize);
  resize();
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', resize);
  };
}

// Each segment ends at a missing day; decorative charts never interpolate gaps.
function KpiTrend({ values, color, area = false }: { values: (number | null)[]; color: string; area?: boolean }) {
  const id = useId();
  const present = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!present.length) return null;
  const min = Math.min(0, ...present), max = Math.max(1, ...present);
  const segments: Array<Array<[number, number]>> = [];
  let segment: Array<[number, number]> = [];
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push([index / (values.length - 1 || 1) * 300, 66 - (value - min) / (max - min) * 52]);
  });
  if (segment.length) segments.push(segment);
  return <svg viewBox="0 0 300 80" preserveAspectRatio="none" focusable="false">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".4" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    {segments.map((points, index) => {
      const path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
      return <g key={index}>{area && points.length > 1 ? <path d={`${path} L${points.at(-1)![0]},80 L${points[0]![0]},80 Z`} fill={`url(#${id})`} /> : null}<path d={path} stroke={color} strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />{points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill={color} />)}</g>;
    })}
  </svg>;
}

function Distribution({ title, values }: { title: string; values: Record<string, number> }) {
  return <section className="va-distribution"><h3>{title}</h3>{Object.entries(values).map(([label, value]) => <div className="va-distribution-row" key={label}><span>{label}</span><div><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div><b>{value.toFixed(1)}%</b></div>)}</section>;
}

function AccountDistribution({ view }: { view: VideoAnalytics }) {
  const rows = view.stats.filter(account => account.metrics != null && account.metrics.plays > 0);
  const total = rows.reduce((sum, account) => sum + account.metrics!.plays, 0);
  if (!total) return null;
  let offset = 0;
  return <div className="va-account-distribution"><svg viewBox="0 0 180 180" role="img" aria-label={`已录入账号周期播放构成，总计 ${number(total)}；各账号数值见下方列表`}>
    <circle cx="90" cy="90" r="68" fill="none" stroke="var(--surface-elevated)" strokeWidth="22" />
    {rows.map((account, index) => {
      const share = account.metrics!.plays / total * 100, start = offset;
      offset += share;
      return <circle key={account.id} cx="90" cy="90" r="68" pathLength="100" fill="none" stroke={`var(--data-${index % 3 + 1})`} strokeWidth="22" strokeDasharray={`${Math.max(0, share - .7)} ${100 - Math.max(0, share - .7)}`} strokeDashoffset={-start} transform="rotate(-90 90 90)" />;
    })}
    <text x="90" y="88" textAnchor="middle" className="va-donut-value">{compact(total)}</text><text x="90" y="108" textAnchor="middle" className="va-donut-label">周期播放量</text>
  </svg><p className="va-note">已录入播放构成 · 未录入账号不计入</p></div>;
}

function AudiencePanel({ view, full = false, open }: { view: VideoAnalytics; full?: boolean; open?: () => void }) {
  return <ConsoleCard className="va-panel va-audience" aria-label="粉丝画像"><header><div><span className="va-kicker">AUDIENCE SIGNALS</span><ConsoleCardTitle>粉丝画像</ConsoleCardTitle></div>{open ? <button onClick={open}>完整画像 <ChevronRight size={15} /></button> : null}</header>{view.profile ? <><div className="va-profile-head"><span>账号粉丝数之和 · 未去重</span><strong>{compact(view.profile.followers)}</strong><small>画像为当前观察快照，与周期净增分开统计</small></div><Distribution title="地域分布" values={view.profile.cities} /><Distribution title="年龄分布" values={view.profile.ages} />{full ? <Distribution title="性别分布" values={view.profile.gender} /> : null}<section className="va-hours"><h3>活跃时段 <small>本地时间 · 0–23时</small></h3><div>{view.profile.hours.map((value, hour) => <span key={hour} tabIndex={0} title={`${hour}时 活跃指数 ${Math.round(value)}`} aria-label={`${hour}时 活跃指数 ${Math.round(value)}`} style={{ opacity: .2 + value / 130 }} />)}</div><footer><span>00:00</span><span>12:00</span><span>23:00</span></footer><p>19–22时较活跃，可作为发布时间的测试方向。</p></section><p className="va-note">多账号画像按粉丝数加权；年龄不代表家长身份或报名意向。</p></> : <div className="va-empty"><Compass size={28} /><h3>尚未接入粉丝画像</h3><p>平台未提供时保留空态，不以创作者画像或账号净增数替代。</p></div>}</ConsoleCard>;
}

function Trend({ view }: { view: VideoAnalytics }) {
  const [metric, setMetric] = useState<'plays' | 'interactions' | 'netFollowers'>('plays');
  const [selectedDay, setSelectedDay] = useState('');
  const seriesColor = `var(--data-${metric === 'plays' ? 1 : metric === 'interactions' ? 2 : 3})`;
  const values = view.trend.map(p => p[metric]);
  const max = Math.max(1, ...values.flatMap(v => v == null ? [] : [v]));
  const min = Math.min(0, ...values.flatMap(v => v == null ? [] : [v]));
  let line = ''; const paths: string[] = [];
  values.forEach((value, i) => {
    if (value == null) { if (line) paths.push(line); line = ''; return; }
    line += `${line ? ' L' : 'M'}${i / (values.length - 1 || 1) * 900},${190 - (value - min) / (max - min) * 155}`;
  });
  if (line) paths.push(line);
  const point = view.trend.find(p => p.day === selectedDay) ?? view.trend.at(-1);
  return <ConsoleCard className="va-panel va-trend"><header><div><span className="va-kicker">PERFORMANCE TRAJECTORY</span><ConsoleCardTitle>内容流量趋势</ConsoleCardTitle></div><div className="va-segment">{([['plays', '播放'], ['interactions', '互动'], ['netFollowers', '净增粉丝']] as const).map(([key, label]) => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}</div></header><div className="va-chart"><div className="va-chart-axis"><span>{compact(max)}</span><span>{compact(min)}</span></div><svg viewBox="0 0 900 220" preserveAspectRatio="none" role="img" aria-label="所选周期趋势，缺失数据以空档显示">{[35, 85, 135, 190].map(y => <line key={y} x1="0" x2="900" y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 6" />)}{paths.map((d, i) => <g key={i}><path d={d} fill="none" className="va-series-line" stroke={seriesColor} strokeWidth="3" vectorEffect="non-scaling-stroke" /></g>)}</svg><div className="va-chart-hit" style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}>{view.trend.map(p => <button key={p.day} aria-label={`${p.day} ${metric === 'plays' ? '播放' : metric === 'interactions' ? '互动' : '净增粉丝'} ${number(p[metric])}`} aria-pressed={point?.day === p.day} onClick={() => setSelectedDay(p.day)} onFocus={() => setSelectedDay(p.day)}><span /></button>)}</div>{!view.metrics ? <div className="va-chart-empty">当前范围暂无数据 · 未录入不等于零</div> : null}</div><div className="va-chart-dates"><span>{view.start.slice(5)}</span><span>{view.end.slice(5)}</span></div><footer><b>{point?.day} <strong>{number(point?.[metric])}</strong></b><span>{point?.coverage ?? 0}/{view.accounts.length} 账号有记录 · 缺失日期保留空档</span></footer></ConsoleCard>;
}

function WorkList({ works, open, small = false }: { works: RankedWork[]; open: (id: string) => void; small?: boolean }) {
  return works.length ? <div className="va-table-scroll"><table className="va-work-table"><thead><tr><th>作品 / 账号</th><th>播放</th><th>点赞</th><th>收藏</th>{!small ? <><th>评论</th><th>分享</th><th>新增关注</th></> : null}</tr></thead><tbody>{works.map((work, index) => <tr key={work.id}><td><button className="va-work-title" onClick={() => open(work.id)}><span className={`va-cover va-cover-${index % 4}`}><small>{String(index + 1).padStart(2, '0')}</small><b>{work.topic.slice(0, 2)}</b></span><span><strong>{work.title}</strong><small>{platformLabel(work.platform)} · {work.account}</small></span></button></td><td>{compact(work.plays)}</td><td>{number(work.likes)}</td><td className="va-highlight">{number(work.saves)}</td>{!small ? <><td>{number(work.comments)}</td><td>{number(work.shares)}</td><td>{work.netFollowers >= 0 ? '+' : ''}{number(work.netFollowers)}</td></> : null}</tr>)}</tbody></table></div> : <div className="va-empty"><h3>暂无作品级表现数据</h3><p>内容台账已有阶段记录，但账号日总量不能直接分摊为作品表现。</p></div>;
}

export function VideoAnalyticsWorkspace({ initialAccount = '', initialTab = 'overview', initialStage = 'all', initialDemo = false, showDataSource = true }: { initialAccount?: string; initialTab?: string; initialStage?: string; initialDemo?: boolean; showDataSource?: boolean }) {
  const [demo, setDemo] = useState(initialDemo), [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'overview');
  const [platform, setPlatform] = useState(''), [accountId, setAccountId] = useState(initialDemo ? '' : initialAccount), [days, setDays] = useState(30);
  const [range, setRange] = useState<VideoDateRange>();
  const [real, setReal] = useState<AnalyticsDataset | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [simulation, setSimulation] = useState(0);
  const [rank, setRank] = useState<'plays' | 'interactions' | 'netFollowers'>('plays'), [selectedWork, setSelectedWork] = useState(''), [notice, setNotice] = useState('');
  const detailRef = useRef<HTMLDialogElement>(null), returnFocus = useRef<HTMLElement | null>(null);
  const demoData = useMemo(() => createVideoDemo(undefined, simulation), [simulation]);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const query = new URLSearchParams({ days: String(days), ...(range ?? {}) });
    fetch(`/api/video-data?${query}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw Error(data.message || '数据读取失败');
      if (!Array.isArray(data.accounts) || !Array.isArray(data.records)) throw Error('数据格式不完整');
      if (!controller.signal.aborted) setReal(fromVideoRecords(data as RealVideoData));
    }).catch(e => { if (!controller.signal.aborted) { setReal(null); setError(e.message || '数据读取失败'); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [demo, days, refresh, range]);
  const data = demo ? demoData : real;
  const view = useMemo(() => data ? selectVideoAnalytics(data, { platform, accountId, days, ...range }) : null, [data, platform, accountId, days, range]);
  const work = view?.works.find(w => w.id === selectedWork);
  useEffect(() => {
    const dialog = detailRef.current;
    if (work && dialog && !dialog.open) dialog.showModal();
    else if (!work && dialog?.open) dialog.close();
  }, [work]);
  const openWork = (id: string) => { returnFocus.current = document.activeElement as HTMLElement; setSelectedWork(id); };
  const closeWork = () => { setSelectedWork(''); returnFocus.current?.focus(); };
  const switchMode = () => { setDemo(!demo); setAccountId(''); setPlatform(''); setSelectedWork(''); setNotice(''); setTab('overview'); };
  const changeScope = (key: 'platform' | 'account', value: string) => { if (key === 'platform') { setPlatform(value); setAccountId(''); } else setAccountId(value); setSelectedWork(''); setNotice(''); };
  const management = ['accounts', 'content', 'records'].includes(tab);
  const exportReport = () => {
    if (!view || !data) return;
    const rows = [[...(showDataSource ? ['数据来源'] : []), '平台', '账号', '周期开始', '周期结束', '作品', '播放', '点赞', '评论', '收藏', '分享', '新增关注'], ...view.works.map(w => [...(showDataSource ? [demo ? '演示数据' : '真实记录'] : []), platformLabel(w.platform), w.account, view.start, view.end, w.title, w.plays, w.likes, w.comments, w.saves, w.shares, w.netFollowers])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `作品表现-${showDataSource ? `${demo ? '演示' : '真实'}-` : ''}${view.end}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const sendToProject = () => {
    if (!view) return;
    const text = `[${showDataSource && demo ? '演示数据，不能作为真实经营依据' : '运营数据复盘'}] ${view.start} 至 ${view.end}\n${view.accounts.map(a => `${platformLabel(a.platform)} · ${a.handle}`).join('；')}\n${view.insight.title}\n依据：${view.insight.evidence}\n推测：${view.insight.hypothesis}\n建议：${view.insight.suggestion}`;
    void navigator.clipboard.writeText(text).then(() => setNotice('复盘已复制。打开已有项目工作台后粘贴，继续整理选题或保存成果。')).catch(() => setNotice('复制失败，请从下方复盘正文选择并复制。'));
  };
  const reviewPanel = view ? <ConsoleCard className="va-panel va-review"><header><div><span className="va-kicker">AI NAVIGATOR</span><ConsoleCardTitle>AI领航 · {showDataSource && demo ? '演示分析' : '数据摘要'}</ConsoleCardTitle></div></header><h3>{view.insight.title}</h3><p>{view.insight.evidence}</p><div className="va-reason"><span>可能原因 · 待验证</span><p>{view.insight.hypothesis}</p></div><div className="va-reason"><span>下一步建议</span><p>{view.insight.suggestion}</p></div><footer>{view.insight.workId ? <button onClick={() => openWork(view.insight.workId!)}>查看作品依据 <ArrowUpRight size={14} /></button> : <button onClick={() => setTab('records')}>查看数据记录</button>}<button onClick={sendToProject}>复制复盘</button><Link href="/dashboard">进入工作台 <ArrowUpRight size={14} /></Link></footer>{showDataSource ? <p className="va-note">{demo ? '预置样例依据当前筛选重新计算，未调用真实模型。' : '基于已录入数据的规则摘要，未调用真实模型。'}</p> : null}<Image ref={positionReviewMascot} className="va-review-mascot" src="/brand/ai-review-robot.png" alt="从卡片右侧探头的 AI 领航机器人" width={1280} height={1280} sizes="(max-width: 600px) 128px, 512px" /></ConsoleCard> : null;
  const ranked = view ? rankWorks(view.works, rank) : [];
  return <section data-surface="console-dark" className="va-workspace" aria-busy={loading}>
    <header className="va-page-header"><div><span className="va-kicker">XIN WORLD / OPERATIONS INTELLIGENCE</span><h1>运营指挥台{showDataSource ? <span className="va-status">{demo ? '演示模式' : '真实记录'}</span> : null}</h1><p>看清内容表现，让每一步运营都有依据。</p></div><div>{showDataSource ? <button onClick={switchMode}>{demo ? '返回真实数据' : '体验演示数据'}</button> : null}<Link href="/short-video/tasks">今日任务 <ArrowUpRight size={14} /></Link></div></header>
    {!management ? <div className="va-filter-bar"><label>平台<select aria-label="平台筛选" value={platform} disabled={management} onChange={e => changeScope('platform', e.target.value)}><option value="">全部平台</option>{Object.keys(platforms).map(p => <option value={p} key={p}>{platformLabel(p)}</option>)}</select></label><label>账号<select aria-label="账号筛选" value={accountId} disabled={management} onChange={e => changeScope('account', e.target.value)}><option value="">全部有效账号</option>{data?.accounts.filter(a => !platform || a.platform === platform).map(a => <option key={a.id} value={a.id}>{a.handle}</option>)}</select></label><VideoDateFilter label="时间范围" days={days} range={range} disabled={management} onChange={(next, dates) => { setDays(next); setRange(dates); setSelectedWork(''); }} /><div className="va-filter-actions"><button disabled={loading || management} onClick={() => demo ? setSimulation(n => n + 1) : setRefresh(n => n + 1)}><RefreshCw size={14} />{showDataSource && demo ? '模拟更新' : '刷新记录'}</button><button disabled={!view?.works.length || management} onClick={exportReport}><Download size={14} />导出作品</button></div></div> : null}
    {showDataSource ? <div className="va-source-line"><span>{management ? '真实运营管理 · 使用现有业务流程' : demo ? '演示数据 · 与真实账号记录隔离 · 平台尚未授权接入' : '手工 / CSV 快照 · 平台尚未授权接入'}{!management && view ? ` · ${view.start} — ${view.end}` : ''}</span><span>{management ? '管理页内筛选独立生效' : data?.updatedAt ? `观察时间 ${data.updatedAt.replace('T', ' ').slice(0, 16)}${demo ? ` · 模拟更新 ${simulation} 次` : ''}` : '尚无数据更新时间'}</span></div> : null}
    <nav className="va-tabs" aria-label="数据中台页面">{tabs.map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => { setTab(key); setSelectedWork(''); setNotice(''); }}>{label}</button>)}</nav>
    {notice ? <p className="va-notice" role="status">{notice}</p> : null}
    {management ? <>{showDataSource ? <p className="va-notice">此处管理真实运营记录。演示账号不会写入数据库；请使用下方管理页的账号和时间筛选。</p> : null}<VideoCenter key={tab} mode="data" initialTab={tab} initialAccount={demo ? '' : accountId} initialStage={initialStage} initialPlatform={demo ? '' : platform} /></> : <>
    {error && !demo ? <div className="va-error" role="alert">{error}<button onClick={() => setRefresh(n => n + 1)}>重试</button>{showDataSource ? <button onClick={switchMode}>进入演示模式</button> : null}</div> : null}
    {!view ? <div className="va-empty"><ConsoleCardTitle>{loading ? '正在读取运营记录…' : '暂无运营数据'}</ConsoleCardTitle>{showDataSource ? <p>真实数据读取失败时，不会自动切换成模拟结果。</p> : null}</div> : <>
    {tab === 'overview' ? <div className="va-cockpit"><div className="va-top-grid"><div className="va-metrics">
      <ConsoleKpi title="周期播放量" value={view.metrics?.plays} description={view.growth == null ? '基准覆盖不足，暂无周期对比' : <span className={`va-delta ${view.growth >= 0 ? 'is-positive' : 'is-negative'}`}>{view.growth >= 0 ? <TrendingUp size={16} aria-hidden="true" /> : <TrendingDown size={16} aria-hidden="true" />}{Math.abs(view.growth).toFixed(1)}% 较前一等长周期</span>}><KpiTrend values={view.trend.map(day => day.plays)} color="var(--data-1)" area /></ConsoleKpi>
      <ConsoleKpi title="周期互动量" value={view.metrics?.interactions} description="点赞 + 评论 + 收藏 + 分享"><KpiTrend values={view.trend.map(day => day.interactions)} color="var(--data-2)" /></ConsoleKpi>
      <ConsoleKpi title="周期净增粉丝" value={view.metrics?.netFollowers} description="新增关注减去取关"><KpiTrend values={view.trend.map(day => day.netFollowers)} color="var(--data-3)" area /></ConsoleKpi>
      <ConsoleKpi className="va-kpi-coverage" title="账号日记录覆盖率" value={view.coverage.expected ? Number((view.coverage.actual / view.coverage.expected * 100).toFixed(1)) : null} aria-label={`账号日记录覆盖率：${view.coverage.actual}/${view.coverage.expected}`} description="已录入账号日 / 应有账号日">{view.coverage.expected ? <div className="va-coverage-track"><i style={{ width: `${Math.min(100, view.coverage.actual / view.coverage.expected * 100)}%` }} /></div> : null}</ConsoleKpi>
      <p className="va-note">账号日记录覆盖 {view.coverage.actual}/{view.coverage.expected} · 当前日可能尚未完整</p></div>{reviewPanel}</div><div className="va-main-grid"><Trend view={view} /><AudiencePanel view={view} open={() => setTab('audience')} /></div><div className="va-bottom-grid"><ConsoleCard className="va-panel va-works-panel"><header><div><span className="va-kicker">TOP PERFORMING CONTENT</span><ConsoleCardTitle>表现突出的作品</ConsoleCardTitle></div><button onClick={() => setTab('works')}>全部作品 <ChevronRight size={15} /></button></header><WorkList works={rankWorks(view.works, 'plays').slice(0, 4)} open={openWork} small /><p className="va-note">所选周期新增指标 · 多平台展示，按平台筛选后比较更准确。</p></ConsoleCard><ConsoleCard className="va-panel va-account-panel"><header><div><span className="va-kicker">ACCOUNT MATRIX</span><ConsoleCardTitle>账号表现</ConsoleCardTitle></div><button onClick={() => setTab('accounts')}>管理账号</button></header><AccountDistribution view={view} /><div className="va-account-list">{view.stats.map(a => <button className="va-account" key={a.id} onClick={() => changeScope('account', a.id)}><span><b>{a.handle}</b><small>{platformLabel(a.platform)}</small></span><span><strong>{compact(a.metrics?.plays)}</strong><small>播放 · 净增 {number(a.metrics?.netFollowers)}</small></span></button>)}{!view.stats.length ? <p className="va-note">尚无有效账号，请到账号矩阵登记。</p> : null}</div></ConsoleCard></div></div> : tab === 'works' ? <ConsoleCard className="va-panel"><header><div><span className="va-kicker">CONTENT PERFORMANCE</span><ConsoleCardTitle>作品表现</ConsoleCardTitle><p className="va-note">周期新增指标，不能用账号日总量替代。</p></div><div className="va-segment">{([['plays', '播放榜'], ['interactions', '互动榜'], ['netFollowers', '涨粉榜']] as const).map(([key, label]) => <button key={key} aria-pressed={rank === key} onClick={() => setRank(key)}>{label}</button>)}</div></header><WorkList works={ranked} open={openWork} /></ConsoleCard> : tab === 'audience' ? <AudiencePanel view={view} full /> : <>{reviewPanel}<ConsoleCard className="va-panel"><ConsoleCardTitle>把发现带回持续创作</ConsoleCardTitle><p>复制本次复盘，进入已有项目，与AI继续整理选题、修改脚本或保存成果。运营执行继续使用今日任务。</p><div className="va-review-links"><Link href="/projects">打开已有项目 <ArrowUpRight size={15} /></Link><Link href="/short-video/tasks">查看运营任务 <ArrowUpRight size={15} /></Link></div></ConsoleCard></>}
    </> }</>}
    <dialog className="va-detail" ref={detailRef} onCancel={e => { e.preventDefault(); closeWork(); }} onClose={closeWork} aria-labelledby="va-detail-title">{work ? <><header><span className="va-kicker">WORK INSIGHT{showDataSource ? ` / ${demo ? '演示数据' : '真实记录'}` : ''}</span><button onClick={closeWork} aria-label="关闭作品详情"><X size={20} /></button></header><h2 id="va-detail-title">{work.title}</h2><p>{platformLabel(work.platform)} · {work.account}</p><p className="va-note">发布于 {work.publishedAt} · 统计 {view?.start} — {view?.end}</p><div className="va-detail-metrics">{[['播放', work.plays], ['点赞', work.likes], ['评论', work.comments], ['收藏', work.saves], ['分享', work.shares], ['新增关注', work.netFollowers]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{number(value as number)}</strong></article>)}</div>{data && view ? <Trend view={{ ...view, trend: view.trend.map(day => { const rows = data.points.filter(p => p.workId === work.id && p.day === day.day); return { ...day, plays: rows.length ? rows.reduce((s, p) => s + p.plays, 0) : null, interactions: rows.length ? rows.reduce((s, p) => s + p.likes + p.comments + p.saves + p.shares, 0) : null, netFollowers: rows.length ? rows.reduce((s, p) => s + p.netFollowers, 0) : null, coverage: rows.length ? 1 : 0 }; }), accounts: view.accounts.filter(a => a.id === work.accountId) }} /> : null}<section className="va-reason"><span>内容主题</span><p>{work.topic} · 收藏/播放 {(work.plays > 0 ? (work.saves / work.plays * 100).toFixed(1) : '—')}%</p><p>这项比例用于观察互动表现，不证明招生或报名效果。</p></section><button onClick={() => { closeWork(); setTab('review'); }}>进入AI复盘 <ChevronRight size={15} /></button>{work.projectId ? <Link href={`/dashboard?project=${encodeURIComponent(work.projectId)}`}>打开关联项目</Link> : <p className="va-note">此作品尚未关联创作项目。</p>}</> : null}</dialog>
  </section>;
}
