import { businessDay, dayOffset, videoRange, platforms } from '@/server/video-operations/policy';

export type AnalyticsAccount = { id: string; handle: string; platform: string; followers: number | null; updatedAt: string; source: string };
export type Work = { id: string; accountId: string; title: string; topic: string; publishedAt: string; projectId: string | null };
export type MetricPoint = { accountId: string; workId?: string; day: string; plays: number; likes: number; comments: number; saves: number; shares: number; netFollowers: number; exposures: number | null };
export type Audience = { accountId: string; observedAt: string; ages: Record<string, number>; cities: Record<string, number>; hours: number[]; gender: Record<string, number> };
export type AnalyticsDataset = { source: 'DEMO' | 'MANUAL'; accounts: AnalyticsAccount[]; works: Work[]; points: MetricPoint[]; audiences: Audience[]; today: string; updatedAt: string | null; projects: { id: string; title: string }[]; canCreate: boolean };
export type AnalyticsFilter = { platform: string; accountId: string; days: number; start?: string; end?: string };
export type RankedWork = Work & { account: string; platform: string; plays: number; likes: number; comments: number; saves: number; shares: number; netFollowers: number; interactions: number };
export type RealVideoData = {
  today: string; observedAt: string | null; role: string;
  accounts: { id: string; handle: string; platform: string; archivedAt: string | null }[];
  records: (MetricPoint & { observedAt: string; source: string })[];
  comparisonRecords?: (MetricPoint & { observedAt: string; source: string })[];
  projects: { id: string; title: string }[];
};

export function fromVideoRecords(data: RealVideoData): AnalyticsDataset {
  const accounts = data.accounts.filter(a => !a.archivedAt).map(a => ({ id: a.id, handle: a.handle, platform: a.platform, followers: null, source: '手工 / CSV', updatedAt: data.observedAt ?? '' }));
  const ids = new Set(accounts.map(a => a.id));
  return { source: 'MANUAL', today: data.today, updatedAt: data.observedAt, accounts, points: [...data.records, ...(data.comparisonRecords ?? [])].filter(p => ids.has(p.accountId)), works: [], audiences: [], projects: data.projects, canCreate: data.role !== 'VIEWER' };
}

// Isolated, deterministic fixtures. Nothing here writes to operating tables.
export function createVideoDemo(today = businessDay(), update = 0): AnalyticsDataset {
  const updatedAt = `${today}T10:00:00+08:00`;
  const accounts: AnalyticsAccount[] = [
    { id: 'demo-dy-1', handle: '启航教育 · 家长课堂', platform: 'DOUYIN', followers: 28640, updatedAt, source: '演示数据' },
    { id: 'demo-dy-2', handle: '启航教育 · 学习方法', platform: 'DOUYIN', followers: 17320, updatedAt, source: '演示数据' },
    { id: 'demo-xhs-1', handle: '启航教育 · 成长笔记', platform: 'XIAOHONGSHU', followers: 12560, updatedAt, source: '演示数据' },
    { id: 'demo-xhs-2', handle: '启航教育 · 课堂记录', platform: 'XIAOHONGSHU', followers: 8640, updatedAt, source: '演示数据' },
  ];
  const titles = ['孩子写作业拖拉，先看看这三个原因', '家长答疑：怎样建立每天的阅读习惯', '课堂观察：让孩子主动表达的方法', '考试前，如何帮助孩子安排复习'];
  const works: Work[] = accounts.flatMap((account, ai) => titles.map((title, wi) => ({ id: `${account.id}-w${wi}`, accountId: account.id, title: ai > 1 ? title.replace('孩子', '学生') : title, topic: ['家长答疑', '学习方法', '课堂观察', '学习方法'][wi]!, publishedAt: dayOffset(today, -(wi * 18 + 65 + ai)), projectId: null })));
  const points: MetricPoint[] = [];
  for (let i = 179; i >= 0; i--) {
    const day = dayOffset(today, -i);
    works.forEach((work, wi) => {
      if (work.publishedAt > day) return;
      const ai = Math.floor(wi / 4), kind = wi % 4;
      const wave = 0.75 + ((i * 7 + wi * 11) % 23) / 25;
      const growth = i < 30 ? 1.35 : 1;
      const drop = ai === 1 && i < 3 ? 0.4 : 1;
      const plays = Math.round((kind === 0 ? 3200 : 900 + kind * 270) * wave * growth * drop * (1 - ai * 0.14)) + (i === 0 ? update * (wi + 1) * 13 : 0);
      points.push({ accountId: work.accountId, workId: work.id, day, plays, exposures: ai > 1 ? null : plays * 2, likes: Math.round(plays * .045), comments: Math.round(plays * .006), saves: Math.round(plays * (kind === 1 ? .065 : .018)), shares: Math.round(plays * .009), netFollowers: Math.round(plays * (kind === 0 ? .001 : .004)) });
    });
  }
  const audiences: Audience[] = accounts.map((a, i) => ({ accountId: a.id, observedAt: updatedAt, ages: { '18–24岁': 10 + i, '25–34岁': 38 - i, '35–44岁': 35, '45岁以上': 15, '未知': 2 }, cities: { '杭州': 44 - i * 3, '宁波': 17 + i, '上海': 12, '其他': 25 + i * 2, '未知': 2 }, gender: { '女性': 62 - i * 2, '男性': 36 + i * 2, '未知': 2 }, hours: Array.from({ length: 24 }, (_, h) => h >= 19 && h <= 22 ? 85 + i * 3 : h >= 11 && h <= 13 ? 55 : 10 + h % 5 * 5) }));
  return { source: 'DEMO', accounts, works, points, audiences, today, updatedAt, projects: [], canCreate: true };
}

