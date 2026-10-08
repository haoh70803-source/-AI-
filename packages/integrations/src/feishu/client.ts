import { FEISHU_API, FeishuError, unavailable } from './policy';
export type FeishuSnapshot = {
    title: string;
    text: string;
    documentId: string;
    remoteRevision: string;
};
export class FeishuClient {
    private token: string | null = null;
    constructor(private appId: string, private secret: string, private transport: typeof fetch = fetch) { }
    private async request(path: string, init: RequestInit = {}, auth = true): Promise<Record<string, unknown>> {
        let response: Response;
        try {
            response = await this.transport(FEISHU_API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + await this.accessToken() } : {}), ...init.headers }, signal: AbortSignal.timeout(12000), redirect: 'error', cache: 'no-store' });
        }
        catch {
            throw new FeishuError(502, '无法连接飞书，请检查网络后重试', 'NETWORK');
        }
        if (Number(response.headers.get('content-length') ?? 0) > 4000000)
            throw new FeishuError(413, '飞书文档响应过大');
        const reader = response.body?.getReader();
        let raw = '';
        if (reader) {
            const decoder = new TextDecoder();
            let bytes = 0;
            for (;;) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                bytes += value.length;
                if (bytes > 4000000) {
                    await reader.cancel();
                    throw new FeishuError(413, '飞书文档响应过大');
                }
                raw += decoder.decode(value, { stream: true });
            }
            raw += decoder.decode();
        }
        let body: Record<string, unknown>;
        try {
            body = JSON.parse(raw);
        }
        catch {
            throw new FeishuError(502, '飞书返回的内容无法解析');
        }
        const code = Number(body.code ?? -1);
        if (!response.ok || code !== 0) {
            if (unavailable(response.status, code))
                throw new FeishuError(403, '文档已删除或应用失去阅读权限；已移除本地正文与检索索引', 'UNAVAILABLE');
            if (response.status === 429 || code === 99991400)
                throw new FeishuError(429, '飞书请求过于频繁，稍后重新同步', 'RATE_LIMIT');
            throw new FeishuError(502, auth ? '飞书读取失败，请核对接口权限与文档授权（错误码 ' + code + '）' : '飞书应用验证失败，请核对 App ID、App Secret 及发布状态（错误码 ' + code + '）', 'API');
        }
        return body;
    }
    async accessToken() { if (this.token)
        return this.token; const r = await this.request('/auth/v3/tenant_access_token/internal', { method: 'POST', body: JSON.stringify({ app_id: this.appId, app_secret: this.secret }) }, false); if (typeof r.tenant_access_token !== 'string')
        throw new FeishuError(502, '飞书未返回访问凭证'); return this.token = r.tenant_access_token; }
    async read(kind: string, token: string): Promise<FeishuSnapshot> {
        let id = token;
        if (kind === 'wiki') {
            const r = await this.request('/wiki/v2/spaces/get_node?token=' + encodeURIComponent(token));
            const node = (r.data as {
                node?: {
                    obj_type: string;
                    obj_token: string;
                };
            })?.node;
            if (!node || node.obj_type !== 'docx' || !node.obj_token)
                throw new FeishuError(400, '此知识库节点不是新版文档，首期不支持表格、附件或多维表格');
            id = node.obj_token;
        }
        if (!/^[A-Za-z0-9]{10,100}$/.test(id))
            throw new FeishuError(502, '飞书返回的文档编号不正确');
        const meta = await this.request('/docx/v1/documents/' + id), body = await this.request('/docx/v1/documents/' + id + '/raw_content');
        const doc = (meta.data as {
            document?: {
                title: string;
                revision_id: number;
            };
        })?.document, content = (body.data as {
            content?: string;
        })?.content;
        if (!doc || typeof doc.title !== 'string' || typeof content !== 'string')
            throw new FeishuError(502, '飞书未返回完整的标题与正文');
        const after = await this.request('/docx/v1/documents/' + id);
        const rev = (after.data as {
            document?: {
                revision_id: number;
            };
        })?.document?.revision_id;
        if (rev !== doc.revision_id)
            throw new FeishuError(409, '文档在同步时发生修改，请重新同步', 'CHANGED');
        return { title: doc.title, text: content, documentId: id, remoteRevision: String(doc.revision_id) };
    }
}
