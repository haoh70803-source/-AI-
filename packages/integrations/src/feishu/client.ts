import { z } from 'zod';
import { FEISHU_API, FeishuError, unavailable } from './policy';
import { docxBlockSchema, feishuSpaceIdSchema, feishuTokenSchema, wikiNodeSchema, wikiSpaceSchema } from './contracts';
import type { FeishuPage, WikiNode, WikiSpace, ParsedDocx, DocxBlock } from './contracts';
import { parseDocxBlocks } from './docx';

export type FeishuSnapshot = { title: string; text: string; documentId: string; remoteRevision: string };
export type FeishuRequestLog = { operation: string; attempt: number; status: number; code: number; elapsedMs: number; requestId?: string };
export type FeishuClientOptions = {
  signal?: AbortSignal;
  now?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  log?: (event: FeishuRequestLog) => void;
};
const envelopeSchema = z.object({ code: z.number(), data: z.unknown().optional() }).passthrough();
const metadataSchema = z.object({ document: z.object({ title: z.string(), revision_id: z.number().int().positive() }) });
export function feishuExternalCallsAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.EXTERNAL_CALLS_DISABLED !== 'true' && env.LOCAL_REVIEW_OFFLINE !== 'true';
}
async function sleep(milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
function protocol<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new FeishuError(502, '飞书返回的数据结构不完整', 'PROTOCOL');
  return result.data;
}
function token(value: string) {
  if (!feishuTokenSchema.safeParse(value).success) throw new FeishuError(400, '飞书节点或文档编号格式不正确');
  return value;
}

