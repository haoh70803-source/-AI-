import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('server-only', () => ({}));
import { db } from '@content-center/db';
import { parseFeishuUrl, terms, chunks, rankChunks, FeishuClient, FeishuError, feishuInput, configureFeishu, mutateFeishu, feishuState, syncFeishu, searchFeishu, ensureFeishuSource, type ClientFactory } from '@content-center/integrations';
import {MockLLMProvider} from '@content-center/providers';
import {runProjectAssistant} from '../server/assistant/service';
import { feishuLinks } from '../server/feishu/service';
describe('Feishu URL and retrieval policy', () => {
    it('normalizes only approved docx and wiki links', () => { expect(parseFeishuUrl('https://team.feishu.cn/wiki/abcdefghijkl?from=share').url).toBe('https://team.feishu.cn/wiki/abcdefghijkl'); expect(parseFeishuUrl('https://team.feishu.cn/docx/abcdefghijkl').kind).toBe('docx'); });
    it.each(['http://team.feishu.cn/docx/abcdefghijkl', 'https://team.feishu.cn.evil.test/docx/abcdefghijkl', 'https://127.0.0.1/docx/abcdefghijkl', 'https://user:secret@team.feishu.cn/docx/abcdefghijkl', 'https://team.feishu.cn:8443/docx/abcdefghijkl', 'https://team.feishu.cn/sheets/abcdefghijkl', 'https://team.feishu.cn/docx/a'])('rejects unsafe or unsupported URL %s', u => expect(() => parseFeishuUrl(u)).toThrow());
    it('indexes Chinese phrases and normalized English terms', () => { expect(terms('品牌定位 API 2026')).toEqual(expect.arrayContaining(['品牌', '定位', 'api', '2026'])); });
    it('preserves overlap and all trailing text', () => { const input = '品牌定位\n' + '方法'.repeat(1000); const c = chunks(input); expect(c.length).toBeGreaterThan(1); expect(c.at(-1)!.text.endsWith('方法')).toBe(true); expect(c[0]!.text.slice(700)).toBe(c[1]!.text.slice(0, 150)); });
    it('rejects giant documents', () => expect(() => chunks('x'.repeat(300001))).toThrow());
    it('ranks relevant chunks and skips unmatched terms', () => expect(rankChunks([{ text: '品牌定位', terms: terms('品牌定位') }, { text: '不相关', terms: terms('不相关') }], '品牌定位').map(r => r.text)).toEqual(['品牌定位']));
    it('requires explicit workspace sharing confirmation', () => expect(feishuInput.safeParse({ action: 'configure', appId: 'cli_test12345', appSecret: 'dummy-secret', revision: 0, enabled: true, autoSync: true, teamShared: false }).success).toBe(false));
});
describe('Feishu Open API protocol', () => {
    const appId = 'cli_test12345', secret = 'test-only-never-real';
    const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    it('authenticates server-side and reads meta/body with revision consistency', async () => { const calls: {
        url: string;
        init?: RequestInit;
    }[] = [], transport = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(url), init }); return response(String(url).includes('/auth/') ? { code: 0, tenant_access_token: 'fake-token' } : String(url).endsWith('/raw_content') ? { code: 0, data: { content: '品牌定位正文' } } : { code: 0, data: { document: { title: '品牌方法', revision_id: 2 } } }); }); const c = new FeishuClient(appId, secret, transport as typeof fetch), r = await c.read('docx', 'abcdefghijkl'); expect(r.text).toBe('品牌定位正文'); expect(r.remoteRevision).toBe('2'); expect(calls.every(c => c.url.startsWith('https://open.feishu.cn/open-apis/'))).toBe(true); expect(calls[1]!.init?.headers).toMatchObject({ Authorization: 'Bearer fake-token' }); expect(calls[0]!.init?.body).toContain(secret); expect(calls.every(c => c.init?.redirect === 'error')).toBe(true); });
    it('resolves wiki nodes to actual docx tokens', async () => { const transport = vi.fn(async (url: RequestInfo | URL) => response(String(url).includes('/auth/') ? { code: 0, tenant_access_token: 'fake' } : String(url).includes('/wiki/') ? { code: 0, data: { node: { obj_type: 'docx', obj_token: 'documenttoken123' } } } : String(url).endsWith('/raw_content') ? { code: 0, data: { content: '案例' } } : { code: 0, data: { document: { title: '案例', revision_id: 1 } } })); expect((await new FeishuClient(appId, secret, transport as typeof fetch).read('wiki', 'wikientrytoken')).documentId).toBe('documenttoken123'); });
    it('permission error never reflects upstream message or secrets', async () => { const transport = vi.fn(async (url: RequestInfo | URL) => response(String(url).includes('/auth/') ? { code: 0, tenant_access_token: 'fake' } : { code: 1770032, msg: secret })); await expect(new FeishuClient(appId, secret, transport as typeof fetch).read('docx', 'abcdefghijkl')).rejects.toMatchObject({ reason: 'UNAVAILABLE', status: 403 }); try {
        await new FeishuClient(appId, secret, transport as typeof fetch).read('docx', 'abcdefghijkl');
    }
    catch (e) {
        expect((e as Error).message).not.toContain(secret);
    } });
    it('revision changes during the read do not index mixed versions', async () => { let n = 0; const transport = vi.fn(async (url: RequestInfo | URL) => response(String(url).includes('/auth/') ? { code: 0, tenant_access_token: 'fake' } : String(url).endsWith('/raw_content') ? { code: 0, data: { content: '正文' } } : { code: 0, data: { document: { title: '正文', revision_id: ++n } } })); await expect(new FeishuClient(appId, secret, transport as typeof fetch).read('docx', 'abcdefghijkl')).rejects.toMatchObject({ reason: 'CHANGED' }); });
    it('rejects wiki spreadsheet nodes', async () => { const transport = vi.fn(async (url: RequestInfo | URL) => response(String(url).includes('/auth/') ? { code: 0, tenant_access_token: 'fake' } : { code: 0, data: { node: { obj_type: 'sheet', obj_token: 'abcdefghijkl' } } })); await expect(new FeishuClient(appId, secret, transport as typeof fetch).read('wiki', 'wikientrytoken')).rejects.toMatchObject({ status: 400 }); });
});
describe('Feishu persistence and authorization lifecycle', () => {
    const prefix = 'feishu-test-' + randomUUID(), users: string[] = [], spaces: string[] = [];
    let actor: {
        workspaceId: string;
        userId: string;
    }, viewer: typeof actor, other: typeof actor, id: string, sourceId: string, revision = 1, text = '品牌定位：鑫世界专注内容团队。方法论：脚本先确定受众，再设计视频开头。', version = 1, mode = 'OK', videoBefore = 0;
    const create: ClientFactory = () => ({ accessToken: async () => { if (mode === 'AUTH')
            throw new FeishuError(502, '测试凭据失效'); return 'mock'; }, read: async () => { if (mode === 'REVOKED')
            throw new FeishuError(403, '测试撤权', 'UNAVAILABLE'); if (mode === 'NETWORK')
            throw new FeishuError(502, '测试网络失败', 'NETWORK'); return { title: '品牌与脚本方法', text, documentId: 'documenttoken123', remoteRevision: String(version) }; } });
    beforeAll(async () => { videoBefore = await db.videoDailyMetric.count(); for (let n = 0; n < 3; n++) {
        const user = await db.user.create({ data: { name: prefix, email: prefix + n + '@test.invalid' } });
        users.push(user.id);
    } const w = await db.workspace.create({ data: { name: prefix, slug: prefix, members: { create: [{ userId: users[0]!, role: 'OWNER' }, { userId: users[1]!, role: 'VIEWER' }] } } }); spaces.push(w.id); actor = { workspaceId: w.id, userId: users[0]! }; viewer = { workspaceId: w.id, userId: users[1]! }; const w2 = await db.workspace.create({ data: { name: prefix + 'other', slug: prefix + 'other', members: { create: { userId: users[2]!, role: 'OWNER' } } } }); spaces.push(w2.id); other = { workspaceId: w2.id, userId: users[2]! }; await configureFeishu(actor, { action: 'configure', appId: 'cli_test12345', appSecret: 'test-only-secret-123', revision: 0, enabled: true, autoSync: true, teamShared: true }); });
    afterAll(async () => { await db.workspace.deleteMany({ where: { id: { in: spaces } } }); await db.user.deleteMany({ where: { id: { in: users } } }); expect(await db.videoDailyMetric.count()).toBe(videoBefore); });
    it('encrypts credentials and state responses never return them', async () => { const c = await db.feishuConnection.findUniqueOrThrow({ where: { workspaceId: actor.workspaceId } }); expect(c.encryptedSecret).not.toContain('test-only-secret-123'); expect(JSON.stringify(await feishuState(viewer))).not.toContain('encryptedSecret'); expect(JSON.stringify(await feishuState(viewer))).not.toContain('test-only-secret-123'); });
    it('VIEWER cannot configure subscriptions', async () => await expect(mutateFeishu(viewer, { action: 'add', url: 'https://team.feishu.cn/docx/documenttoken123', category: 'METHOD' }, create)).rejects.toMatchObject({ status: 403 }));
    it('adds docx through the application service and indexes actual content', async () => { const r = await mutateFeishu(actor, { action: 'add', url: 'https://team.feishu.cn/docx/documenttoken123', category: 'METHOD' }, create) as {
        id: string;
    }; id = r.id; const doc = await db.feishuDocument.findUniqueOrThrow({ where: { id } }); sourceId = doc.sourceItemId; expect(doc.state).toBe('READY'); expect(await db.feishuChunk.count({ where: { documentId: id } })).toBeGreaterThan(0); expect((await db.sourceItem.findUniqueOrThrow({ where: { id: sourceId } })).rawText).toBe(text); });
    it('deduplicates subscribed links', async () => await expect(mutateFeishu(actor, { action: 'add', url: 'https://team.feishu.cn/docx/documenttoken123?from=share', category: 'BRAND' }, create)).rejects.toMatchObject({ status: 409 }));
    it('team reader retrieves relevant chunks with original links', async () => { const r = await searchFeishu(viewer, '品牌定位', create); expect(r[0]?.url).toBe('https://team.feishu.cn/docx/documenttoken123'); expect(r[0]?.text).toContain('鑫世界'); });
    it('cross-workspace identity cannot read shared source', async () => await expect(ensureFeishuSource({ ...other, workspaceId: actor.workspaceId }, sourceId, create)).rejects.toMatchObject({ status: 403 }));
    it('different workspace has no matches', async () => expect(await searchFeishu(other, '品牌定位', create)).toEqual([]));
    it('updates changed documents and replaces old chunks', async () => { text = '全新方法：先分析用户痛点，再生成品牌脚本。'; version = 2; await syncFeishu(actor.workspaceId, true, create); expect((await db.sourceItem.findUniqueOrThrow({ where: { id: sourceId } })).rawText).toBe(text); expect((await db.feishuChunk.findMany({ where: { documentId: id } })).some(c => c.text.includes('鑫世界'))).toBe(false); });
    it('unchanged revision does not create duplicate chunks', async () => { const before = await db.feishuChunk.findMany({ where: { documentId: id } }); await syncFeishu(actor.workspaceId, true, create); expect((await db.feishuChunk.findMany({ where: { documentId: id } })).map(c => c.id)).toEqual(before.map(c => c.id)); });
    it('permission withdrawal clears stored body and all retrieval chunks', async () => { mode = 'REVOKED'; await syncFeishu(actor.workspaceId, true, create); expect(await db.feishuChunk.count({ where: { documentId: id } })).toBe(0); expect((await db.sourceItem.findUniqueOrThrow({ where: { id: sourceId } })).rawText).toBeNull(); expect((await db.feishuDocument.findUniqueOrThrow({ where: { id } })).state).toBe('UNAVAILABLE'); expect(await searchFeishu(actor, '品牌', create)).toEqual([]); });
    it('source read fails closed after permission withdrawal', async () => await expect(ensureFeishuSource(actor, sourceId, create)).rejects.toMatchObject({ status: 403 }));
    it('reauthorization restores the same source identity', async () => { mode = 'OK'; await syncFeishu(actor.workspaceId, true, create); expect((await db.feishuDocument.findUniqueOrThrow({ where: { id } })).sourceItemId).toBe(sourceId); expect((await db.sourceItem.findUniqueOrThrow({ where: { id: sourceId } })).status).toBe('READY'); });
    it('network failure excludes old cached content', async () => { mode = 'NETWORK'; await syncFeishu(actor.workspaceId, true, create); expect(await db.feishuChunk.count({ where: { documentId: id } })).toBe(0); expect((await db.sourceItem.findUniqueOrThrow({ where: { id: sourceId } })).rawText).toBeNull(); mode = 'OK'; await syncFeishu(actor.workspaceId, true, create); });
    it('stopping subscription immediately clears its body and survives refresh', async () => { await mutateFeishu(actor, { action: 'remove', id, revision }, create); revision++; await syncFeishu(actor.workspaceId, true, create); expect((await db.feishuDocument.findUniqueOrThrow({ where: { id } })).state).toBe('REMOVED'); expect(await db.feishuChunk.count({ where: { documentId: id } })).toBe(0); });
    it('restoring subscription requires a successful fresh sync', async () => { await mutateFeishu(actor, { action: 'restore', id, revision }, create); revision++; expect((await db.feishuDocument.findUniqueOrThrow({ where: { id } })).state).toBe('PENDING'); await syncFeishu(actor.workspaceId, true, create); expect((await db.feishuDocument.findUniqueOrThrow({ where: { id } })).state).toBe('READY'); });
    it('optimistic revisions reject outdated removal', async () => await expect(mutateFeishu(actor, { action: 'remove', id, revision: 1 }, create)).rejects.toMatchObject({ status: 409 }));
    it('authentication failure purges the whole authorized index', async () => { mode = 'AUTH'; await expect(syncFeishu(actor.workspaceId, true, create)).rejects.toMatchObject({ status: 502 }); expect(await db.feishuChunk.count({ where: { workspaceId: actor.workspaceId } })).toBe(0); mode = 'OK'; await syncFeishu(actor.workspaceId, true, create); });
    it('retrieves Feishu before script generation and persists original links in result',async()=>{
      const token=vi.spyOn(FeishuClient.prototype,'accessToken').mockResolvedValue('fake');
      const remote=vi.spyOn(FeishuClient.prototype,'read').mockResolvedValue({title:'品牌与脚本方法',text,documentId:'documenttoken123',remoteRevision:String(version)});
      try {
        const project=await db.contentProject.create({data:{workspaceId:actor.workspaceId,createdById:actor.userId,title:'品牌脚本测试'}});
        const provider=new MockLLMProvider(()=> '品牌脚本草稿：先明确用户痛点，再介绍解决方法。');
        const result=await runProjectAssistant({...actor,projectId:project.id,content:'请根据品牌资料生成脚本'},()=>undefined,{runtime:{provider,providerName:'KIMI',model:'kimi-k2.6',requestedModel:'kimi-k2.6',mode:'REAL'}});
        expect(result.status).toBe('COMPLETED');expect(result.content).toContain('https://team.feishu.cn/docx/documenttoken123');
        const record=await db.assistantMessage.findUniqueOrThrow({where:{id:result.id},include:{aiRun:true}});expect(JSON.stringify(record.aiRun?.metadata)).toContain('feishu_authorized_document');expect(JSON.stringify(record.aiRun?.metadata)).toContain('先分析用户痛点');
      }finally{token.mockRestore();remote.mockRestore()}
    });
    it('disconnect purges data and disables future sync', async () => { const c = await db.feishuConnection.findUniqueOrThrow({ where: { workspaceId: actor.workspaceId } }); await mutateFeishu(actor, { action: 'disconnect', revision: c.revision }, create); expect((await syncFeishu(actor.workspaceId, true, create)).status).toBe('DISABLED'); expect(await db.feishuChunk.count({ where: { workspaceId: actor.workspaceId } })).toBe(0); expect((await db.sourceItem.findUniqueOrThrow({ where: { id: sourceId } })).rawText).toBeNull(); });
    it('reference footer only includes verified Feishu items and deduplicates links', () => { const item = { objectType: 'SOURCE_ITEM', objectId: sourceId, ownership: 'EXTERNAL' as const, provenance: 'feishu_authorized_document', whySelected: '检索', version: 2, truncated: false, content: '正文', source: { sourceType: 'MATERIAL' as const, sourceId, title: '品牌', href: 'https://team.feishu.cn/docx/documenttoken123', generated: false } }; expect(feishuLinks([item, item]).match(/https:/g)).toHaveLength(1); expect(feishuLinks([])).toBe(''); });
});
