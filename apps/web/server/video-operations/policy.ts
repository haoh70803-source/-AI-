import { z } from 'zod';
export const platforms = { DOUYIN: '抖音', XIAOHONGSHU: '小红书' } as const;
export const platformSchema = z.enum(['DOUYIN', 'XIAOHONGSHU']);
export const ZONE = 'Asia/Shanghai';
export const kinds = { PUBLISH: '发布视频', LIVE: '直播', COMMENT: '回复评论', EDIT: '剪辑', ADS: '投流' } as const;
export const stages = { IDEA: '选题', EDITING: '制作中', REVIEW: '待审核', READY: '待发布', PUBLISHED: '已发布', ARCHIVED: '已归档' } as const;
export const states = { TODO: '待开始', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已逾期' } as const;
export function businessDay(now = new Date()) { const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); return ['year', 'month', 'day'].map(k => p.find(v => v.type === k)!.value).join('-'); }
export function dayOffset(day: string, n: number) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const n = new Date(s + 'T00:00:00Z'); return !Number.isNaN(n.getTime()) && n.toISOString().slice(0, 10) === s; }, '日期不存在');
export function videoRange(days = 30, start?: string, end?: string, today = businessDay()) {
    if ((start === undefined) !== (end === undefined) || ![7, 30, 90].includes(days)) throw Error('筛选条件不正确');
    if (start !== undefined && end !== undefined) {
        if (!daySchema.safeParse(start).success || !daySchema.safeParse(end).success || start > end || end > today || start < dayOffset(today, -1826)) throw Error('日期范围需在过去五年内，开始日期不能晚于结束日期，不能选择未来日期');
        days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    }
    return { start: start ?? dayOffset(today, 1 - days), end: end ?? today, days };
}
const id = z.string().min(1).max(100), title = z.string().trim().min(1).max(200), revision = z.number().int().min(0), count = z.number().int().min(0).max(2000000000);
const instant = z.string().datetime({ offset: true });
export const metricSchema = z.object({ accountId: id, day: daySchema, plays: count, exposures: count.nullable(), likes: count, comments: count, shares: count, saves: count, netFollowers: z.number().int().min(-2000000000).max(2000000000), negativeComments: count, limited: z.boolean(), isFinal: z.boolean(), observedAt: instant, revision }).strict().refine(r => r.negativeComments <= r.comments, '负面评论不能多于全部评论');
export const inputSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('account.create'), handle: title, platform: platformSchema.optional(), externalId: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, '账号编号需为字母或数字开头，可含下划线、点和短横线') }).strict(),
    z.object({ action: z.literal('account.archive'), id, revision: z.number().int().positive(), archived: z.boolean() }).strict(),
    z.object({ action: z.literal('metrics.save'), rows: z.array(metricSchema).min(1).max(500), source: z.enum(['MANUAL', 'CSV']) }).strict(),
    z.object({ action: z.literal('csv.preview'), platform: platformSchema.optional(), csv: z.string().min(1).max(240000) }).strict(),
    z.object({ action: z.literal('content.create'), accountId: id, title, projectId: id.nullable(), stage: z.enum(['IDEA', 'EDITING', 'REVIEW', 'READY', 'PUBLISHED']) }).strict(),
    z.object({ action: z.literal('content.stage'), id, revision: z.number().int().positive(), stage: z.enum(['IDEA', 'EDITING', 'REVIEW', 'READY', 'PUBLISHED', 'ARCHIVED']) }).strict(),
    z.object({ action: z.literal('task.create'), accountId: id, contentId: id.nullable(), assigneeId: id, kind: z.enum(['PUBLISH', 'LIVE', 'COMMENT', 'EDIT', 'ADS']), title, dueAt: instant, note: z.string().trim().max(4000) }).strict(),
    z.object({ action: z.literal('task.update'), id, revision: z.number().int().positive(), status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(), dueAt: instant.optional(), note: z.string().trim().max(4000).optional() }).strict().refine(r => r.status !== undefined || r.dueAt !== undefined || r.note !== undefined, '请填写修改内容'),
]);
export type VideoInput = z.infer<typeof inputSchema>;
export type Metric = z.infer<typeof metricSchema>;
export function validateObservation(row: Metric, today: string, now: Date) {
    if (row.day > today || row.day < dayOffset(today, -1826))
        throw Error('数据日期需在过去五年内，不能填写未来日期');
    const observed = new Date(row.observedAt);
    if (observed > now || businessDay(observed) < row.day)
        throw Error('数据截至时间不能在未来或早于数据日期');
    if (row.isFinal && row.day >= today)
        throw Error('今日仍在累计，请将当日数据记为阶段快照');
}
export function taskState(task: {
    status: string;
    dueAt: Date | string;
}, now = new Date()) { return task.status !== 'DONE' && new Date(task.dueAt) < now ? 'OVERDUE' : task.status; }
export function comparison(current: number | null, previous: number | null) { return current === null || previous === null || previous === 0 ? null : Math.round((current - previous) / previous * 1000) / 10; }
export function interactions(m: Pick<Metric, 'likes' | 'comments' | 'shares' | 'saves'>) { return m.likes + m.comments + m.shares + m.saves; }
export const csvHeaders = ['账号编号', '日期', '播放量', '曝光量', '点赞', '评论', '分享', '收藏', '净增粉丝', '负面评论', '限流确认', '完整日', '数据截至'] as const;
export function parseCsv(text: string) {
    text = text.replace(/^\uFEFF/, '');
    const records: string[][] = [];
    let row: string[] = [], cell = '', quoted = false, closed = false;
    const pushCell = () => { row.push(cell); cell = ''; closed = false; };
    for (let i = 0; i < text.length; i++) {
        const c = text[i]!;
        if (quoted) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                }
                else {
                    quoted = false;
                    closed = true;
                }
            }
            else
                cell += c;
        }
        else if (c === '"') {
            if (cell || closed)
                throw Error('CSV 引号格式错误');
            quoted = true;
        }
        else if (c === ',')
            pushCell();
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n')
                i++;
            pushCell();
            if (row.some(v => v.trim()))
                records.push(row);
            row = [];
        }
        else {
            if (closed)
                throw Error('CSV 引号后只能为分隔符');
            cell += c;
        }
    }
    if (quoted)
        throw Error('CSV 引号未闭合');
    pushCell();
    if (row.some(v => v.trim()))
        records.push(row);
    if (!records.length || records[0]!.join('|') !== csvHeaders.join('|'))
        throw Error('CSV 表头不匹配，请下载模板');
    if (records.length < 2 || records.length > 501)
        throw Error('每次需导入 1–500 行');
    return records.slice(1).map((r, i) => { if (r.length !== csvHeaders.length)
        throw Error(`第 ${i + 2} 行列数不正确`); return Object.fromEntries(csvHeaders.map((k, n) => [k, r[n]!.trim()])) as Record<typeof csvHeaders[number], string>; });
}
export function csvNumber(s: string, nullable = false) { if (!s && nullable)
    return null; if (!/^-?\d+$/.test(s))
    throw Error('数值必须为整数，不能留空或使用公式'); const n = Number(s); if (!Number.isSafeInteger(n))
    throw Error('整数过大'); return n; }
export function csvBoolean(s: string) { if (s === '是')
    return true; if (s === '否')
    return false; throw Error('限流确认与完整日需填写是或否'); }
export function csvCell(value: string | number) { let s = String(value); if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string')
    s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }
