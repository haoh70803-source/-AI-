import { db, type Prisma } from '@content-center/db';
import { FeishuClient, feishuExternalCallsAllowed } from '../feishu/client';
import { FeishuError, parseFeishuUrl, feishuInput } from '../feishu/policy';
import type { WikiNode } from '../feishu/contracts';
import { feishuMember, purge, audit } from './feishu-access';

export const WIKI_DOCUMENT_KIND = 'wiki-tree';
export const MAX_WIKI_DOCUMENTS = 10000;
export function feishuWikiSyncEnabled() { return process.env.FEISHU_WIKI_SYNC_ENABLED === 'true'; }
export function feishuReadableKinds() { return feishuWikiSyncEnabled() ? ['docx', 'wiki', WIKI_DOCUMENT_KIND] : ['docx', 'wiki']; }
export function feishuDocumentScope(): Prisma.FeishuDocumentWhereInput {
  return feishuWikiSyncEnabled()
    ? { OR: [{ kind: { not: WIKI_DOCUMENT_KIND } }, { wikiNodes: { some: { available: true, subscription: { state: 'ACTIVE' } } } }] }
    : { kind: { in: ['docx', 'wiki'] } };
}
type Actor = { workspaceId: string; userId: string };
type Tx = Prisma.TransactionClient;
export type WikiClient = Pick<FeishuClient, 'getWikiNode' | 'walkWiki'>;
type Connection = { id: string; workspaceId: string; revision: number; createdById: string };
type Subscription = { id: string; workspaceId: string; connectionId: string; revision: number; scope: string; rootToken: string; spaceId: string; originalUrl: string; category: string };

