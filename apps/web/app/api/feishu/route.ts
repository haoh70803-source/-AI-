import { getApiWorkspaceContext, apiError } from '@/server/api-access';
import { feishuState, mutateFeishu, searchFeishu } from '@/server/feishu/service';
import { FeishuError, feishuInput } from '@/server/feishu/policy';
export const dynamic = 'force-dynamic';
function failure(e: unknown) { if (e instanceof FeishuError)
    return apiError('FEISHU_ERROR', e.status, e.message); const code = (e as {
    code?: string;
}).code; if (['P2002', 'P2034'].includes(code ?? ''))
    return apiError('CONFLICT', 409, '记录重复或被修改，请刷新后重试'); console.error('FEISHU_OPERATION_FAILED'); return apiError('FEISHU_ERROR', 503, '飞书操作未完成，请检查应用配置或稍后重试'); }
export async function GET(request: Request) { try {
    const c = await getApiWorkspaceContext();
    if (!c)
        return apiError('UNAUTHORIZED', 401);
    const actor = { workspaceId: c.workspace.id, userId: c.session.user.id }, q = new URL(request.url).searchParams.get('q');
    if (q !== null) {
        if (!q.trim() || q.length > 500)
            return apiError('BAD_REQUEST', 400, '请输入1–500字的检索内容');
        return Response.json({ items: await searchFeishu(actor, q) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(await feishuState(actor), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return failure(e);
} }
export async function POST(request: Request) { if (request.headers.get('origin') !== new URL(process.env.APP_URL!).origin)
    return apiError('FORBIDDEN', 403); if (!request.headers.get('content-type')?.startsWith('application/json'))
    return apiError('BAD_REQUEST', 400); try {
    const c = await getApiWorkspaceContext();
    if (!c)
        return apiError('UNAUTHORIZED', 401);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 20000)
        return apiError('BAD_REQUEST', 413);
    let body: unknown;
    try {
        body = JSON.parse(raw);
    }
    catch {
        return apiError('BAD_REQUEST', 400);
    }
    const parsed = feishuInput.safeParse(body);
    if (!parsed.success)
        return apiError('BAD_REQUEST', 400, '配置格式不正确，请核对填写内容与团队共享确认');
    return Response.json(await mutateFeishu({ workspaceId: c.workspace.id, userId: c.session.user.id }, parsed.data), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return failure(e);
} }
