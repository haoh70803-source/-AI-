import { randomUUID } from 'node:crypto';
import { db, type Prisma } from '@content-center/db';
import { encryptSecret, decryptSecret, parseMasterEncryptionKey } from '../encryption';
import { FeishuClient } from './client';
import { FeishuError, MAX_DOCUMENTS, parseFeishuUrl, chunks, contentHash, terms, rankChunks, feishuInput } from './policy';
type Actor = {
    workspaceId: string;
    userId: string;
};
type Tx = Prisma.TransactionClient;
const json = (x: unknown) => x as Prisma.InputJsonValue;
const admin = (role: string) => ['OWNER', 'ADMIN'].includes(role);
export async function feishuMember(a: Actor, write = false) { const m = await db.workspaceMember.findFirst({ where: { workspaceId: a.workspaceId, userId: a.userId, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } } }); if (!m || write && !admin(m.role))
    throw new FeishuError(403, write ? '仅管理员和所有者可设置飞书资料源' : '没有工作空间访问权限'); return m; }
async function purge(tx: Tx, workspaceId: string, ids: string[]) { if (!ids.length)
    return; await tx.feishuChunk.deleteMany({ where: { workspaceId, document: { sourceItemId: { in: ids } } } }); await tx.transcript.deleteMany({ where: { workspaceId, sourceItemId: { in: ids } } }); await tx.sourceItem.updateMany({ where: { workspaceId, id: { in: ids }, sourceProvider: 'FEISHU' }, data: { rawText: null, status: 'ARCHIVED' } }); }