const total = (rows: MetricPoint[]) => rows.reduce((s, r) => ({ plays: s.plays + r.plays, likes: s.likes + r.likes, comments: s.comments + r.comments, saves: s.saves + r.saves, shares: s.shares + r.shares, netFollowers: s.netFollowers + r.netFollowers, interactions: s.interactions + r.likes + r.comments + r.saves + r.shares }), { plays: 0, likes: 0, comments: 0, saves: 0, shares: 0, netFollowers: 0, interactions: 0 });

export function selectVideoAnalytics(data: AnalyticsDataset, filter: AnalyticsFilter) {
  const { start, end, days } = videoRange(filter.days, filter.start, filter.end, data.today);
  const priorStart = dayOffset(start, -days);
  const accounts = data.accounts.filter(a => (!filter.platform || a.platform === filter.platform) && (!filter.accountId || a.id === filter.accountId));
  const ids = new Set(accounts.map(a => a.id));
  const all = data.points.filter(p => ids.has(p.accountId) && p.day <= end);
  const points = all.filter(p => p.day >= start), prior = all.filter(p => p.day >= priorStart && p.day < start);
  const metrics = points.length ? total(points) : null;
  const trend = Array.from({ length: days }, (_, index) => {
    const day = dayOffset(start, index), rows = points.filter(p => p.day === day);
    return { day, plays: rows.length ? total(rows).plays : null, interactions: rows.length ? total(rows).interactions : null, netFollowers: rows.length ? total(rows).netFollowers : null, coverage: new Set(rows.map(r => r.accountId)).size };
  });
  const complete = (rows: MetricPoint[], firstDay: string) => accounts.length > 0 && Array.from({ length: days }, (_, i) => dayOffset(firstDay, i)).every(day => accounts.every(a => rows.some(p => p.accountId === a.id && p.day === day)));
  const previous = prior.length && complete(prior, priorStart) && complete(points, start) ? total(prior) : null;
  const growth = metrics && previous && previous.plays > 0 ? (metrics.plays / previous.plays - 1) * 100 : null;
  const works: RankedWork[] = data.works.filter(w => ids.has(w.accountId)).flatMap(w => {
    const rows = points.filter(p => p.workId === w.id);
    if (!rows.length) return [];
    const account = accounts.find(a => a.id === w.accountId)!;
    return [{ ...w, ...total(rows), account: account.handle, platform: account.platform }];
  });
  const stats = accounts.map(a => ({ ...a, metrics: points.some(p => p.accountId === a.id) ? total(points.filter(p => p.accountId === a.id)) : null }));
  const samples = data.audiences.filter(a => ids.has(a.accountId));
  // This is a follower-count weighted group profile, NOT a deduplicated user population.
  const weight = samples.reduce((sum, a) => sum + (accounts.find(x => x.id === a.accountId)?.followers ?? 0), 0);
  const weighted = (key: 'ages' | 'cities' | 'gender') => weight > 0 ? Object.fromEntries([...new Set(samples.flatMap(a => Object.keys(a[key])))].map(label => [label, samples.reduce((sum, a) => sum + (a[key][label] ?? 0) * (accounts.find(x => x.id === a.accountId)?.followers ?? 0), 0) / weight])) : null;
  const profile = samples.length === accounts.length && weight > 0 ? { ages: weighted('ages')!, cities: weighted('cities')!, gender: weighted('gender')!, hours: Array.from({ length: 24 }, (_, h) => samples.reduce((sum, a) => sum + a.hours[h]! * (accounts.find(x => x.id === a.accountId)?.followers ?? 0), 0) / weight), followers: weight } : null;
  const best = [...works].filter(w => w.plays > 0).sort((a, b) => (b.plays ? b.saves / b.plays : 0) - (a.plays ? a.saves / a.plays : 0))[0];
  const insight = best ? { title: '收藏表现值得关注', evidence: `《${best.title}》在本周期获得 ${best.saves.toLocaleString('zh-CN')} 次收藏，收藏/播放为 ${(best.saves / best.plays * 100).toFixed(1)}%。`, hypothesis: '可能与内容的实用性有关，仍需结合评论和后续作品验证。', suggestion: '围绕这一主题整理后续答疑选题，并在下一周期复盘表现。', workId: best.id } : { title: metrics ? '先建立作品级复盘依据' : '等待可分析的数据', evidence: metrics ? `当前范围已记录 ${metrics.plays.toLocaleString('zh-CN')} 次播放；尚未接入作品级数据与粉丝画像。` : '当前筛选范围没有记录；未录入不代表零流量。', hypothesis: '现有数据不足以判断具体内容的贡献。', suggestion: '录入账号数据，或使用隔离的演示模式查看完整流程。', workId: null };
  return { accounts, metrics, trend, works, stats, profile, insight, growth, start, end, days, coverage: { actual: new Set(points.map(p => `${p.accountId}:${p.day}`)).size, expected: accounts.length * days } };
}

export type VideoAnalytics = ReturnType<typeof selectVideoAnalytics>;
export const platformLabel = (platform: string) => (platforms as Record<string, string>)[platform] ?? platform;
export const rankWorks = (works: RankedWork[], rank: 'plays' | 'interactions' | 'netFollowers') => [...works].sort((a, b) => b[rank] - a[rank] || a.id.localeCompare(b.id));
