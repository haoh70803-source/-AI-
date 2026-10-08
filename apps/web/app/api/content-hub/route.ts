import { getApiWorkspaceContext, apiError } from '@/server/api-access';
import { readHub, mutateHub, HubError } from '@/server/content-governance/service';
import { hubInput } from '@/server/content-governance/policy';
export const dynamic = 'force-dynamic';
function error(e: unknown) { if (e instanceof HubError)
    return apiError('CONTENT_ERROR', e.status, e.message); console.error('CONTENT_GOVERNANCE_REQUEST_FAILED'); return apiError('INTERNAL_ERROR', 500, '操作未完成，请稍后重试'); }
export async function GET() { try {
    const c = await getApiWorkspaceContext();
    if (!c)
        return apiError('UNAUTHORIZED', 401);
    return Response.json(await readHub({ workspaceId: c.workspace.id, userId: c.session.user.id }), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    return error(e);
} }
export async function POST(request: Request) {
    if (request.headers.get('origin') !== new URL(process.env.APP_URL!).origin)
        return apiError('FORBIDDEN', 403, '请求来源不正确');
    if (!request.headers.get('content-type')?.startsWith('application/json'))
        return apiError('BAD_REQUEST', 400);
    try {
        const c = await getApiWorkspaceContext();
        if (!c)
            return apiError('UNAUTHORIZED', 401);
        const body = await request.text();
        if (Buffer.byteLength(body) > 64000)
            return apiError('BAD_REQUEST', 413, '内容过长');
        let value: unknown;
        try {
            value = JSON.parse(body);
        }
        catch {
            return apiError('BAD_REQUEST', 400, '请求格式错误');
        }
        const parsed = hubInput.safeParse(value);
        if (!parsed.success)
            return apiError('BAD_REQUEST', 400, parsed.error.issues[0]?.message);
        return Response.json(await mutateHub({ workspaceId: c.workspace.id, userId: c.session.user.id }, parsed.data));
    }
    catch (e) {
        return error(e);
    }
}