function requireWiki() {
  if (!feishuWikiSyncEnabled()) throw new FeishuError(409, '持久知识库订阅尚未启用，需要先审核并执行数据库迁移，再启用 FEISHU_WIKI_SYNC_ENABLED', 'SETUP_REQUIRED');
}
async function current(tx: Tx, c: Connection, lease?: string) {
  return tx.feishuConnection.findFirst({ where: { id: c.id, workspaceId: c.workspaceId, revision: c.revision, enabled: true, ...(lease ? { leaseOwner: lease } : {}) } });
}
/** Only managed documents with no remaining active, verified root may be excluded. */
export async function excludeOrphanWikiDocuments(tx: Tx, workspaceId: string, connectionId: string) {
  const docs = await tx.feishuDocument.findMany({ where: { workspaceId, connectionId, kind: WIKI_DOCUMENT_KIND, state: { not: 'REMOVED' }, wikiNodes: { none: { available: true, subscription: { state: 'ACTIVE' } } } }, select: { id: true, sourceItemId: true } });
  if (!docs.length) return;
  await purge(tx, workspaceId, docs.map(doc => doc.sourceItemId));
  await tx.feishuDocument.updateMany({ where: { workspaceId, id: { in: docs.map(doc => doc.id) } }, data: { state: 'REMOVED', checkedAt: null, contentHash: null, revision: { increment: 1 }, lastError: '文档已不在有效知识库订阅范围' } });
}
type SubscribeInput = Extract<ReturnType<typeof feishuInput.parse>, { action: 'subscribeWiki' }>;
export async function subscribeFeishuWiki(actor: Actor, input: SubscribeInput, remote: WikiClient, expected: Connection) {
  await feishuMember(actor, true); requireWiki();
  if (!feishuExternalCallsAllowed()) throw new FeishuError(503, '离线环境不能核验新知识库订阅', 'OFFLINE');
  const connection = await db.feishuConnection.findUnique({ where: { workspaceId: actor.workspaceId } });
  if (!connection?.enabled) throw new FeishuError(400, '请先启用飞书连接');
  if (connection.id !== expected.id || connection.revision !== expected.revision) throw new FeishuError(409, '连接已变化，请重新添加');
  const links = input.urls.map(url => parseFeishuUrl(url));
  if (links.some(link => link.kind !== 'wiki')) throw new FeishuError(400, '空间和子树订阅必须使用 /wiki/ 链接；普通 Docx 使用单篇订阅');
  const roots = new Map<string, { scope: string; rootToken: string; spaceId: string; originalUrl: string; name: string }>();
  for (const link of links) {
    const node = await remote.getWikiNode(link.token);
    if (!node.space_id) throw new FeishuError(502, '节点响应缺少空间 ID，无法创建可靠订阅', 'PROTOCOL');
    const rootToken = input.scope === 'SPACE' ? node.space_id : node.node_token;
    roots.set(input.scope + ':' + rootToken, { scope: input.scope, rootToken, spaceId: node.space_id, originalUrl: link.url, name: input.scope === 'SPACE' ? `知识空间 ${node.space_id}` : node.title || '未命名目录' });
  }
  return db.$transaction(async tx => {
    await feishuMemberInTransaction(tx, actor);
    if (!await current(tx, connection)) throw new FeishuError(409, '连接已变化，请重新添加');
    const existing = await tx.feishuSubscription.findMany({ where: { connectionId: connection.id, workspaceId: actor.workspaceId } });
    const fresh = [...roots.values()].filter(root => !existing.some(item => item.scope === root.scope && item.rootToken === root.rootToken));
    if (existing.length + fresh.length > 50) throw new FeishuError(400, '最多保存 50 个知识库入口，请管理已有订阅');
    const ids: string[] = [];
    for (const root of roots.values()) {
      const prior = existing.find(item => item.scope === root.scope && item.rootToken === root.rootToken);
      if (prior) { ids.push(prior.id); continue; }
      const item = await tx.feishuSubscription.create({ data: { ...root, workspaceId: actor.workspaceId, connectionId: connection.id, createdById: actor.userId, category: input.category } });
      ids.push(item.id); await audit(tx, actor, 'wiki.subscribed', item.id, { scope: root.scope, teamShared: true });
    }
    await tx.feishuConnection.update({ where: { id: connection.id }, data: { lastAttemptAt: null } });
    return { ok: true, ids, message: '知识库入口已保存，服务运行期间将递归同步全部层级。重复入口保持原状态；已停止的入口请点击恢复订阅。' };
  }, { isolationLevel: 'Serializable' });
}
async function feishuMemberInTransaction(tx: Tx, actor: Actor) {
  await tx.workspaceMember.findFirstOrThrow({ where: { ...actor, disabledAt: null, role: { in: ['OWNER', 'ADMIN'] }, user: { disabledAt: null }, workspace: { disabledAt: null } } });
}
export async function changeFeishuWiki(actor: Actor, input: Extract<ReturnType<typeof feishuInput.parse>, { action: 'updateWiki' | 'pauseWiki' | 'resumeWiki' }>) {
  await feishuMember(actor, true); requireWiki();
  return db.$transaction(async tx => {
    await feishuMemberInTransaction(tx, actor);
    const sub = await tx.feishuSubscription.findFirst({ where: { id: input.id, workspaceId: actor.workspaceId, revision: input.revision } });
    if (!sub) throw new FeishuError(409, '订阅已变化或不存在，请刷新');
    const data = input.action === 'updateWiki' ? { name: input.name, category: input.category } : { state: input.action === 'pauseWiki' ? 'PAUSED' : 'ACTIVE', syncStatus: 'PENDING', lastError: null };
    await tx.feishuSubscription.update({ where: { id: sub.id }, data: { ...data, revision: { increment: 1 }, syncRequestedAt: input.action === 'pauseWiki' ? null : new Date() } });
    if (input.action === 'updateWiki') {
      const docs = await tx.feishuDocument.findMany({ where: { workspaceId: actor.workspaceId, connectionId: sub.connectionId, kind: WIKI_DOCUMENT_KIND, wikiNodes: { some: { subscriptionId: sub.id, available: true } } }, select: { id: true, sourceItemId: true } });
      await tx.feishuDocument.updateMany({ where: { workspaceId: actor.workspaceId, id: { in: docs.map(doc => doc.id) } }, data: { category: input.category, revision: { increment: 1 } } });
      const names = { METHOD: '方法论', CASE: '案例', BRAND: '品牌资料', OTHER: '资料' };
      await tx.sourceItem.updateMany({ where: { workspaceId: actor.workspaceId, id: { in: docs.map(doc => doc.sourceItemId) } }, data: { author: '飞书 · ' + names[input.category] } });
    }
    if (input.action !== 'updateWiki') {
      await tx.feishuSubscriptionNode.updateMany({ where: { subscriptionId: sub.id, workspaceId: actor.workspaceId }, data: { available: false, state: 'UNVERIFIED' } });
      await excludeOrphanWikiDocuments(tx, actor.workspaceId, sub.connectionId);
    }
    await tx.feishuConnection.update({ where: { id: sub.connectionId }, data: { lastAttemptAt: null } });
    await audit(tx, actor, 'wiki.' + input.action, sub.id);
    return { ok: true };
  }, { isolationLevel: 'Serializable' });
}
export async function feishuWikiState(actor: Actor) {
  await feishuMember(actor);
  if (!feishuWikiSyncEnabled()) return { wikiSyncEnabled: false, subscriptions: [] };
  const roots = await db.feishuSubscription.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: { createdAt: 'asc' } });
  const subscriptions = await Promise.all(roots.map(async root => {
    const filter = { subscriptionId: root.id, workspaceId: actor.workspaceId, available: true };
    const [nodes, indexed, unsupported] = await Promise.all([
      db.feishuSubscriptionNode.count({ where: filter }),
      db.feishuSubscriptionNode.count({ where: { ...filter, document: { state: 'READY', sourceItem: { status: 'READY' } } } }),
      db.feishuSubscriptionNode.count({ where: { ...filter, state: 'UNSUPPORTED' } }),
    ]);
    return { ...root, nodes, indexed, unsupported };
  }));
  return { wikiSyncEnabled: true, subscriptions };
}
export async function feishuWikiTree(actor: Actor, subscriptionId: string) {
  await feishuMember(actor); requireWiki();
  const root = await db.feishuSubscription.findFirst({ where: { id: subscriptionId, workspaceId: actor.workspaceId, state: 'ACTIVE', connection: { enabled: true } }, include: { connection: { select: { id: true, revision: true } } } });
  if (!root) throw new FeishuError(404, '知识库订阅不存在、已暂停或连接已停用');
  const nodes = await db.feishuSubscriptionNode.findMany({ where: { subscriptionId: root.id, workspaceId: actor.workspaceId, available: true }, select: { nodeToken: true, parentNodeToken: true, objType: true, title: true, originalUrl: true, state: true, document: { select: { sourceItemId: true, state: true, lastError: true } } }, orderBy: { title: 'asc' }, take: MAX_WIKI_DOCUMENTS });
  await feishuMember(actor);
  if (!await db.feishuSubscription.findFirst({ where: { id: root.id, workspaceId: actor.workspaceId, revision: root.revision, updatedAt: root.updatedAt, state: 'ACTIVE', connection: { id: root.connection.id, revision: root.connection.revision, enabled: true } } })) throw new FeishuError(409, '知识库订阅或连接已变化，请刷新');
  return { root, nodes };
}

