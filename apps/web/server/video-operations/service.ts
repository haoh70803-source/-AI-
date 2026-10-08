import 'server-only';
import { db, type Prisma } from '@content-center/db';
import { businessDay, dayOffset, validateObservation, taskState, interactions, comparison, parseCsv, csvNumber, csvBoolean, metricSchema, type Metric, type VideoInput } from './policy';
export class VideoError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
type Actor = {
    workspaceId: string;
    userId: string;
};
const fail = (s: string, status = 409): never => { throw new VideoError(status, s); };
const admin = (role: string) => ['OWNER', 'ADMIN'].includes(role);
async function membership(tx: Prisma.TransactionClient, a: Actor) { return await tx.workspaceMember.findFirst({ where: { workspaceId: a.workspaceId, userId: a.userId, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } } }) ?? fail('没有工作空间访问权限', 403); }
async function account(tx: Prisma.TransactionClient, a: Actor, id: string, active = true) { return await tx.videoAccount.findFirst({ where: { id, workspaceId: a.workspaceId, platform: 'DOUYIN', ...(active ? { archivedAt: null } : {}) } }) ?? fail('账号不存在或已归档', 404); }
const editableTask = (t: {
    assigneeId: string;
    createdById: string;
}, userId: string, role: string) => role !== 'VIEWER' && (admin(role) || t.assigneeId === userId || t.createdById === userId);
export async function readVideo(a: Actor, filters: {
    accountId?: string;
    taskId?: string;
    metricDay?: string;
    days?: number;
} = {}) {
    return db.$transaction(async (tx) => {
        const m = await membership(tx, a), now = new Date(), today = businessDay(now), days = [7, 30, 90].includes(filters.days ?? 30) ? filters.days ?? 30 : 30;
        const accounts = await tx.videoAccount.findMany({ where: { workspaceId: a.workspaceId, platform: 'DOUYIN' }, orderBy: { createdAt: 'asc' } });
        if (filters.accountId && !accounts.some(x => x.id === filters.accountId && !x.archivedAt))
            fail('所选账号不存在或已归档', 404);
        const active = accounts.filter(x => !x.archivedAt && (!filters.accountId || x.id === filters.accountId)), ids = active.map(x => x.id);
        const records = await tx.videoDailyMetric.findMany({ where: { workspaceId: a.workspaceId, accountId: { in: ids }, OR: [{ day: { gte: new Date(dayOffset(today, -Math.max(days - 1, 7)) + 'T00:00:00Z') } }, ...(filters.metricDay ? [{ day: new Date(filters.metricDay + 'T00:00:00Z') }] : [])] }, orderBy: [{ day: 'asc' }, { accountId: 'asc' }] });
        const rows = records.map(r => ({ ...r, day: r.day.toISOString().slice(0, 10), observedAt: r.observedAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
        const dayRows = (day: string) => rows.filter(r => r.day === day), sum = (day: string, key: 'plays' | 'exposures' | 'netFollowers' | 'interactions') => { const r = dayRows(day); if (!r.length || (key === 'exposures' && r.some(x => x.exposures === null)))
            return null; return r.reduce((n, x) => n + (key === 'interactions' ? interactions(x) : x[key] ?? 0), 0); };
        const complete = (day: string, key: 'plays' | 'exposures') => dayRows(day).length === active.length && active.length > 0 && !dayRows(day).some(r => key === 'exposures' && r.exposures === null);
        const metrics = { plays: sum(today, 'plays'), exposures: sum(today, 'exposures'), interactions: sum(today, 'interactions'), netFollowers: sum(today, 'netFollowers') };
        const change = (key: 'plays' | 'exposures') => ({ yesterday: complete(today, key) && complete(dayOffset(today, -1), key) ? comparison(sum(today, key), sum(dayOffset(today, -1), key)) : null, lastWeek: complete(today, key) && complete(dayOffset(today, -7), key) ? comparison(sum(today, key), sum(dayOffset(today, -7), key)) : null });
        const trend = Array.from({ length: days }, (_, i) => { const day = dayOffset(today, i - days + 1); return { day, plays: sum(day, 'plays'), exposures: sum(day, 'exposures'), interactions: sum(day, 'interactions'), coverage: dayRows(day).length, accounts: active.length }; });
        const alerts: {
            id: string;
            type: string;
            title: string;
            detail: string;
            accountId: string;
            href: string;
        }[] = [];
        for (const ac of active) {
            const todayRow = rows.find(r => r.accountId === ac.id && r.day === today), yesterday = rows.find(r => r.accountId === ac.id && r.day === dayOffset(today, -1)), previous = rows.find(r => r.accountId === ac.id && r.day === dayOffset(today, -2));
            if (yesterday?.isFinal && previous?.isFinal && previous.plays >= 1000 && yesterday.plays <= previous.plays * .5)
                alerts.push({ id: ac.id + 'drop', type: '流量下降', title: ac.handle + ' 播放量下降', detail: `昨日完整日较前日下降 ${Math.round((1 - yesterday.plays / previous.plays) * 100)}%，建议检查内容与分发。`, accountId: ac.id, href: '/short-video?account=' + ac.id });
            if (todayRow?.limited)
                alerts.push({ id: ac.id + 'limit', type: '人工确认', title: ac.handle + ' 已记录限流', detail: '此提醒来自人工录入的限流确认，不能根据低播放量自动推断限流。', accountId: ac.id, href: '/short-video?account=' + ac.id });
            if (todayRow && todayRow.comments >= 10 && todayRow.negativeComments / todayRow.comments >= .2)
                alerts.push({ id: ac.id + 'negative', type: '评论异常', title: ac.handle + ' 负面评论占比较高', detail: `今日 ${todayRow.negativeComments}/${todayRow.comments} 条评论被标记为负面，建议安排回复与复核。`, accountId: ac.id, href: '/short-video/tasks?account=' + ac.id });
        }
        const contents = await tx.videoContent.findMany({ where: { workspaceId: a.workspaceId, accountId: { in: ids } }, include: { account: { select: { handle: true } } }, orderBy: { updatedAt: 'desc' }, take: 500 });
        const tasks = await tx.videoTask.findMany({ where: { workspaceId: a.workspaceId, ...(filters.taskId ? { id: filters.taskId } : {}), ...(filters.accountId ? { accountId: filters.accountId } : {}) }, include: { account: { select: { handle: true, archivedAt: true } }, content: { select: { title: true, projectId: true, stage: true } } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 1000 });
        if (filters.taskId && !tasks.length)
            fail('任务不存在或无权访问', 404);
        const members = await tx.workspaceMember.findMany({ where: { workspaceId: a.workspaceId, disabledAt: null, user: { disabledAt: null }, role: { not: 'VIEWER' } }, select: { user: { select: { id: true, name: true } } } });
        const projects = await tx.contentProject.findMany({ where: { workspaceId: a.workspaceId, status: { not: 'ARCHIVED' } }, select: { id: true, title: true }, orderBy: { updatedAt: 'desc' }, take: 200 });
        return { role: m.role, userId: a.userId, today, zone: '北京时间', days, accounts, selectedAccount: filters.accountId ?? '', records: rows, metrics, changes: { plays: change('plays'), exposures: change('exposures') }, coverage: { recorded: dayRows(today).length, total: active.length }, observedAt: rows.reduce<string | null>((n, r) => n === null || r.observedAt > n ? r.observedAt : n, null), readAt: now.toISOString(), trend, alerts, contents: contents.map(c => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })), tasks: tasks.map(t => ({ ...t, dueAt: t.dueAt.toISOString(), completedAt: t.completedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), state: taskState(t, now), editable: editableTask(t, a.userId, m.role) })), members: members.map(x => x.user), projects };
    }, { isolationLevel: 'RepeatableRead' });
}
export async function mutateVideo(a: Actor, input: VideoInput) {
    try {
        return await db.$transaction(async (tx) => {
            const member = await membership(tx, a);
            if (member.role === 'VIEWER')
                fail('只读成员不能修改运营记录', 403);
            const now = new Date(), today = businessDay(now);
            async function audit(action: string, id: string, metadata: Prisma.InputJsonValue) { await tx.auditLog.create({ data: { workspaceId: a.workspaceId, userId: a.userId, action: 'video.' + action, resourceType: 'video_operations', resourceId: id, metadata } }); }
            if (input.action === 'account.create') {
                if (!admin(member.role))
                    fail('仅所有者与管理员可管理账号', 403);
                const r = await tx.videoAccount.create({ data: { workspaceId: a.workspaceId, platform: 'DOUYIN', externalId: input.externalId, handle: input.handle } });
                await audit('account.create', r.id, { externalId: r.externalId });
                return { id: r.id };
            }
            if (input.action === 'account.archive') {
                if (!admin(member.role))
                    fail('仅所有者与管理员可管理账号', 403);
                await account(tx, a, input.id, false);
                const r = await tx.videoAccount.updateMany({ where: { id: input.id, workspaceId: a.workspaceId, revision: input.revision }, data: { archivedAt: input.archived ? now : null, revision: { increment: 1 } } });
                if (r.count !== 1)
                    fail('账号已修改，请刷新后重试');
                await audit('account.archive', input.id, { archived: input.archived });
                return { ok: true };
            }
            if (input.action === 'csv.preview') {
                let parsed: ReturnType<typeof parseCsv> = [];
                try {
                    parsed = parseCsv(input.csv);
                }
                catch (e) {
                    fail((e as Error).message, 400);
                }
                const seen = new Set<string>(), accounts = await tx.videoAccount.findMany({ where: { workspaceId: a.workspaceId, platform: 'DOUYIN', archivedAt: null } }), rows: Metric[] = [], existing = await tx.videoDailyMetric.findMany({ where: { workspaceId: a.workspaceId, accountId: { in: accounts.map(x => x.id) } } });
                for (const [i, c] of parsed.entries()) {
                    try {
                        const ac = accounts.find(x => x.externalId === c['账号编号']);
                        if (!ac)
                            throw Error('账号编号未登记或已归档');
                        const key = ac.id + '|' + c['日期'];
                        if (seen.has(key))
                            throw Error('同一账号和日期重复');
                        seen.add(key);
                        const r = metricSchema.parse({ accountId: ac.id, day: c['日期'], plays: csvNumber(c['播放量']), exposures: csvNumber(c['曝光量'], true), likes: csvNumber(c['点赞']), comments: csvNumber(c['评论']), shares: csvNumber(c['分享']), saves: csvNumber(c['收藏']), netFollowers: csvNumber(c['净增粉丝']), negativeComments: csvNumber(c['负面评论']), limited: csvBoolean(c['限流确认']), isFinal: csvBoolean(c['完整日']), observedAt: c['数据截至'], revision: existing.find(x => x.accountId === ac.id && x.day.toISOString().slice(0, 10) === c['日期'])?.revision ?? 0 });
                        validateObservation(r, today, now);
                        rows.push(r);
                    }
                    catch (e) {
                        fail(`CSV 第 ${i + 2} 行：${e instanceof Error ? e.message : '内容不正确'}`, 400);
                    }
                }
                return { preview: rows, creates: rows.filter(x => x.revision === 0).length, updates: rows.filter(x => x.revision > 0).length };
            }
            if (input.action === 'metrics.save') {
                const seen = new Set<string>();
                const history: Prisma.InputJsonValue[] = [];
                for (const r of input.rows) {
                    await account(tx, a, r.accountId);
                    try {
                        validateObservation(r, today, now);
                    }
                    catch (e) {
                        fail((e as Error).message, 400);
                    }
                    const key = r.accountId + '|' + r.day;
                    if (seen.has(key))
                        fail('批次中账号和日期不能重复', 400);
                    seen.add(key);
                    const before = await tx.videoDailyMetric.findUnique({ where: { accountId_day: { accountId: r.accountId, day: new Date(r.day + 'T00:00:00Z') } } });
                    history.push(JSON.parse(JSON.stringify({ before, after: r })));
                    const { day, revision, ...values } = r;
                    const data = { ...values, day: new Date(day + 'T00:00:00Z'), observedAt: new Date(r.observedAt), source: input.source, updatedById: a.userId };
                    if (revision === 0)
                        await tx.videoDailyMetric.create({ data: { ...data, workspaceId: a.workspaceId } });
                    else {
                        const saved = await tx.videoDailyMetric.updateMany({ where: { workspaceId: a.workspaceId, accountId: r.accountId, day: data.day, revision }, data: { ...data, revision: { increment: 1 } } });
                        if (saved.count !== 1)
                            fail('部分记录已被修改，整批未保存，请重新预览或刷新');
                    }
                }
                await audit('metrics.save', a.workspaceId, { source: input.source, changes: history });
                return { saved: input.rows.length };
            }
            if (input.action === 'content.create') {
                await account(tx, a, input.accountId);
                if (input.projectId && !await tx.contentProject.findFirst({ where: { id: input.projectId, workspaceId: a.workspaceId, status: { not: 'ARCHIVED' } } }))
                    fail('关联项目不存在', 404);
                const r = await tx.videoContent.create({ data: { workspaceId: a.workspaceId, createdById: a.userId, accountId: input.accountId, title: input.title, projectId: input.projectId, stage: input.stage } });
                await audit('content.create', r.id, { stage: r.stage, projectId: r.projectId });
                return { id: r.id };
            }
            if (input.action === 'content.stage') {
                const c = await tx.videoContent.findFirst({ where: { id: input.id, workspaceId: a.workspaceId } });
                if (!c)
                    fail('内容不存在', 404);
                await account(tx, a, c!.accountId);
                const r = await tx.videoContent.updateMany({ where: { id: input.id, workspaceId: a.workspaceId, revision: input.revision }, data: { stage: input.stage, revision: { increment: 1 } } });
                if (r.count !== 1)
                    fail('内容记录已修改，请刷新');
                await audit('content.stage', input.id, { from: c!.stage, to: input.stage });
                return { ok: true };
            }
            if (input.action === 'task.create') {
                await account(tx, a, input.accountId);
                if (input.contentId && !await tx.videoContent.findFirst({ where: { id: input.contentId, accountId: input.accountId, workspaceId: a.workspaceId, stage: { not: 'ARCHIVED' } } }))
                    fail('关联内容不存在或属于其他账号', 404);
                if (!admin(member.role) && input.assigneeId !== a.userId)
                    fail('编辑成员只能将任务指派给自己', 403);
                if (!await tx.workspaceMember.findFirst({ where: { workspaceId: a.workspaceId, userId: input.assigneeId, disabledAt: null, user: { disabledAt: null }, role: { not: 'VIEWER' } } }))
                    fail('负责人必须为有效编辑成员', 400);
                const r = await tx.videoTask.create({ data: { workspaceId: a.workspaceId, createdById: a.userId, accountId: input.accountId, contentId: input.contentId, assigneeId: input.assigneeId, kind: input.kind, title: input.title, dueAt: new Date(input.dueAt), note: input.note } });
                await audit('task.create', r.id, { kind: r.kind, dueAt: r.dueAt.toISOString() });
                return { id: r.id };
            }
            const t = await tx.videoTask.findFirst({ where: { id: input.id, workspaceId: a.workspaceId } });
            if (!t)
                fail('任务不存在', 404);
            if (!editableTask(t!, a.userId, member.role))
                fail('仅任务负责人、创建者或管理员可修改', 403);
            if (input.dueAt && new Date(input.dueAt) <= now)
                fail('延期后的截止时间必须晚于当前时间', 400);
            if (t!.status === 'DONE' && input.dueAt)
                fail('已完成任务不能延期，请先重新打开', 409);
            const r = await tx.videoTask.updateMany({ where: { id: input.id, workspaceId: a.workspaceId, revision: input.revision }, data: { ...(input.status !== undefined ? { status: input.status, completedAt: input.status === 'DONE' ? now : null } : {}), ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}), ...(input.note !== undefined ? { note: input.note } : {}), revision: { increment: 1 } } });
            if (r.count !== 1)
                fail('任务已被修改，请刷新后重试');
            await audit('task.update', input.id, { before: { status: t!.status, dueAt: t!.dueAt.toISOString() }, after: input });
            return { ok: true };
        }, { isolationLevel: 'Serializable', timeout: 20000 });
    }
    catch (e) {
        if (e instanceof VideoError)
            throw e;
        const code = (e as {
            code?: string;
        }).code;
        if (['P2002', 'P2034'].includes(code ?? ''))
            fail('记录重复或并发修改，请刷新后重试');
        throw e;
    }
}
