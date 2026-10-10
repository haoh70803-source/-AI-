import { db, type Prisma } from '@content-center/db';
import { FeishuError } from '../feishu/policy';
type Actor = {
    workspaceId: string;
    userId: string;
};
type Tx = Prisma.TransactionClient;
const json = (x: unknown) => x as Prisma.InputJsonValue;
const admin = (role: string) => ['OWNER', 'ADMIN'].includes(role);
export async function feishuMember(a: Actor, write = false) { const m = await db.workspaceMember.findFirst({ where: { workspaceId: a.workspaceId, userId: a.userId, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } } }); if (!m || write && !admin(m.role))
    throw new FeishuError(403, write ? '仅管理员和所有者可设置飞书资料源' : '没有工作空间访问权限'); return m; }
export async function purge(tx: Tx, workspaceId: string, ids: string[]) { if (!ids.length)
    return; await tx.feishuChunk.deleteMany({ where: { workspaceId, document: { sourceItemId: { in: ids } } } }); await tx.transcript.deleteMany({ where: { workspaceId, sourceItemId: { in: ids } } }); await tx.sourceItem.updateMany({ where: { workspaceId, id: { in: ids }, sourceProvider: 'FEISHU' }, data: { rawText: null, status: 'ARCHIVED' } });
    await tx.materialAnalysis.updateMany({ where: { workspaceId, sourceItemId: { in: ids }, status: 'COMPLETED' }, data: { status: 'FAILED', errorCode: 'SOURCE_UNAVAILABLE', errorMessage: '飞书来源不再可用，请重新核验授权' } });
    await tx.materialDistillation.updateMany({ where: { workspaceId, sourceItemId: { in: ids }, status: 'COMPLETED' }, data: { status: 'FAILED', errorCode: 'SOURCE_UNAVAILABLE', errorMessage: '飞书来源不再可用，请重新核验授权' } });
}
export async function audit(tx: Tx, a: Actor, action: string, id: string, metadata: unknown = {}) { await tx.auditLog.create({ data: { ...a, action: 'feishu.' + action, resourceType: 'feishu', resourceId: id, metadata: json(metadata) } }); }