/** Discovery must finish before membership diffs can imply removal. */
export async function syncWikiSubscriptions(connection: Connection, lease: string, remote: WikiClient, renew: () => Promise<boolean>) {
  if (!feishuWikiSyncEnabled()) return { rootsSynced: 0, rootsFailed: 0, interrupted: false };
  const roots = await db.feishuSubscription.findMany({ where: { workspaceId: connection.workspaceId, connectionId: connection.id, state: 'ACTIVE' } });
  let rootsSynced = 0, rootsFailed = 0, interrupted = false;
  for (const sub of roots) {
    if (!await renew()) { interrupted = true; break; }
    await db.feishuSubscription.updateMany({ where: { id: sub.id, workspaceId: connection.workspaceId, revision: sub.revision, state: 'ACTIVE' }, data: { syncStatus: 'SCANNING', lastAttemptAt: new Date(), lastError: null } });
    try {
      const nodes: WikiNode[] = [];
      let spaceId = sub.spaceId;
      if (sub.scope === 'SUBTREE') {
        const root = await remote.getWikiNode(sub.rootToken);
        if (!root.space_id) throw new FeishuError(502, '节点响应缺少空间 ID', 'PROTOCOL');
        spaceId = root.space_id; nodes.push(root);
      }
      for await (const node of remote.walkWiki(spaceId, sub.scope === 'SUBTREE' ? sub.rootToken : undefined, { maxNodes: MAX_WIKI_DOCUMENTS - nodes.length || 1 })) {
        nodes.push(node);
        if (nodes.length > MAX_WIKI_DOCUMENTS) throw new FeishuError(413, '知识库超过一万节点，扫描未完成', 'LIMIT');
        if (nodes.length % 50 === 0 && !await renew()) throw new FeishuError(409, '同步租约已失效', 'LEASE_LOST');
      }
      if (!await renew()) { interrupted = true; break; }
      const committed = await commitWikiDiscovery(connection, lease, sub, spaceId, nodes);
      if (committed) rootsSynced++;
      else interrupted = true;
    } catch (error) {
      rootsFailed++;
      const failure = error instanceof FeishuError ? error : new FeishuError(503, '知识库目录同步未完成，请重试');
      await db.$transaction(async tx => {
        if (!await current(tx, connection, lease)) return;
        if (!await tx.feishuSubscription.findFirst({ where: { id: sub.id, workspaceId: connection.workspaceId, revision: sub.revision, state: 'ACTIVE' } })) return;
        // Preserve topology on a partial scan; withdraw only this root's eligibility.
        await tx.feishuSubscriptionNode.updateMany({ where: { subscriptionId: sub.id, workspaceId: connection.workspaceId }, data: { available: false, state: 'UNVERIFIED' } });
        await tx.feishuSubscription.update({ where: { id: sub.id }, data: { syncStatus: 'ERROR', lastError: failure.message } });
        await excludeOrphanWikiDocuments(tx, connection.workspaceId, connection.id);
        await audit(tx, { workspaceId: connection.workspaceId, userId: connection.createdById }, 'wiki.scan_failed', sub.id, { reason: failure.reason });
      }, { isolationLevel: 'Serializable' });
    }
  }
  return { rootsSynced, rootsFailed, interrupted };
}
async function commitWikiDiscovery(c: Connection, lease: string, sub: Subscription, spaceId: string, nodes: WikiNode[]) {
  return db.$transaction(async tx => {
    if (!await current(tx, c, lease)) return false;
    await feishuMemberInTransaction(tx, { workspaceId: c.workspaceId, userId: c.createdById });
    if (!await tx.feishuSubscription.findFirst({ where: { id: sub.id, workspaceId: c.workspaceId, revision: sub.revision, state: 'ACTIVE' } })) return false;
    const docs = await tx.feishuDocument.findMany({ where: { connectionId: c.id, workspaceId: c.workspaceId, kind: WIKI_DOCUMENT_KIND } });
    const byToken = new Map(docs.map(doc => [doc.token, doc]));
    for (const node of nodes) {
      const originalUrl = parseFeishuUrl(new URL(sub.originalUrl).origin + '/wiki/' + node.node_token).url;
      let documentId: string | null = null;
      if (node.obj_type === 'docx') {
        let doc = byToken.get(node.node_token);
        if (!doc) {
          if (byToken.size >= MAX_WIKI_DOCUMENTS) throw new FeishuError(413, '知识库文档超过一万份，本次发现未提交', 'LIMIT');
          const source = await tx.sourceItem.create({ data: { workspaceId: c.workspaceId, createdById: c.createdById, sourceType: 'DOCUMENT', sourcePlatform: 'OTHER', sourceProvider: 'FEISHU', sourceUrl: originalUrl, canonicalUrl: originalUrl, title: node.title || '飞书知识库文档', status: 'PENDING' } });
          doc = await tx.feishuDocument.create({ data: { workspaceId: c.workspaceId, connectionId: c.id, sourceItemId: source.id, kind: WIKI_DOCUMENT_KIND, token: node.node_token, originalUrl, category: sub.category } });
          byToken.set(node.node_token, doc);
        } else if (doc.state === 'REMOVED') {
          await tx.feishuDocument.update({ where: { id: doc.id }, data: { state: 'PENDING', contentHash: null, checkedAt: null, revision: { increment: 1 } } });
        }
        documentId = doc.id;
      }
      const data = { workspaceId: c.workspaceId, parentNodeToken: node.parent_node_token ?? '', objToken: node.obj_token, objType: node.obj_type, title: node.title, originalUrl, documentId, available: true, state: documentId ? 'DISCOVERED' : 'UNSUPPORTED', lastSeenAt: new Date() };
      await tx.feishuSubscriptionNode.upsert({ where: { subscriptionId_nodeToken: { subscriptionId: sub.id, nodeToken: node.node_token } }, create: { ...data, subscriptionId: sub.id, nodeToken: node.node_token }, update: data });
    }
    await tx.feishuSubscriptionNode.updateMany({ where: { subscriptionId: sub.id, workspaceId: c.workspaceId, nodeToken: { notIn: nodes.map(node => node.node_token) } }, data: { available: false, state: 'MISSING' } });
    await tx.feishuSubscription.update({ where: { id: sub.id }, data: { spaceId, syncStatus: 'SYNCED', lastSyncedAt: new Date(), lastError: null } });
    await excludeOrphanWikiDocuments(tx, c.workspaceId, c.id);
    await audit(tx, { workspaceId: c.workspaceId, userId: c.createdById }, 'wiki.discovered', sub.id, { nodes: nodes.length });
    return true;
  }, { isolationLevel: 'Serializable', timeout: 60000 });
}