async function audit(tx: Tx, a: Actor, action: string, id: string, metadata: unknown = {}) { await tx.auditLog.create({ data: { ...a, action: 'feishu.' + action, resourceType: 'feishu', resourceId: id, metadata: json(metadata) } }); }
export async function feishuState(a: Actor) { const m = await feishuMember(a); const c = await db.feishuConnection.findUnique({ where: { workspaceId: a.workspaceId }, select: { id: true, appId: true, enabled: true, autoSync: true, revision: true, lastAttemptAt: true, lastSyncedAt: true, lastError: true, leaseUntil: true } }); const documents = c ? await db.feishuDocument.findMany({ where: { workspaceId: a.workspaceId, connectionId: c.id }, select: { id: true, kind: true, originalUrl: true, category: true, state: true, revision: true, checkedAt: true, syncedAt: true, lastError: true, sourceItemId: true, sourceItem: { select: { title: true, status: true } }, _count: { select: { chunks: true } } }, orderBy: { createdAt: 'asc' } }) : []; return { role: m.role, connection: c, documents, intervalMinutes: 5, maxDocuments: MAX_DOCUMENTS }; }
export async function configureFeishu(a: Actor, input: zInput) {
    await feishuMember(a, true);
    const c = await db.feishuConnection.findUnique({ where: { workspaceId: a.workspaceId } });
    if ((c?.revision ?? 0) !== input.revision)
        throw new FeishuError(409, '配置已变化，请刷新后重试');
    if (!input.appSecret && (!c || c.appId !== input.appId))
        throw new FeishuError(400, '首次设置或更换应用时需填写 App Secret');
    const encryptedSecret = input.appSecret ? JSON.stringify(encryptSecret(input.appSecret, parseMasterEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY))) : c!.encryptedSecret;
    return db.$transaction(async (tx) => { await tx.workspaceMember.findFirstOrThrow({ where: { workspaceId: a.workspaceId, userId: a.userId, disabledAt: null, role: { in: ['OWNER', 'ADMIN'] }, user: { disabledAt: null }, workspace: { disabledAt: null } } }); const current = await tx.feishuConnection.findUnique({ where: { workspaceId: a.workspaceId } }); if ((current?.revision ?? 0) !== input.revision)
        throw new FeishuError(409, '配置已变化，请刷新后重试'); if (c) {
        const docs = await tx.feishuDocument.findMany({ where: { workspaceId: a.workspaceId }, select: { sourceItemId: true } });
        await purge(tx, a.workspaceId, docs.map(d => d.sourceItemId));
        await tx.feishuDocument.updateMany({ where: { workspaceId: a.workspaceId, state: { not: 'REMOVED' } }, data: { state: 'PENDING', checkedAt: null, contentHash: null, revision: { increment: 1 } } });
    } const result = await tx.feishuConnection.upsert({ where: { workspaceId: a.workspaceId }, create: { workspaceId: a.workspaceId, createdById: a.userId, appId: input.appId, encryptedSecret, enabled: input.enabled, autoSync: input.autoSync }, update: { createdById: a.userId, appId: input.appId, encryptedSecret, enabled: input.enabled, autoSync: input.autoSync, revision: { increment: 1 }, leaseOwner: null, leaseUntil: null, lastAttemptAt: null, lastError: null } }); await audit(tx, a, 'configured', result.id, { appId: input.appId, enabled: input.enabled, autoSync: input.autoSync, teamShared: true }); return { ok: true }; }, { isolationLevel: 'Serializable' });
}
type zInput = Extract<ReturnType<typeof feishuInput.parse>, {
    action: 'configure';
}>;
export type ClientFactory = (appId: string, secret: string) => Pick<FeishuClient, 'read' | 'accessToken'>;
const factory: ClientFactory = (appId, secret) => new FeishuClient(appId, secret);
function client(c: {
    appId: string;
    encryptedSecret: string;
}, create: ClientFactory) { return create(c.appId, decryptSecret(c.encryptedSecret, parseMasterEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY))); }
export async function syncFeishu(workspaceId: string, force = false, create: ClientFactory = factory) {
    const c = await db.feishuConnection.findUnique({ where: { workspaceId } });
    if (!c?.enabled)
        return { status: 'DISABLED', synced: 0 };
    await feishuMember({ workspaceId, userId: c.createdById }, true);
    const now = new Date();
    if (!force && (!c.autoSync || c.lastAttemptAt && now.getTime() - c.lastAttemptAt.getTime() < 300000))
        return { status: 'NOT_DUE', synced: 0 };
    const lease = randomUUID(), acquired = await db.feishuConnection.updateMany({ where: { id: c.id, enabled: true, revision: c.revision, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseOwner: lease, leaseUntil: new Date(Date.now() + 90000), lastAttemptAt: now } });
    if (!acquired.count)
        return { status: 'BUSY', synced: 0 };
    let synced = 0, failed = 0;
    try {
        const remote = client(c, create);
        await remote.accessToken();
        const docs = await db.feishuDocument.findMany({ where: { workspaceId, connectionId: c.id, state: { not: 'REMOVED' } }, include: { sourceItem: { select: { status: true } } }, orderBy: { createdAt: 'asc' }, take: MAX_DOCUMENTS });
        for (const d of docs) {
            const renewed = await db.feishuConnection.updateMany({ where: { id: c.id, revision: c.revision, enabled: true, leaseOwner: lease }, data: { leaseUntil: new Date(Date.now() + 90000) } });
            if (!renewed.count)
                break;
            try {
                const snapshot = await remote.read(d.kind, d.token), parts = chunks(snapshot.text, snapshot.title), hash = contentHash(snapshot.text, snapshot.title, snapshot.remoteRevision);
                await db.$transaction(async (tx) => {
                    const valid = await tx.feishuConnection.findFirst({ where: { id: c.id, workspaceId, enabled: true, revision: c.revision, leaseOwner: lease } }), doc = await tx.feishuDocument.findFirst({ where: { id: d.id, workspaceId, revision: d.revision, state: { not: 'REMOVED' } } });
                    if (!valid || !doc)
                        return;
                    if (d.contentHash !== hash || d.state !== 'READY') {
                        await tx.feishuChunk.deleteMany({ where: { documentId: d.id, workspaceId } });
                        if (parts.length)
                            await tx.feishuChunk.createMany({ data: parts.map(p => ({ ...p, documentId: d.id, workspaceId })) });
                        await tx.sourceItem.update({ where: { id: d.sourceItemId }, data: { title: snapshot.title || '飞书文档', rawText: snapshot.text, author: '飞书 · ' + ({ METHOD: '方法论', CASE: '案例', BRAND: '品牌资料', OTHER: '其他' }[d.category] ?? '资料'), description: '飞书授权团队资料 · 原文持续同步', status: 'READY' } });
                        await tx.transcript.deleteMany({ where: { workspaceId, sourceItemId: d.sourceItemId } });
                        await tx.materialAnalysis.updateMany({ where: { workspaceId, sourceItemId: d.sourceItemId, status: 'COMPLETED' }, data: { status: 'FAILED', errorCode: 'SOURCE_CHANGED', errorMessage: '飞书原文已更新，请重新分析' } });
                        await tx.materialDistillation.updateMany({ where: { workspaceId, sourceItemId: d.sourceItemId, status: 'COMPLETED' }, data: { status: 'FAILED', errorCode: 'SOURCE_CHANGED', errorMessage: '飞书原文已更新，请重新整理' } });
                        await audit(tx, { workspaceId, userId: c.createdById }, 'indexed', d.id, { remoteRevision: snapshot.remoteRevision, chunks: parts.length });
                    }
                    await tx.feishuDocument.update({ where: { id: d.id }, data: { documentId: snapshot.documentId, remoteRevision: snapshot.remoteRevision, contentHash: hash, state: 'READY', checkedAt: new Date(), syncedAt: new Date(), lastError: null } });
                }, { isolationLevel: 'Serializable', timeout: 20000 });
                synced++;
            }
            catch (error) {
                failed++;
                const e = error instanceof FeishuError ? error : new FeishuError(502, '同步未完成，请重试');
                await db.$transaction(async (tx) => { if (!await tx.feishuConnection.findFirst({ where: { id: c.id, revision: c.revision, leaseOwner: lease } }) || !await tx.feishuDocument.findFirst({ where: { id: d.id, workspaceId, revision: d.revision, state: { not: 'REMOVED' } } }))
                    return; await purge(tx, workspaceId, [d.sourceItemId]); await tx.feishuDocument.update({ where: { id: d.id }, data: { state: e.reason === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'ERROR', checkedAt: new Date(), lastError: e.message, contentHash: null } }); await audit(tx, { workspaceId, userId: c.createdById }, 'excluded', d.id, { reason: e.reason }); });
            }
        }
        await db.feishuConnection.updateMany({ where: { id: c.id, revision: c.revision, leaseOwner: lease }, data: { lastSyncedAt: new Date(), lastError: failed ? `${failed} 份资料读取失败并已退出索引，请查看各项原因` : null } });
        return { status: failed ? 'PARTIAL' : 'SYNCED', synced, failed };
    }
    catch (error) {
        const e = error instanceof FeishuError ? error : new FeishuError(503, '飞书凭据无法使用，请检查配置');
        await db.$transaction(async (tx) => { if (!await tx.feishuConnection.findFirst({ where: { id: c.id, revision: c.revision, leaseOwner: lease } }))
            return; const docs = await tx.feishuDocument.findMany({ where: { workspaceId, connectionId: c.id, state: { not: 'REMOVED' } }, select: { sourceItemId: true } }); await purge(tx, workspaceId, docs.map(d => d.sourceItemId)); await tx.feishuDocument.updateMany({ where: { workspaceId, connectionId: c.id, state: { not: 'REMOVED' } }, data: { state: 'ERROR', contentHash: null, checkedAt: new Date(), lastError: e.message } }); await tx.feishuConnection.update({ where: { id: c.id }, data: { lastError: e.message } }); });
        throw e;
    }
    finally {
        await db.feishuConnection.updateMany({ where: { id: c.id, leaseOwner: lease }, data: { leaseOwner: null, leaseUntil: null } });
    }
}
export async function mutateFeishu(a: Actor, input: ReturnType<typeof feishuInput.parse>, create: ClientFactory = factory) {
    await feishuMember(a, true);
    if (input.action === 'configure')
        return configureFeishu(a, input);
    const c = await db.feishuConnection.findUnique({ where: { workspaceId: a.workspaceId } });
    if (!c)
        throw new FeishuError(400, '请先设置飞书应用');
    if (input.action === 'test') {
        await client(c, create).accessToken();
        return { ok: true, message: '应用凭证有效；文档权限会在同步时逐份核验' };
    }
    if (input.action === 'sync')
        return syncFeishu(a.workspaceId, true, create);
    if (input.action === 'add') {
        const link = parseFeishuUrl(input.url);
        if (!c.enabled)
            throw new FeishuError(400, '请先启用飞书连接');
        const result = await db.$transaction(async (tx) => { if (await tx.feishuDocument.count({ where: { connectionId: c.id } }) >= MAX_DOCUMENTS)
            throw new FeishuError(400, '首期最多订阅20份文档'); const exists = await tx.feishuDocument.findUnique({ where: { connectionId_kind_token: { connectionId: c.id, kind: link.kind, token: link.token } } }); if (exists)
            throw new FeishuError(409, '文档已订阅，请恢复已有记录或直接同步'); const source = await tx.sourceItem.create({ data: { workspaceId: a.workspaceId, createdById: a.userId, sourceType: 'DOCUMENT', sourcePlatform: 'OTHER', sourceProvider: 'FEISHU', sourceUrl: link.url, canonicalUrl: link.url, title: '飞书文档 · 等待同步', status: 'PENDING' } }); const d = await tx.feishuDocument.create({ data: { workspaceId: a.workspaceId, connectionId: c.id, sourceItemId: source.id, kind: link.kind, token: link.token, originalUrl: link.url, category: input.category } }); await audit(tx, a, 'subscribed', d.id, { kind: link.kind, category: input.category }); return { id: d.id }; }, { isolationLevel: 'Serializable' });
        await syncFeishu(a.workspaceId, true, create).catch(() => undefined);
        return result;
    }
    return db.$transaction(async (tx) => {
        if (input.action === 'disconnect') {
            const changed = await tx.feishuConnection.updateMany({ where: { id: c.id, workspaceId: a.workspaceId, revision: input.revision }, data: { enabled: false, revision: { increment: 1 }, leaseUntil: null, leaseOwner: null } });
            if (!changed.count)
                throw new FeishuError(409, '配置已变化，请刷新');
            const docs = await tx.feishuDocument.findMany({ where: { workspaceId: a.workspaceId }, select: { sourceItemId: true } });
            await purge(tx, a.workspaceId, docs.map(d => d.sourceItemId));
            await tx.feishuDocument.updateMany({ where: { workspaceId: a.workspaceId, state: { not: 'REMOVED' } }, data: { state: 'PENDING', contentHash: null, checkedAt: null, revision: { increment: 1 } } });
            await audit(tx, a, 'disconnected', c.id);
            return { ok: true };
        }
        const d = await tx.feishuDocument.findFirst({ where: { id: input.id, workspaceId: a.workspaceId, connectionId: c.id } });
        if (!d)
            throw new FeishuError(404, '文档不存在');
        const changed = await tx.feishuDocument.updateMany({ where: { id: d.id, workspaceId: a.workspaceId, revision: input.revision }, data: { state: input.action === 'remove' ? 'REMOVED' : 'PENDING', revision: { increment: 1 }, checkedAt: null, contentHash: null, lastError: null } });
        if (!changed.count)
            throw new FeishuError(409, '文档状态已变化，请刷新');
        await purge(tx, a.workspaceId, [d.sourceItemId]);
        await audit(tx, a, input.action, d.id);
        return { ok: true };
    }, { isolationLevel: 'Serializable' });
}
export async function searchFeishu(a: Actor, query: string, create: ClientFactory = factory) { await feishuMember(a); const q = terms(query).slice(0, 100); if (!q.length)
    return []; const c = await db.feishuConnection.findUnique({ where: { workspaceId: a.workspaceId } }); if (!c?.enabled)
    return []; try {
    await syncFeishu(a.workspaceId, true, create);
}
catch {
    return [];
} const rows = await db.feishuChunk.findMany({ where: { workspaceId: a.workspaceId, terms: { hasSome: q }, document: { workspaceId: a.workspaceId, state: 'READY', checkedAt: { gte: new Date(Date.now() - 60000) }, connection: { enabled: true }, sourceItem: { status: 'READY' } } }, include: { document: { select: { sourceItemId: true, originalUrl: true, category: true, remoteRevision: true, checkedAt: true, sourceItem: { select: { title: true } } } } }, take: 400 }); const ranked = rankChunks(rows, query), picked: typeof ranked = []; for (const r of ranked) {
    if (picked.filter(p => p.documentId === r.documentId).length < 2)
        picked.push(r);
    if (picked.length === 6)
        break;
} return picked.map(r => ({ id: r.id, sourceItemId: r.document.sourceItemId, title: r.document.sourceItem.title ?? '飞书文档', url: r.document.originalUrl, category: r.document.category, text: r.text, version: r.document.remoteRevision ?? '0', checkedAt: r.document.checkedAt!.toISOString() })); }
export async function ensureFeishuSource(a: Actor, sourceItemId: string, create: ClientFactory = factory) { const d = await db.feishuDocument.findFirst({ where: { workspaceId: a.workspaceId, sourceItemId } }); if (!d)
    return; await feishuMember(a); await syncFeishu(a.workspaceId, true, create).catch(() => undefined); const valid = await db.feishuDocument.findFirst({ where: { id: d.id, workspaceId: a.workspaceId, state: 'READY', checkedAt: { gte: new Date(Date.now() - 60000) }, connection: { enabled: true }, sourceItem: { status: 'READY' } } }); if (!valid)
    throw new FeishuError(403, '此飞书文档已退出授权范围、同步失败或等待刷新，当前不能读取或引用'); }
