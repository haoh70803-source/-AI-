import { getApiWorkspaceContext, apiError } from '@/server/api-access';
import { readVideo, mutateVideo, VideoError } from '@/server/video-operations/service';
import { inputSchema, daySchema } from '@/server/video-operations/policy';
export const dynamic = 'force-dynamic';
function failure(e: unknown) { if (e instanceof VideoError)
    return apiError('VIDEO_ERROR', e.status, e.message); console.error('VIDEO_OPERATIONS_FAILED'); return apiError('INTERNAL_ERROR', 500, '操作未完成，请稍后重试'); }
export async function GET(request: Request) { try {
    const c = await getApiWorkspaceContext();
    if (!c)
        return apiError('UNAUTHORIZED', 401);
    const q = new URL(request.url).searchParams, days = Number(q.get('days') ?? 30);
    if ((q.has('date') && !daySchema.safeParse(q.get('date')).success) || ![7, 30, 90].includes(days) || (q.get('account')?.length ?? 0) > 100 || (q.get('task')?.length ?? 0) > 100)
        return apiError('BAD_REQUEST', 400, '筛选条件不正确');
    return Response.json(await readVideo({ workspaceId: c.workspace.id, userId: c.session.user.id }, { accountId: q.get('account') || undefined, taskId: q.get('task') || undefined, metricDay: q.get('date') || undefined, days }), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return failure(e);
} }
export async function POST(request: Request) { if (request.headers.get('origin') !== new URL(process.env.APP_URL!).origin)
    return apiError('FORBIDDEN', 403, '请求来源不正确'); if (!request.headers.get('content-type')?.startsWith('application/json'))
    return apiError('BAD_REQUEST', 400); try {
    const c = await getApiWorkspaceContext();
    if (!c)
        return apiError('UNAUTHORIZED', 401);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 300000)
        return apiError('BAD_REQUEST', 413, '每批最多500行，文件需小于240KB');
    let body: unknown;
    try {
        body = JSON.parse(raw);
    }
    catch {
        return apiError('BAD_REQUEST', 400, '请求格式错误');
    }
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success)
        return apiError('BAD_REQUEST', 400, parsed.error.issues[0]?.message);
    return Response.json(await mutateVideo({ workspaceId: c.workspace.id, userId: c.session.user.id }, parsed.data));
}
catch (e) {
    return failure(e);
} }
