import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { db } from '@content-center/db';
import { businessDay, dayOffset, daySchema, videoRange, inputSchema, comparison, taskState, parseCsv, csvHeaders, csvNumber, csvCell, metricSchema, validateObservation, type Metric } from '../server/video-operations/policy';
import { mutateVideo, readVideo } from '../server/video-operations/service';
const fixed = new Date('2026-10-08T02:00:00Z'), base: Metric = { accountId: 'a', day: '2026-10-08', plays: 1200, exposures: null, likes: 20, comments: 10, shares: 3, saves: 5, netFollowers: -2, negativeComments: 2, limited: false, isFinal: false, observedAt: fixed.toISOString(), revision: 0 };
describe('video operating policy', () => {
    it.each([['2026-10-09', '2026-10-09'], ['2026-10-08', '2026-10-07'], ['2026-02-30', '2026-03-01'], ['2020-01-01', '2026-10-08'], ['2026-10-01', undefined]])('rejects invalid custom range %s to %s', (start, end) => expect(() => videoRange(30, start, end, '2026-10-08')).toThrow());
    it('counts leap day and same-day ranges inclusively', () => { expect(videoRange(30, '2024-02-28', '2024-03-01', '2026-10-08').days).toBe(3); expect(videoRange(7, '2026-10-08', '2026-10-08', '2026-10-08').days).toBe(1); });
    it('rejects unknown account platforms', () => expect(inputSchema.safeParse({ action: 'account.create', platform: 'UNKNOWN', handle: 'test', externalId: 'test' }).success).toBe(false));
    it('uses Beijing day across UTC midnight', () => expect(businessDay(new Date('2026-10-07T17:00:00Z'))).toBe('2026-10-08'));
    it('offsets days across month boundary', () => expect(dayOffset('2026-03-01', -1)).toBe('2026-02-28'));
    it.each(['2026-02-30', '2026-13-01', '2026-00-01'])('rejects nonexistent date %s', d => expect(daySchema.safeParse(d).success).toBe(false));
    it('accepts leap day only in leap year', () => { expect(daySchema.safeParse('2028-02-29').success).toBe(true); expect(daySchema.safeParse('2026-02-29').success).toBe(false); });
    it('missing baseline and zero baseline are not 0 percent', () => { expect(comparison(100, null)).toBeNull(); expect(comparison(100, 0)).toBeNull(); expect(comparison(null, 100)).toBeNull(); });
    it('signed growth and negative percentage are preserved', () => expect(comparison(40, 100)).toBe(-60));
    it('overdue is derived without overwriting completed status', () => { expect(taskState({ status: 'TODO', dueAt: '2026-10-07T00:00:00Z' }, fixed)).toBe('OVERDUE'); expect(taskState({ status: 'DONE', dueAt: '2026-10-07T00:00:00Z' }, fixed)).toBe('DONE'); });
    it('rejects partial negative comments above total', () => expect(metricSchema.safeParse({ ...base, negativeComments: 11 }).success).toBe(false));
    it('keeps signed followers but rejects negative views', () => { expect(metricSchema.safeParse(base).success).toBe(true); expect(metricSchema.safeParse({ ...base, plays: -1 }).success).toBe(false); });
    it('rejects intraday complete-day claim', () => expect(() => validateObservation({ ...base, isFinal: true }, '2026-10-08', fixed)).toThrow());
    it('rejects future observation and date', () => { expect(() => validateObservation({ ...base, observedAt: '2026-10-08T03:00:00Z' }, '2026-10-08', fixed)).toThrow(); expect(() => validateObservation({ ...base, day: '2026-10-09' }, '2026-10-08', fixed)).toThrow(); });
    it('rejects observation before business date', () => expect(() => validateObservation({ ...base, observedAt: '2026-10-07T00:00:00Z' }, '2026-10-08', fixed)).toThrow());
    it('parses BOM and quoted CSV correctly', () => { const csv = '\uFEFF' + csvHeaders.join(',') + '\r\n' + ['acct', '2026-10-08', 100, '', 1, 2, 3, 4, -1, 0, '否', '否', '2026-10-08T09:00:00+08:00'].map(v => '"' + v + '"').join(','); const p = parseCsv(csv); expect(p[0]!['曝光量']).toBe(''); expect(p[0]!['净增粉丝']).toBe('-1'); });
    it('preserves quoted comma and escaped quotes', () => expect(parseCsv(csvHeaders.join(',') + '\n"a,""b""",d,1,2,3,4,5,6,7,8,否,否,x')[0]!['账号编号']).toBe('a,"b"'));
    it.each(['"unterminated', 'a"b', '"a"b'])('rejects malformed CSV %s', v => expect(() => parseCsv(csvHeaders.join(',') + '\n' + v)).toThrow());
    it('rejects wrong header and non-integer expressions', () => { expect(() => parseCsv('x,y\n1,2')).toThrow(); expect(() => csvNumber('=1+1')).toThrow(); expect(() => csvNumber('1e4')).toThrow(); expect(() => csvNumber('')).toThrow(); });
    it('safe CSV export neutralizes formula-like strings', () => expect(csvCell('=cmd()')).toBe('"\'=cmd()"'));
});
describe('video operations real database', () => {
    const key = randomUUID(), ownerId = 'video-owner-' + key, editorId = 'video-editor-' + key, viewerId = 'video-viewer-' + key, otherId = 'video-other-' + key;
    let workspaceId = '', otherWorkspace = '', accountId = '', contentId = '', taskId = '';
    const actor = () => ({ workspaceId, userId: ownerId });
    const row = (day = businessDay(), plays = 1000): Metric => ({ ...base, day, accountId, plays, observedAt: new Date(Date.now() - 60000).toISOString() });
    beforeAll(async () => { for (const [id, name] of [[ownerId, 'Owner'], [editorId, 'Editor'], [viewerId, 'Viewer'], [otherId, 'Other']])
        await db.user.create({ data: { id: id!, name: name!, email: id + '@example.test' } }); workspaceId = (await db.workspace.create({ data: { name: 'Video service QA', slug: 'video-' + key, members: { create: [{ userId: ownerId, role: 'OWNER' }, { userId: editorId, role: 'EDITOR' }, { userId: viewerId, role: 'VIEWER' }] } } })).id; otherWorkspace = (await db.workspace.create({ data: { name: 'Other Video QA', slug: 'other-video-' + key, members: { create: { userId: otherId, role: 'OWNER' } } } })).id; });
    afterAll(async () => { const scope = { workspaceId: { in: [workspaceId, otherWorkspace] } }; await db.videoTask.deleteMany({ where: scope }); await db.videoContent.deleteMany({ where: scope }); await db.videoDailyMetric.deleteMany({ where: scope }); await db.videoAccount.deleteMany({ where: scope }); await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspace] } } }); await db.user.deleteMany({ where: { id: { in: [ownerId, editorId, viewerId, otherId] } } }); await db.$disconnect(); });
    it('starts with missing data, not invented zeros', async () => { const v = await readVideo(actor()); expect(v.metrics.plays).toBeNull(); expect(v.trend.every(p => p.plays === null)).toBe(true); });
    it('registers one-platform accounts with workspace identity', async () => { const r = await mutateVideo(actor(), { action: 'account.create', handle: 'Test matrix', externalId: 'qa-' + key }); accountId = (r as {
        id: string;
    }).id; expect((await readVideo(actor())).accounts[0]!.platform).toBe('DOUYIN'); });
    it('viewer and editor cannot manage accounts', async () => { for (const userId of [editorId, viewerId])
        await expect(mutateVideo({ workspaceId, userId }, { action: 'account.create', handle: 'Forbidden', externalId: 'forbidden-' + userId })).rejects.toMatchObject({ status: 403 }); });
    it('writes a real metric snapshot and computes interactions', async () => { await mutateVideo(actor(), { action: 'metrics.save', source: 'MANUAL', rows: [row()] }); const v = await readVideo(actor()); expect(v.metrics).toMatchObject({ plays: 1000, interactions: 38, netFollowers: -2, exposures: null }); expect(v.coverage).toEqual({ recorded: 1, total: 1 }); });
    it('re-recording increments a revision without double counting', async () => { await mutateVideo(actor(), { action: 'metrics.save', source: 'MANUAL', rows: [{ ...row(), plays: 1500, revision: 1 }] }); expect((await readVideo(actor())).metrics.plays).toBe(1500); });
    it('stale revision rejects overwrite', async () => await expect(mutateVideo(actor(), { action: 'metrics.save', source: 'MANUAL', rows: [{ ...row(), plays: 999, revision: 1 }] })).rejects.toMatchObject({ status: 409 }));
    it('a failed row rolls back an entire batch', async () => { await expect(mutateVideo(actor(), { action: 'metrics.save', source: 'CSV', rows: [row(dayOffset(businessDay(), -1)), { ...row(), revision: 1 }] })).rejects.toThrow(); expect(await db.videoDailyMetric.count({ where: { workspaceId, day: new Date(dayOffset(businessDay(), -1)) } })).toBe(0); });
    it('rejects cross-workspace account metric writes', async () => await expect(mutateVideo({ workspaceId: otherWorkspace, userId: otherId }, { action: 'metrics.save', source: 'MANUAL', rows: [row()] })).rejects.toMatchObject({ status: 404 }));
    it('viewer cannot write metrics', async () => await expect(mutateVideo({ workspaceId, userId: viewerId }, { action: 'metrics.save', source: 'MANUAL', rows: [row()] })).rejects.toMatchObject({ status: 403 }));
    it('CSV preview resolves accounts and existing revisions without writing', async () => { const c = csvHeaders.join(',') + '\n' + ['qa-' + key, businessDay(), 400, '', 1, 2, 3, 4, -2, 0, '否', '否', new Date(Date.now() - 60000).toISOString()].join(','); const r = await mutateVideo(actor(), { action: 'csv.preview', csv: c }) as {
        preview: Metric[];
        updates: number;
    }; expect(r.preview[0]!.revision).toBe(2); expect(r.updates).toBe(1); expect((await readVideo(actor())).metrics.plays).toBe(1500); });
    it('malformed CSV is a client error', async () => await expect(mutateVideo(actor(), { action: 'csv.preview', csv: 'x,y\n1,2' })).rejects.toMatchObject({ status: 400 }));
    it('derives a drop only from two full historical days', async () => { await mutateVideo(actor(), { action: 'metrics.save', source: 'CSV', rows: [{ ...row(dayOffset(businessDay(), -2), 5000), isFinal: true }, { ...row(dayOffset(businessDay(), -1), 1000), isFinal: true }] }); const v = await readVideo(actor()); expect(v.alerts.some(a => a.type === '流量下降')).toBe(true); expect(v.changes.plays.yesterday).toBe(50); });
    it('creates content lifecycle independently of publication claim', async () => { const r = await mutateVideo(actor(), { action: 'content.create', accountId, title: 'First video', projectId: null, stage: 'EDITING' }); contentId = (r as {
        id: string;
    }).id; expect((await readVideo(actor())).contents[0]!.stage).toBe('EDITING'); });
    it('creates tasks with deadline and actual assignee', async () => { const r = await mutateVideo(actor(), { action: 'task.create', accountId, contentId, assigneeId: editorId, kind: 'PUBLISH', title: 'Publish video', dueAt: new Date(Date.now() - 60000).toISOString(), note: 'Check caption' }); taskId = (r as {
        id: string;
    }).id; expect((await readVideo(actor(), { taskId })).tasks[0]!.state).toBe('OVERDUE'); });
    it('task completion records a timestamp without claiming publication', async () => { await mutateVideo({ workspaceId, userId: editorId }, { action: 'task.update', id: taskId, revision: 1, status: 'DONE' }); const v = await readVideo(actor(), { taskId }); expect(v.tasks[0]!.completedAt).not.toBeNull(); expect(v.tasks[0]!.state).toBe('DONE'); expect(v.contents[0]!.stage).toBe('EDITING'); });
    it('completed task cannot be postponed until reopened', async () => await expect(mutateVideo(actor(), { action: 'task.update', id: taskId, revision: 2, dueAt: new Date(Date.now() + 600000).toISOString() })).rejects.toMatchObject({ status: 409 }));
    it('reopens and postpones with optimistic concurrency', async () => { await mutateVideo(actor(), { action: 'task.update', id: taskId, revision: 2, status: 'TODO' }); await mutateVideo(actor(), { action: 'task.update', id: taskId, revision: 3, dueAt: new Date(Date.now() + 600000).toISOString() }); expect((await readVideo(actor(), { taskId })).tasks[0]!.state).toBe('TODO'); });
    it('task revisions and workspaces prevent unsafe updates', async () => { await expect(mutateVideo(actor(), { action: 'task.update', id: taskId, revision: 1, status: 'DONE' })).rejects.toMatchObject({ status: 409 }); await expect(readVideo({ workspaceId: otherWorkspace, userId: otherId }, { taskId })).rejects.toMatchObject({ status: 404 }); });
    it('filters real platforms and historical ranges without mixing CSV identities', async () => {
        const xhs = await mutateVideo(actor(), { action: 'account.create', platform: 'XIAOHONGSHU', handle: 'XHS test', externalId: 'qa-' + key }) as { id: string };
        try {
            const historic = dayOffset(businessDay(), -100);
            await mutateVideo(actor(), { action: 'metrics.save', source: 'MANUAL', rows: [{ ...row(historic, 321), accountId: xhs.id }] });
            const v = await readVideo(actor(), { platform: 'XIAOHONGSHU', start: historic, end: historic });
            expect(v.records).toHaveLength(1); expect(v.records[0]!.accountId).toBe(xhs.id); expect(v.trend[0]!.plays).toBe(321); expect(v.trend).toHaveLength(1);
            expect((await readVideo(actor(), { platform: 'DOUYIN', start: historic, end: historic })).records).toHaveLength(0);
            await expect(readVideo(actor(), { platform: 'XIAOHONGSHU', accountId })).rejects.toMatchObject({ status: 404 });
            await expect(readVideo(actor(), { start: businessDay(), end: dayOffset(businessDay(), 1) })).rejects.toMatchObject({ status: 400 });
            const csv = csvHeaders.join(',') + '\n' + ['qa-' + key, historic, 888, '', 1, 2, 3, 4, 0, 0, '否', '否', new Date().toISOString()].join(',');
            const preview = await mutateVideo(actor(), { action: 'csv.preview', platform: 'XIAOHONGSHU', csv }) as { preview: Metric[] };
            expect(preview.preview[0]!.accountId).toBe(xhs.id);
            expect(preview.preview[0]!.revision).toBe(1);
            const task = await mutateVideo(actor(), { action: 'task.create', accountId: xhs.id, contentId: null, assigneeId: ownerId, kind: 'EDIT', title: 'XHS task', dueAt: new Date().toISOString(), note: '' }) as { id: string };
            expect((await readVideo(actor(), { platform: 'XIAOHONGSHU' })).tasks.map(t => t.id)).toContain(task.id);
            expect((await readVideo(actor(), { platform: 'DOUYIN' })).tasks.map(t => t.id)).not.toContain(task.id);
        } finally { await db.videoTask.deleteMany({ where: { accountId: xhs.id } }); await db.videoDailyMetric.deleteMany({ where: { accountId: xhs.id } }); await db.videoAccount.delete({ where: { id: xhs.id } }); }
    });
    it('archived accounts keep historical rows while exiting active totals', async () => { await mutateVideo(actor(), { action: 'account.archive', id: accountId, revision: 1, archived: true }); expect((await readVideo(actor())).metrics.plays).toBeNull(); expect(await db.videoDailyMetric.count({ where: { accountId } })).toBe(3); });
    it('disabled members are rejected by service boundaries', async () => { await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: editorId } }, data: { disabledAt: new Date() } }); await expect(readVideo({ workspaceId, userId: editorId })).rejects.toMatchObject({ status: 403 }); });
});
