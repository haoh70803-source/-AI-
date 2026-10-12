import { getApiWorkspaceContext, apiError } from '@/server/api-access';
import { browseFeishuWiki } from '@/server/knowledge/feishu-browse';
import { FeishuError, feishuBrowseInput } from '@content-center/integrations';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!process.env.APP_URL || origin !== new URL(process.env.APP_URL).origin) return apiError('FORBIDDEN', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return apiError('BAD_REQUEST', 400);
  try {
    const context = await getApiWorkspaceContext();
    if (!context) return apiError('UNAUTHORIZED', 401);
    if (!['OWNER', 'ADMIN'].includes(context.role)) return apiError('FORBIDDEN', 403);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 10000) return apiError('BAD_REQUEST', 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return apiError('BAD_REQUEST', 400); }
    const parsed = feishuBrowseInput.safeParse(body);
    if (!parsed.success) return apiError('BAD_REQUEST', 400, '目录读取参数不正确');
    const result = await browseFeishuWiki({ workspaceId: context.workspace.id, userId: context.session.user.id }, parsed.data,
      AbortSignal.any([request.signal, AbortSignal.timeout(30000)]));
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof FeishuError) return apiError(error.reason, error.status, error.message);
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return apiError('TIMEOUT', 504, '本次读取已取消或超过时间预算，没有完成读取');
    console.error('FEISHU_BROWSE_FAILED');
    return apiError('FEISHU_ERROR', 503, '飞书目录读取失败，请检查授权或稍后重试');
  }
}
