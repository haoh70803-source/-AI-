"use client";
import { useRef, useState } from 'react';
import { businessDay, dayOffset, videoRange } from '@/server/video-operations/policy';
import './video-date-filter.css';
export type VideoDateRange = { start: string; end: string };
export function VideoDateFilter({ days, range, onChange, className, disabled = false, label = '时间范围' }: { days: number; range?: VideoDateRange; onChange: (days: number, range?: VideoDateRange) => void; className?: string; disabled?: boolean; label?: string }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [start, setStart] = useState(''), [end, setEnd] = useState(''), [error, setError] = useState('');
    const today = businessDay(), earliest = dayOffset(today, -1826);
    function open() { setStart(range?.start ?? dayOffset(today, 1 - days)); setEnd(range?.end ?? today); setError(''); dialog.current?.showModal(); }
    return <><label className={className}><span>时间</span><select aria-label={label} value={range ? 'custom' : days} disabled={disabled} onChange={e => e.target.value === 'custom' ? open() : onChange(Number(e.target.value))}><option value={7}>近7天</option><option value={30}>近30天</option><option value={90}>近90天</option><option value="custom">自定义时间</option></select></label>{range ? <button type="button" disabled={disabled} onClick={open} className="video-date-summary">{range.start} 至 {range.end}</button> : null}<dialog ref={dialog} className="video-date-dialog" aria-label="自定义时间"><form onSubmit={e => { e.preventDefault(); try { videoRange(days, start, end, businessDay()); onChange(days, { start, end }); dialog.current?.close(); } catch (err) { setError((err as Error).message); } }}><h2>自定义时间</h2><p>按北京时间筛选，包含开始日和结束日。</p><label>开始日期<input aria-label="开始日期" type="date" required min={earliest} max={end && end < today ? end : today} value={start} onChange={e => { setStart(e.target.value); setError(''); }} /></label><label>结束日期<input aria-label="结束日期" type="date" required min={start || earliest} max={today} value={end} onChange={e => { setEnd(e.target.value); setError(''); }} /></label>{error ? <p role="alert">{error}</p> : null}<footer><button type="button" onClick={() => dialog.current?.close()}>取消</button><button type="submit">应用</button></footer></form></dialog></>;
}
