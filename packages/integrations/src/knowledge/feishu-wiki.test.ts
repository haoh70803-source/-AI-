import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ db: {} as Record<string, any> }));
vi.mock('@content-center/db', () => ({ db: mock.db }));
vi.mock('../encryption', () => ({ decryptSecret: () => 'fixture', encryptSecret: vi.fn(), parseMasterEncryptionKey: vi.fn() }));
import { subscribeFeishuWiki, syncWikiSubscriptions, changeFeishuWiki, feishuWikiTree, feishuReadableKinds } from './feishu-wiki';
import { syncFeishu, mutateFeishu, searchFeishu } from './feishu-service';
import { FeishuError, feishuInput } from '../feishu/policy';
import type { WikiNode } from '../feishu/contracts';

// In-memory transaction fixture; it runs the real application service without a DB connection.
type Row = Record<string, any>;
let tables: Record<string, Row[]>, sequence: number, allowed: boolean;
const actor = { workspaceId: 'w', userId: 'u' };
const connection = { id: 'c', workspaceId: 'w', createdById: 'u', enabled: true, revision: 1, leaseOwner: 'lease', leaseUntil: null, autoSync: true, lastAttemptAt: null, appId: 'cli_fixture', encryptedSecret: 'fixture' };
const root: WikiNode = { space_id: '7001', node_token: 'wikiroottoken123', parent_node_token: '', obj_token: 'docxroottoken123', obj_type: 'docx', title: '员工工作台', has_child: true };
const leaf: WikiNode = { ...root, node_token: 'wikileaftoken123', parent_node_token: root.node_token, obj_token: 'docxleaftoken123', title: '部门资料', has_child: false };
const remote = { getWikiNode: vi.fn(), walkWiki: vi.fn(), accessToken: vi.fn(), read: vi.fn() };
const renew = vi.fn();
function related(model: string, row: Row, key: string): [string, Row | Row[] | null] | undefined {
  if (model === 'feishuDocument' && key === 'wikiNodes') return ['feishuSubscriptionNode', tables.feishuSubscriptionNode!.filter(node => node.documentId === row.id)];
  if (model === 'feishuSubscriptionNode' && key === 'subscription') return ['feishuSubscription', tables.feishuSubscription!.find(root => root.id === row.subscriptionId) ?? null];
  if (model === 'feishuSubscriptionNode' && key === 'document') return ['feishuDocument', tables.feishuDocument!.find(doc => doc.id === row.documentId) ?? null];
  if (key === 'connection') return ['feishuConnection', tables.feishuConnection![0]!];
  if (model === 'feishuDocument' && key === 'sourceItem') return ['sourceItem', tables.sourceItem!.find(source => source.id === row.sourceItemId) ?? null];
  if (model === 'feishuChunk' && key === 'document') return ['feishuDocument', tables.feishuDocument!.find(doc => doc.id === row.documentId) ?? null];
  return undefined;
}
function matches(model: string, row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    if (key === 'OR') return wanted.some((branch: Row) => matches(model, row, branch));
    if (key === 'AND') return wanted.every((branch: Row) => matches(model, row, branch));
    if (key === 'user' || key === 'workspace') return allowed;
    const relation = related(model, row, key);
    if (relation) {
      const [childModel, value] = relation;
      if (Array.isArray(value)) return Object.entries(wanted).every(([operator, filter]) => operator === 'some' ? value.some(child => matches(childModel, child, filter as Row)) : operator === 'none' ? !value.some(child => matches(childModel, child, filter as Row)) : false);
      return value !== null && matches(childModel, value, wanted);
    }
    if (key.includes('_') && typeof wanted === 'object') return matches(model, row, wanted);
    const value = row[key];
    if (wanted === null || typeof wanted !== 'object' || wanted instanceof Date) return value === wanted;
    return Object.entries(wanted).every(([operator, operand]) => {
      if (operator === 'in') return (operand as unknown[]).includes(value);
      if (operator === 'notIn') return !(operand as unknown[]).includes(value);
      if (operator === 'not') return value !== operand;
      if (operator === 'lt') return value !== null && value < operand!;
      if (operator === 'lte') return value !== null && value <= operand!;
      if (operator === 'gte') return value !== null && value >= operand!;
      if (operator === 'hasSome') return (value as unknown[]).some(term => (operand as unknown[]).includes(term));
      return false;
    });
  });
}
function update(row: Row, data: Row) { for (const [key, value] of Object.entries(data)) row[key] = typeof value === 'object' && value !== null && 'increment' in value ? row[key] + value.increment : value; return row; }
function makeDelegate(model: string) {
  const find = (where: Row = {}) => tables[model]!.filter(row => matches(model, row, where));
  const create = (data: Row) => { const row = { id: `${model}-${sequence++}`, state: model === 'feishuSubscription' ? 'ACTIVE' : 'PENDING', revision: 1, contentHash: null, syncStatus: 'PENDING', syncRequestedAt: new Date(), ...data }; tables[model]!.push(row); return row; };
  return {
    findMany: vi.fn(async ({ where, include, select }: Row = {}) => find(where).map(row => {
      if (include?.sourceItem) return { ...row, sourceItem: related(model, row, 'sourceItem')?.[1] };
      if (include?.document || select?.document) {
        const doc = related(model, row, 'document')?.[1] as Row;
        if (!doc) return { ...row, document: null };
        return { ...row, document: { ...doc, sourceItem: related('feishuDocument', doc, 'sourceItem')?.[1] } };
      }
      return { ...row };
    })),
    findFirst: vi.fn(async ({ where, include }: Row) => {
      const row = find(where)[0];
      return row && include?.connection ? { ...row, connection: { id: tables.feishuConnection![0]!.id, revision: tables.feishuConnection![0]!.revision } } : row ?? null;
    }),
    findUnique: vi.fn(async ({ where }: Row) => find(where)[0] ?? null),
    count: vi.fn(async ({ where }: Row = {}) => find(where).length),
    create: vi.fn(async ({ data }: Row) => create(data)),
    createMany: vi.fn(async ({ data }: Row) => { for (const row of data) create(row); return { count: data.length }; }),
    update: vi.fn(async ({ where, data }: Row) => { const row = find(where)[0]; if (!row) throw new Error('missing row'); return update(row, data); }),
    updateMany: vi.fn(async ({ where, data }: Row) => { const rows = find(where); rows.forEach(row => update(row, data)); return { count: rows.length }; }),
    deleteMany: vi.fn(async ({ where }: Row) => { const found = find(where); tables[model] = tables[model]!.filter(row => !found.includes(row)); return { count: found.length }; }),
    upsert: vi.fn(async ({ where, create: data, update: change }: Row) => { const found = find(where)[0]; return found ? update(found, change) : create(data); }),
  };
}
beforeEach(() => {
  vi.stubEnv('FEISHU_WIKI_SYNC_ENABLED', 'true'); vi.stubEnv('EXTERNAL_CALLS_DISABLED', 'false'); vi.stubEnv('LOCAL_REVIEW_OFFLINE', 'false');
  sequence = 1; allowed = true;
  tables = Object.fromEntries(['feishuConnection', 'feishuSubscription', 'feishuSubscriptionNode', 'feishuDocument', 'sourceItem', 'feishuChunk', 'transcript', 'materialAnalysis', 'materialDistillation', 'auditLog'].map(model => [model, []]));
  tables.feishuConnection!.push({ ...connection });
  for (const model of Object.keys(tables)) mock.db[model] = makeDelegate(model);
  mock.db.workspaceMember = { findFirst: vi.fn(async () => allowed ? { role: 'ADMIN' } : null), findFirstOrThrow: vi.fn(async () => { if (!allowed) throw new Error('revoked'); return { role: 'ADMIN' }; }) };
  mock.db.$transaction = vi.fn(async (work: (tx: any) => Promise<any>) => { const backup = structuredClone(tables); try { return await work(mock.db); } catch (error) { tables = backup; throw error; } });
  remote.getWikiNode.mockResolvedValue(root); remote.accessToken.mockResolvedValue('fixture');
  remote.walkWiki.mockImplementation(async function* () { yield leaf; });
  remote.read.mockImplementation(async (_kind, token) => ({ title: token === root.node_token ? root.title : leaf.title, text: '企业知识：品牌定位与部门流程', documentId: token, remoteRevision: '1' }));
  renew.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const input = { action: 'subscribeWiki' as const, urls: ['https://example.feishu.cn/wiki/wikiroottoken123'], scope: 'SUBTREE' as const, category: 'OTHER' as const, teamShared: true as const };
async function add() { await subscribeFeishuWiki(actor, input, remote, connection); return tables.feishuSubscription![0]!; }
async function scan() { tables.feishuConnection![0]!.leaseOwner = 'lease'; return syncWikiSubscriptions(connection, 'lease', remote, renew); }
async function index() { return syncFeishu('w', true, () => remote); }

describe('persistent multi-root knowledge subscription lifecycle', () => {
  it('requires backend sharing confirmation and rejects non-Wiki links', async () => {
    expect(feishuInput.safeParse({ ...input, teamShared: false }).success).toBe(false);
    await expect(subscribeFeishuWiki(actor, { ...input, urls: ['https://example.feishu.cn/docx/docxroottoken123'] }, remote, connection)).rejects.toMatchObject({ status: 400 });
    expect(tables.feishuSubscription).toHaveLength(0);
  });
  it('gates writes behind migration activation and offline authorization checks', async () => {
    vi.stubEnv('FEISHU_WIKI_SYNC_ENABLED', 'false');
    await expect(add()).rejects.toMatchObject({ reason: 'SETUP_REQUIRED' }); expect(remote.getWikiNode).not.toHaveBeenCalled();
    vi.stubEnv('FEISHU_WIKI_SYNC_ENABLED', 'true'); vi.stubEnv('EXTERNAL_CALLS_DISABLED', 'true');
    await expect(add()).rejects.toMatchObject({ reason: 'OFFLINE' }); expect(tables.feishuSubscription).toHaveLength(0);
  });
  it('preserves the legacy client factory when no active Wiki roots are configured', async () => {
    expect(await syncFeishu('w', true, () => ({ accessToken: remote.accessToken, read: remote.read }))).toMatchObject({ status: 'SYNCED' });
  });
  it('does not use a client belonging to a replaced connection', async () => {
    tables.feishuConnection![0]!.revision = 2;
    await expect(add()).rejects.toMatchObject({ status: 409 }); expect(remote.getWikiNode).not.toHaveBeenCalled();
  });
  it('deduplicates repeated roots without creating repeated subscriptions', async () => {
    await add(); await add(); expect(tables.feishuSubscription).toHaveLength(1);
  });
  it('stores every descendant including unsupported Word files, and deduplicates overlapping roots', async () => {
    await add();
    await subscribeFeishuWiki(actor, { ...input, scope: 'SPACE' }, remote, connection);
    remote.walkWiki.mockImplementation(async function* (_space, parent) { if (!parent) yield root; yield leaf; yield { ...leaf, node_token: 'wordfiletoken123', obj_type: 'file', title: '员工制度.docx' }; });
    expect(await scan()).toMatchObject({ rootsSynced: 2, rootsFailed: 0 });
    expect(tables.feishuDocument).toHaveLength(2); expect(tables.feishuSubscriptionNode).toHaveLength(6);
    expect(tables.feishuSubscriptionNode!.filter(node => node.objType === 'file').every(node => node.state === 'UNSUPPORTED' && node.documentId === null)).toBe(true);
  });
  it('indexes discovered bodies and keeps document/source/chunk identities on unchanged sync', async () => {
    await add(); expect(await index()).toMatchObject({ status: 'SYNCED', synced: 2, rootsSynced: 1 });
    const ids = tables.feishuChunk!.map(chunk => chunk.id), sourceIds = tables.sourceItem!.map(source => source.id);
    await index(); expect(tables.feishuChunk!.map(chunk => chunk.id)).toEqual(ids); expect(tables.sourceItem!.map(source => source.id)).toEqual(sourceIds);
    expect(remote.read).toHaveBeenCalledWith('wiki', leaf.node_token);
  });
  it('replaces changed bodies atomically and invalidates derived analysis', async () => {
    await add(); await index(); const old = tables.feishuChunk!.map(chunk => chunk.id);
    tables.materialAnalysis!.push({ workspaceId: 'w', sourceItemId: tables.sourceItem![0]!.id, status: 'COMPLETED' });
    remote.read.mockResolvedValue({ title: '更新资料', text: '新版企业制度正文', documentId: 'docxnewtoken123', remoteRevision: '2' });
    await index(); expect(tables.feishuChunk!.some(chunk => old.includes(chunk.id))).toBe(false);
    expect(tables.sourceItem!.every(source => source.rawText === '新版企业制度正文')).toBe(true);
    expect(tables.materialAnalysis![0]!.errorCode).toBe('SOURCE_CHANGED');
  });
  it('updates remote revision without recreating chunks for identical content', async () => {
    await add(); await index(); const ids = tables.feishuChunk!.map(chunk => chunk.id);
    remote.read.mockImplementation(async (_kind, token) => ({ title: token === root.node_token ? root.title : leaf.title, text: '企业知识：品牌定位与部门流程', documentId: token, remoteRevision: '2' }));
    await index(); expect(tables.feishuChunk!.map(chunk => chunk.id)).toEqual(ids); expect(tables.feishuDocument!.every(doc => doc.remoteRevision === '2')).toBe(true);
  });
  it('discovers new children and updates moved/renamed directory metadata', async () => {
    await add(); await index();
    remote.walkWiki.mockImplementation(async function* () { yield { ...leaf, title: '改名资料', parent_node_token: 'newparenttoken123' }; yield { ...leaf, node_token: 'wikinewchildtoken123' }; });
    await index(); expect(tables.feishuDocument).toHaveLength(3);
    expect(tables.feishuSubscriptionNode!.find(node => node.nodeToken === leaf.node_token)).toMatchObject({ title: '改名资料', parentNodeToken: 'newparenttoken123' });
  });
  it('only marks missing nodes after a complete scan and immediately excludes old body/chunks/derived data', async () => {
    await add(); await index(); const leafDoc = tables.feishuDocument!.find(doc => doc.token === leaf.node_token)!;
    tables.materialDistillation!.push({ workspaceId: 'w', sourceItemId: leafDoc.sourceItemId, status: 'COMPLETED' });
    remote.walkWiki.mockImplementation(async function* () {});
    await index(); expect(tables.feishuSubscriptionNode!.find(node => node.nodeToken === leaf.node_token)?.state).toBe('MISSING');
    expect(leafDoc.state).toBe('REMOVED'); expect(tables.feishuChunk!.some(chunk => chunk.documentId === leafDoc.id)).toBe(false);
    expect(tables.sourceItem!.find(source => source.id === leafDoc.sourceItemId)?.rawText).toBeNull();
    expect(tables.materialDistillation![0]!.errorCode).toBe('SOURCE_UNAVAILABLE');
  });
  it('does not misclassify a partial scan as deletion; it fails closed and recovers original source identity', async () => {
    await add(); await index(); const ids = tables.feishuDocument!.map(doc => doc.sourceItemId);
    remote.walkWiki.mockImplementation(async function* () { yield { ...leaf, node_token: 'uncommittedtoken123' }; throw new FeishuError(502, '暂不可用', 'NETWORK'); });
    expect(await scan()).toMatchObject({ rootsFailed: 1 });
    expect(tables.feishuSubscriptionNode!.some(node => node.state === 'MISSING')).toBe(false);
    expect(tables.feishuSubscriptionNode!.every(node => !node.available)).toBe(true); expect(tables.feishuChunk).toHaveLength(0);
    expect(tables.feishuDocument).toHaveLength(2);
    remote.walkWiki.mockImplementation(async function* () { yield leaf; });
    await index(); expect(tables.feishuDocument!.map(doc => doc.sourceItemId)).toEqual(ids); expect(tables.feishuChunk).toHaveLength(2);
  });
  it('preserves documents covered by another active root when one root stops', async () => {
    const sub = await add(); await subscribeFeishuWiki(actor, { ...input, scope: 'SPACE' }, remote, connection); await index();
    await changeFeishuWiki(actor, { action: 'pauseWiki', id: sub.id, revision: sub.revision });
    const leafDoc = tables.feishuDocument!.find(doc => doc.token === leaf.node_token)!;
    expect(leafDoc.state).toBe('READY'); expect(tables.feishuChunk!.some(chunk => chunk.documentId === leafDoc.id)).toBe(true);
  });
  it('stops and restores a root without resurrecting stale data before a fresh sync', async () => {
    const sub = await add(); await index(); const sourceIds = tables.feishuDocument!.map(doc => doc.sourceItemId);
    await changeFeishuWiki(actor, { action: 'pauseWiki', id: sub.id, revision: sub.revision });
    expect(tables.feishuChunk).toHaveLength(0);
    await changeFeishuWiki(actor, { action: 'resumeWiki', id: sub.id, revision: sub.revision });
    expect(tables.feishuChunk).toHaveLength(0); await index(); expect(tables.feishuDocument!.map(doc => doc.sourceItemId)).toEqual(sourceIds);
  });
  it('edits root metadata and propagates its category without destroying indexed bodies', async () => {
    const sub = await add(); await index(); const ids = tables.feishuChunk!.map(chunk => chunk.id);
    await changeFeishuWiki(actor, { action: 'updateWiki', id: sub.id, revision: sub.revision, name: '员工知识库', category: 'BRAND' });
    expect(sub.name).toBe('员工知识库'); expect(tables.feishuDocument!.every(doc => doc.category === 'BRAND')).toBe(true);
    expect(tables.feishuChunk!.map(chunk => chunk.id)).toEqual(ids); expect(tables.sourceItem!.every(source => source.rawText)).toBe(true);
  });
  it('rejects stale revisions and cross-workspace edits and directory reads', async () => {
    const sub = await add();
    await expect(changeFeishuWiki(actor, { action: 'pauseWiki', id: sub.id, revision: 999 })).rejects.toMatchObject({ status: 409 });
    await expect(changeFeishuWiki({ ...actor, workspaceId: 'other' }, { action: 'pauseWiki', id: sub.id, revision: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(feishuWikiTree({ ...actor, workspaceId: 'other' }, sub.id)).rejects.toMatchObject({ status: 404 });
    allowed = false; await expect(add()).rejects.toMatchObject({ status: 403 });
  });
  it('reads the stored tree with body status and no credentials', async () => {
    const sub = await add(); await index();
    const result = await feishuWikiTree(actor, sub.id);
    expect(result.nodes).toHaveLength(2); expect(result.nodes[0]!.document?.state).toBe('READY');
    expect(JSON.stringify(result)).not.toContain('encryptedSecret');
  });
  it('discards a stored directory response if the connection changes during the query', async () => {
    const sub = await add(); await index();
    const original = mock.db.feishuSubscriptionNode.findMany.getMockImplementation();
    mock.db.feishuSubscriptionNode.findMany.mockImplementation(async (args: Row) => {
      const result = await original(args); tables.feishuConnection![0]!.revision++; return result;
    });
    await expect(feishuWikiTree(actor, sub.id)).rejects.toMatchObject({ status: 409 });
  });
  it('does not publish discovery if a subscription is stopped during the upstream read', async () => {
    const sub = await add();
    remote.walkWiki.mockImplementation(async function* () { sub.state = 'PAUSED'; sub.revision++; yield leaf; });
    expect(await scan()).toMatchObject({ rootsSynced: 0, interrupted: true }); expect(tables.feishuDocument).toHaveLength(0);
  });
  it('persists manual requests for the scheduler even when automatic sync is disabled', async () => {
    await add(); tables.feishuConnection![0]!.autoSync = false;
    expect(await mutateFeishu(actor, { action: 'sync' }, () => remote)).toMatchObject({ status: 'QUEUED' });
    expect(remote.read).not.toHaveBeenCalled();
    expect(await syncFeishu('w', false, () => remote)).toMatchObject({ status: 'SYNCED' });
    expect(tables.feishuSubscription![0]!.syncRequestedAt).toBeNull();
  });
  it('retries failed requests instead of clearing them as successful', async () => {
    await add(); remote.read.mockRejectedValue(new FeishuError(403, '撤权', 'UNAVAILABLE'));
    expect(await index()).toMatchObject({ status: 'PARTIAL', failed: 2 });
    expect(tables.feishuSubscription![0]!.syncRequestedAt).not.toBeNull(); expect(tables.feishuChunk).toHaveLength(0);
  });
  it('does not expose tree-managed sources to AI when the feature is disabled', async () => {
    await add(); await index(); vi.stubEnv('FEISHU_WIKI_SYNC_ENABLED', 'false');
    expect(feishuReadableKinds()).not.toContain('wiki-tree'); expect(await searchFeishu(actor, '品牌定位', () => remote)).toEqual([]);
  });
  it('refreshes only retrieval candidates and does not discover the entire Wiki during AI lookup', async () => {
    await add(); await index(); const lastAttempt = tables.feishuConnection![0]!.lastAttemptAt;
    remote.walkWiki.mockClear(); remote.getWikiNode.mockClear();
    const result = await searchFeishu(actor, '品牌定位', () => remote);
    expect(result).toHaveLength(2); expect(remote.walkWiki).not.toHaveBeenCalled(); expect(remote.getWikiNode).not.toHaveBeenCalled();
    expect(tables.feishuConnection![0]!.lastAttemptAt).toBe(lastAttempt);
  });
  it('keeps a newer manual request submitted during indexing for the next scheduled run', async () => {
    const sub = await add();
    remote.read.mockImplementation(async (_kind, token) => {
      sub.syncRequestedAt = new Date(Date.now() + 1000);
      return { title: '知识', text: '正文', documentId: token, remoteRevision: '1' };
    });
    await index(); expect(sub.syncRequestedAt).not.toBeNull();
  });
  it('rolls back source creation when a discovery transaction fails', async () => {
    await add(); mock.db.feishuSubscriptionNode.upsert.mockRejectedValueOnce(new Error('fixture write failure'));
    expect(await scan()).toMatchObject({ rootsFailed: 1 }); expect(tables.feishuDocument).toHaveLength(0); expect(tables.sourceItem).toHaveLength(0);
  });
});
