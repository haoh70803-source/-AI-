import { describe, expect, it } from 'vitest';
import { createVideoDemo, fromVideoRecords, rankWorks, selectVideoAnalytics, type RealVideoData } from '../lib/video-analytics';

const filter = { platform: '', accountId: '', days: 30 };
describe('video analytics integrity', () => {
  it('avoids undefined interaction ratios for zero-play works', () => {
    const data = createVideoDemo('2026-10-08');
    data.points = data.points.map(point => ({ ...point, plays: 0 }));
    const view = selectVideoAnalytics(data, filter);
    expect(view.insight.workId).toBeNull();
    expect(view.insight.evidence).not.toMatch(/NaN|Infinity/);
  });
  it('keeps overview, account totals, trend and works consistent', () => {
    const view = selectVideoAnalytics(createVideoDemo('2026-10-08'), filter);
    for (const key of ['plays', 'interactions', 'netFollowers'] as const) {
      expect(view.trend.reduce((sum, p) => sum + (p[key] ?? 0), 0)).toBe(view.metrics![key]);
      expect(view.works.reduce((sum, w) => sum + w[key], 0)).toBe(view.metrics![key]);
      expect(view.stats.reduce((sum, a) => sum + (a.metrics?.[key] ?? 0), 0)).toBe(view.metrics![key]);
    }
    expect(view.metrics!.interactions).toBe(view.metrics!.likes + view.metrics!.comments + view.metrics!.saves + view.metrics!.shares);
  });
  it('limits works, profile and insight evidence to the selected platform and account', () => {
    const data = createVideoDemo('2026-10-08');
    const view = selectVideoAnalytics(data, { platform: 'XIAOHONGSHU', accountId: 'demo-xhs-2', days: 7 });
    expect(view.accounts).toHaveLength(1);
    expect(view.works.every(w => w.accountId === 'demo-xhs-2')).toBe(true);
    expect(view.works.some(w => w.id === view.insight.workId)).toBe(true);
    expect(view.profile!.followers).toBe(8640);
    expect(view.profile!.ages).toEqual(data.audiences[3]!.ages);
  });
  it('does not include a stale account from a different platform', () => {
    const view = selectVideoAnalytics(createVideoDemo('2026-10-08'), { platform: 'XIAOHONGSHU', accountId: 'demo-dy-1', days: 30 });
    expect(view.metrics).toBeNull(); expect(view.profile).toBeNull(); expect(view.works).toEqual([]);
  });
  it('uses exactly the requested time interval and preserves gaps', () => {
    const data = createVideoDemo('2026-10-08');
    data.points = data.points.filter(p => p.day !== '2026-07-11');
    const view = selectVideoAnalytics(data, { ...filter, days: 90 });
    expect(view.trend).toHaveLength(90); expect(view.start).toBe('2026-07-11');
    expect(view.trend[0]!.plays).toBeNull(); expect(view.growth).toBeNull();
    expect(selectVideoAnalytics(data, { ...filter, days: 7 }).start).toBe('2026-10-02');
  });
  it('keeps age, gender and region proportions normalized, including unknown', () => {
    const view = selectVideoAnalytics(createVideoDemo('2026-10-08'), filter);
    for (const key of ['ages', 'cities', 'gender'] as const) {
      expect(Object.values(view.profile![key]).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100);
      expect(view.profile![key]['未知']).toBeGreaterThan(0);
    }
  });
  it('updates all views from a single simulated snapshot without mutating previous data', () => {
    const before = createVideoDemo('2026-10-08'), after = createVideoDemo('2026-10-08', 1);
    const a = selectVideoAnalytics(before, filter), b = selectVideoAnalytics(after, filter);
    expect(b.metrics!.plays).toBeGreaterThan(a.metrics!.plays);
    expect(b.works.reduce((sum, w) => sum + w.plays, 0)).toBe(b.metrics!.plays);
    expect(selectVideoAnalytics(before, filter).metrics).toEqual(a.metrics);
  });
  it('sorts each ranking by its own metric without mutating the input', () => {
    const view = selectVideoAnalytics(createVideoDemo('2026-10-08'), filter);
    const order = view.works.map(w => w.id);
    for (const key of ['plays', 'interactions', 'netFollowers'] as const) {
      const ranked = rankWorks(view.works, key);
      expect(ranked.every((w, i) => i === 0 || ranked[i - 1]![key] >= w[key])).toBe(true);
    }
    expect(view.works.map(w => w.id)).toEqual(order);
  });
  it('preserves true zero records and signed follower loss while leaving missing dates null', () => {
    const data: RealVideoData = { today: '2026-10-08', observedAt: '2026-10-08T00:00:00Z', role: 'VIEWER', accounts: [{ id: 'real-a', handle: 'Real', platform: 'DOUYIN', archivedAt: null }], records: [{ accountId: 'real-a', day: '2026-10-08', plays: 0, exposures: null, likes: 0, comments: 0, saves: 0, shares: 0, netFollowers: -2, observedAt: '2026-10-08T00:00:00Z', source: 'MANUAL' }], projects: [] };
    const source = fromVideoRecords(data), view = selectVideoAnalytics(source, { ...filter, days: 7 });
    expect(source.canCreate).toBe(false); expect(view.metrics!.plays).toBe(0); expect(view.metrics!.netFollowers).toBe(-2);
    expect(view.trend[0]!.plays).toBeNull(); expect(view.trend.at(-1)!.plays).toBe(0);
    expect(view.profile).toBeNull(); expect(view.works).toEqual([]); expect(view.insight.workId).toBeNull();
  });
  it('excludes archived records and never creates demo works in real mode', () => {
    const data: RealVideoData = { today: '2026-10-08', observedAt: null, role: 'OWNER', accounts: [{ id: 'archived', handle: 'Old', platform: 'DOUYIN', archivedAt: '2026-10-01' }], records: [{ accountId: 'archived', day: '2026-10-08', plays: 10, exposures: null, likes: 1, comments: 0, saves: 0, shares: 0, netFollowers: 0, observedAt: '', source: 'CSV' }], projects: [] };
    const source = fromVideoRecords(data);
    expect(source.source).toBe('MANUAL'); expect(source.accounts).toEqual([]); expect(source.points).toEqual([]);
    expect(selectVideoAnalytics(source, filter).metrics).toBeNull();
  });
});

it('custom ranges include both endpoints and compare with an equal preceding period', () => {
  const data = createVideoDemo('2026-10-08');
  const view = selectVideoAnalytics(data, { ...filter, start: '2026-09-01', end: '2026-09-03' });
  expect(view.start).toBe('2026-09-01'); expect(view.end).toBe('2026-09-03');
  expect(view.trend.map(p => p.day)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  expect(view.metrics!.plays).toBe(data.points.filter(p => p.day >= view.start && p.day <= view.end).reduce((sum, p) => sum + p.plays, 0));
  const previous = data.points.filter(p => p.day >= '2026-08-29' && p.day < view.start).reduce((sum, p) => sum + p.plays, 0);
  expect(view.growth).toBeCloseTo((view.metrics!.plays / previous - 1) * 100);
});