export class FeishuClient {
  private cachedToken: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;
  private throttle: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private readonly now: () => number;
  private readonly wait: NonNullable<FeishuClientOptions['sleep']>;
  constructor(private appId: string, private secret: string, private transport: typeof fetch = fetch, private options: FeishuClientOptions = {}) {
    this.now = options.now ?? Date.now; this.wait = options.sleep ?? sleep;
  }
  private assertAvailable() {
    if (!feishuExternalCallsAllowed()) throw new FeishuError(503, '当前运行环境已关闭外部服务调用', 'OFFLINE');
    this.options.signal?.throwIfAborted();
  }
  private async reserveRequest() {
    const pending = this.throttle.catch(() => {}).then(async () => {
      this.assertAvailable();
      if (this.nextRequestAt > this.now()) await this.wait(this.nextRequestAt - this.now(), this.options.signal);
      this.nextRequestAt = this.now() + 150;
    });
    this.throttle = pending; await pending;
  }
  private log(event: FeishuRequestLog) {
    try { this.options.log?.(event); } catch { /* Logging cannot change API behavior. */ }
  }
  private async responseBody(response: Response): Promise<Record<string, unknown>> {
    if (Number(response.headers.get('content-length') ?? 0) > 4000000) {
      await response.body?.cancel(); throw new FeishuError(413, '飞书文档响应过大', 'LIMIT');
    }
    const reader = response.body?.getReader(), decoder = new TextDecoder();
    let raw = '', bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 4000000) { await reader.cancel(); throw new FeishuError(413, '飞书文档响应过大', 'LIMIT'); }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      } finally { reader.releaseLock(); }
    }
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new FeishuError(502, '飞书返回的内容无法解析', 'PROTOCOL'); }
    return protocol(envelopeSchema, value);
  }
  private async request(path: string, operation: string, init: RequestInit = {}, auth = true): Promise<Record<string, unknown>> {
    let refreshed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.assertAvailable();
      const accessToken = auth ? await this.accessToken() : null;
      await this.reserveRequest();
      const started = this.now();
      let response: Response, body: Record<string, unknown> | undefined;
      try {
        const timeout = AbortSignal.timeout(12000);
        response = await this.transport(FEISHU_API + path, {
          ...init, headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) },
          signal: this.options.signal ? AbortSignal.any([timeout, this.options.signal]) : timeout,
          redirect: 'error', cache: 'no-store',
        });
        // Rate limits and service failures may carry HTML rather than an API envelope.
        if (response.status !== 429 && response.status < 500) body = await this.responseBody(response);
      } catch (error) {
        this.options.signal?.throwIfAborted();
        this.log({ operation, attempt: attempt + 1, status: 0, code: -1, elapsedMs: this.now() - started });
        if (error instanceof FeishuError) throw error;
        if (attempt === 2) throw new FeishuError(502, '无法连接飞书，请检查网络后重试', 'NETWORK');
        await this.wait(300 * 2 ** attempt + Math.floor(Math.random() * 100), this.options.signal); continue;
      }
      const code = Number(body?.code ?? -1);
      const requestId = response.headers.get('x-tt-logid') ?? response.headers.get('x-request-id');
      this.log({ operation, attempt: attempt + 1, status: response.status, code, elapsedMs: this.now() - started,
        ...(requestId && /^[A-Za-z0-9_-]{1,128}$/.test(requestId) ? { requestId } : {}) });
      if (auth && [99991663, 99991664].includes(code) && !refreshed) { this.cachedToken = null; refreshed = true; continue; }
      if (response.status === 429 || response.status >= 500 || code === 99991400) {
        const limited = response.status === 429 || code === 99991400;
        if (attempt === 2) throw new FeishuError(limited ? 429 : 502, limited ? '飞书请求过于频繁，稍后重新同步' : '飞书服务暂不可用', limited ? 'RATE_LIMIT' : 'API');
        const header = response.headers.get('retry-after');
        const after = header ? (/^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - this.now()) : 0;
        if (Number.isFinite(after) && after > 10000) throw new FeishuError(429, '飞书要求稍后重试，请等待下一轮同步', 'RATE_LIMIT');
        await this.wait(Math.max(300 * 2 ** attempt + Math.floor(Math.random() * 100), Number.isFinite(after) ? after : 0), this.options.signal); continue;
      }
      if (!response.ok || code !== 0) {
        const diagnostic = `（接口 ${operation}，HTTP ${response.status}，错误码 ${code}${requestId && /^[A-Za-z0-9_-]{1,128}$/.test(requestId) ? '，请求编号 ' + requestId : ''}）`;
        if (auth && unavailable(response.status, code)) throw new FeishuError(403, '飞书拒绝访问，请核对当前应用的接口权限、空间/文档授权及对象状态' + diagnostic, 'UNAVAILABLE');
        throw new FeishuError(502, (auth ? '飞书读取失败，请核对接口权限与对象授权' : '飞书应用验证失败，请核对应用凭证与发布状态') + diagnostic, 'API');
      }
      return body!;
    }
    throw new FeishuError(502, '飞书访问凭证刷新失败', 'AUTH');
  }
  async accessToken(): Promise<string> {
    this.assertAvailable();
    if (this.cachedToken && this.cachedToken.expiresAt > this.now()) return this.cachedToken.value;
    if (this.tokenRequest) return this.tokenRequest;
    const pending = (async () => {
      const response = await this.request('/auth/v3/tenant_access_token/internal', 'auth.token', { method: 'POST', body: JSON.stringify({ app_id: this.appId, app_secret: this.secret }) }, false);
      const value = response.tenant_access_token;
      if (typeof value !== 'string' || !value) throw new FeishuError(502, '飞书未返回访问凭证', 'PROTOCOL');
      const lifetime = typeof response.expire === 'number' && response.expire > 0 ? response.expire * 1000 : 0;
      this.cachedToken = { value, expiresAt: this.now() + Math.max(0, lifetime - Math.min(60000, lifetime / 10)) };
      return value;
    })();
    this.tokenRequest = pending;
    try { return await pending; } finally { if (this.tokenRequest === pending) this.tokenRequest = null; }
  }
  private async page<T>(path: string, operation: string, schema: z.ZodType<T>, query: Record<string, string>): Promise<FeishuPage<T>> {
    const response = await this.request(path + '?' + new URLSearchParams(query), operation);
    const data = protocol(z.object({ items: z.array(schema), has_more: z.boolean(), page_token: z.string().optional() }), response.data);
    if (data.has_more && !data.page_token) throw new FeishuError(502, '飞书分页缺少下一页标记，未完成读取', 'PROTOCOL');
    return { items: data.items, hasMore: data.has_more, pageToken: data.has_more ? data.page_token! : null };
  }
  async listSpaces(pageToken?: string): Promise<FeishuPage<WikiSpace>> {
    return this.page('/wiki/v2/spaces', 'wiki.spaces', wikiSpaceSchema, { page_size: '50', ...(pageToken ? { page_token: pageToken } : {}) });
  }
  async listNodes(spaceId: string, parentToken?: string, pageToken?: string): Promise<FeishuPage<WikiNode>> {
    if (!feishuSpaceIdSchema.safeParse(spaceId).success) throw new FeishuError(400, '知识空间编号格式不正确');
    const query = { page_size: '50', ...(parentToken ? { parent_node_token: token(parentToken) } : {}), ...(pageToken ? { page_token: pageToken } : {}) };
    try {
      return await this.page('/wiki/v2/spaces/' + spaceId + '/nodes', 'wiki.nodes', wikiNodeSchema, query);
    } catch (error) {
      if (error instanceof FeishuError) throw new FeishuError(error.status, (parentToken ? '节点子目录读取失败：' : '空间根目录读取失败：') + error.message, error.reason);
      throw error;
    }
  }
  async getWikiNode(nodeToken: string): Promise<WikiNode> {
    const response = await this.request('/wiki/v2/spaces/get_node?token=' + token(nodeToken), 'wiki.node');
    return protocol(z.object({ node: wikiNodeSchema }), response.data).node;
  }
  /** A failed or truncated traversal throws; its yielded nodes never imply a complete scan. */
  async *walkWiki(spaceId: string, parentToken?: string, limits: { maxNodes?: number; maxDepth?: number; maxPages?: number } = {}): AsyncGenerator<WikiNode> {
    const maxNodes = limits.maxNodes ?? 10000, maxDepth = limits.maxDepth ?? 64, maxPages = limits.maxPages ?? 2000;
    for (const value of [maxNodes, maxDepth, maxPages]) if (!Number.isSafeInteger(value) || value < 1) throw new FeishuError(400, '目录读取预算不正确');
    const pending = [{ parent: parentToken, depth: 0 }], seen = new Set<string>(parentToken ? [parentToken] : []);
    let count = 0, pages = 0;
    for (let index = 0; index < pending.length; index++) {
      const current = pending[index]!, cursors = new Set<string>();
      let cursor: string | undefined;
      do {
        if (++pages > maxPages) throw new FeishuError(413, '目录超过分页读取预算，未完成遍历', 'LIMIT');
        const page = await this.listNodes(spaceId, current.parent, cursor);
        for (const node of page.items) {
          if ((node.space_id && node.space_id !== spaceId) || (node.parent_node_token ?? '') !== (current.parent ?? '')) throw new FeishuError(502, '飞书目录归属不一致，未完成遍历', 'PROTOCOL');
          if (seen.has(node.node_token)) throw new FeishuError(502, '飞书目录包含重复或循环节点，未完成遍历', 'PROTOCOL');
          if (++count > maxNodes) throw new FeishuError(413, '目录超过节点读取预算，未完成遍历', 'LIMIT');
          seen.add(node.node_token); yield node;
          if (node.has_child) {
            if (current.depth + 1 > maxDepth) throw new FeishuError(413, '目录超过层级读取预算，未完成遍历', 'LIMIT');
            pending.push({ parent: node.node_token, depth: current.depth + 1 });
          }
        }
        cursor = page.pageToken ?? undefined;
        if (cursor && cursors.has(cursor)) throw new FeishuError(502, '飞书返回重复分页标记，未完成遍历', 'PROTOCOL');
        if (cursor) cursors.add(cursor);
      } while (cursor);
    }
  }
  private async metadata(documentId: string) {
    return protocol(metadataSchema, (await this.request('/docx/v1/documents/' + token(documentId), 'docx.metadata')).data).document;
  }
  async readStructured(documentId: string): Promise<FeishuSnapshot & ParsedDocx> {
    const before = await this.metadata(documentId), blocks: DocxBlock[] = [], cursors = new Set<string>();
    let blockBytes = 0;
    let cursor: string | undefined;
    for (let pageIndex = 0; ; pageIndex++) {
      if (pageIndex >= 100) throw new FeishuError(413, '文档超过块分页读取预算，未完成读取', 'LIMIT');
      const page = await this.page('/docx/v1/documents/' + documentId + '/blocks', 'docx.blocks', docxBlockSchema, { page_size: '500', document_revision_id: '-1', ...(cursor ? { page_token: cursor } : {}) });
      blockBytes += Buffer.byteLength(JSON.stringify(page.items), 'utf8');
      if (blockBytes > 12000000) throw new FeishuError(413, '文档累计块数据超过读取预算，未完成读取', 'LIMIT');
      blocks.push(...page.items);
      if (blocks.length > 20000) throw new FeishuError(413, '文档超过块数量读取预算，未完成读取', 'LIMIT');
      cursor = page.pageToken ?? undefined;
      if (!cursor) break;
      if (cursors.has(cursor)) throw new FeishuError(502, '飞书文档返回重复分页标记', 'PROTOCOL');
      cursors.add(cursor);
    }
    const after = await this.metadata(documentId);
    if (before.revision_id !== after.revision_id) throw new FeishuError(409, '文档在读取时发生修改，请重新读取', 'CHANGED');
    return { ...parseDocxBlocks(blocks, documentId), title: before.title, documentId, remoteRevision: String(before.revision_id) };
  }
  /** Link subscriptions retain their protocol until versioned structured indexing is enabled. */
  async read(kind: string, sourceToken: string): Promise<FeishuSnapshot> {
    if (!['wiki', 'docx'].includes(kind)) throw new FeishuError(400, '此飞书对象类型暂不支持', 'UNSUPPORTED');
    let documentId = token(sourceToken);
    if (kind === 'wiki') {
      const response = await this.request('/wiki/v2/spaces/get_node?token=' + documentId, 'wiki.node');
      const node = protocol(z.object({ node: z.object({ obj_type: z.string(), obj_token: z.string() }) }), response.data).node;
      if (node.obj_type !== 'docx') throw new FeishuError(400, '此知识库对象类型暂不支持：' + node.obj_type, 'UNSUPPORTED');
      documentId = token(node.obj_token);
    }
    const before = await this.metadata(documentId);
    const content = protocol(z.object({ content: z.string() }), (await this.request('/docx/v1/documents/' + documentId + '/raw_content', 'docx.raw_content')).data).content;
    const after = await this.metadata(documentId);
    if (before.revision_id !== after.revision_id) throw new FeishuError(409, '文档在同步时发生修改，请重新同步', 'CHANGED');
    return { title: before.title, text: content, documentId, remoteRevision: String(before.revision_id) };
  }
}
