import 'server-only';
import { createHash } from 'node:crypto';
import { db, type Prisma } from '@content-center/db';
import { factState, scoreStatus, type HubInput } from './policy';
export class HubError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const fail = (message: string, status = 409): never => { throw new HubError(status, message); };
type Actor = {
    workspaceId: string;
    userId: string;
};
const factInclude = { knowledge: true, confirmations: { orderBy: { createdAt: 'desc' as const }, include: { approvals: true } } };
async function member(tx: Prisma.TransactionClient, a: Actor) { const m = await tx.workspaceMember.findFirst({ where: { workspaceId: a.workspaceId, userId: a.userId, disabledAt: null, user: { disabledAt: null }, workspace: { disabledAt: null } } }); return m ?? fail('没有此工作空间的访问权限', 403); }
const privileged = (role: string) => role === 'OWNER' || role === 'ADMIN';
async function visibleFact(tx: Prisma.TransactionClient, a: Actor, id: string, role: string) { const f = await tx.factRecord.findFirst({ where: { id, workspaceId: a.workspaceId }, include: factInclude }); if (!f || (f.knowledge.confidentiality === 'RESTRICTED' && !privileged(role)))
    fail('事实不存在或无权访问', 404); return f!; }
async function evidence(tx: Prisma.TransactionClient, a: Actor, ids: string[], role: string) { for (const id of ids) {
    const f = await visibleFact(tx, a, id, role);
    if (f.knowledge.confidentiality === 'RESTRICTED')
        fail('受限事实不能进入共享选题或项目，请使用内部可见的知识');
    if (factState(f) !== 'CONFIRMED')
        fail('所选事实尚未完成确认或已失效');
} }
export async function readHub(a: Actor) {
    return db.$transaction(async (tx) => {
        const m = await member(tx, a), admin = privileged(m.role);
        const knowledge = await tx.knowledgeEntry.findMany({ where: { workspaceId: a.workspaceId, ...(!admin ? { confidentiality: 'INTERNAL' } : {}) }, orderBy: { createdAt: 'desc' } });
        const facts = await tx.factRecord.findMany({ where: { workspaceId: a.workspaceId, knowledge: { ...(!admin ? { confidentiality: 'INTERNAL' } : {}) } }, include: factInclude, orderBy: { createdAt: 'desc' } });
        const visible = new Set(facts.map(f => f.id));
        const topics = (await tx.contentTopic.findMany({ where: { workspaceId: a.workspaceId }, include: { versions: { orderBy: { number: 'desc' } }, decisions: { orderBy: { createdAt: 'asc' } } }, orderBy: { updatedAt: 'desc' } })).filter(t => t.versions.every(v => (v.evidenceIds as string[]).every(id => visible.has(id))));
        const [contexts, policy, sources, members] = await Promise.all([tx.iPContextVersion.findMany({ where: { workspaceId: a.workspaceId, ...(!admin ? { status: 'PUBLISHED' } : {}) }, orderBy: { number: 'desc' } }), tx.workspaceContentPolicy.findUnique({ where: { workspaceId: a.workspaceId } }), tx.sourceItem.findMany({ where: { workspaceId: a.workspaceId, status: { not: 'ARCHIVED' } }, select: { id: true, title: true, sourceType: true }, orderBy: { createdAt: 'desc' }, take: 200 }), admin ? tx.workspaceMember.findMany({ where: { workspaceId: a.workspaceId, disabledAt: null, user: { disabledAt: null } }, select: { user: { select: { id: true, name: true, email: true } }, role: true } }) : Promise.resolve([])]);
        return { role: m.role, userId: a.userId, topics, knowledge, facts: facts.map(f => { const state = factState(f), request = f.confirmations[0]; return { ...f, state: state === 'PENDING' && request && (request.hostUserId !== policy?.hostUserId || request.contentOwnerUserId !== policy?.contentOwnerUserId) ? 'SUPERSEDED' : state }; }), contexts, policy: admin ? policy : null, sources, members };
    });
}
export async function mutateHub(a: Actor, input: HubInput) {
    try {
        return await db.$transaction(async (tx) => {
            const m = await member(tx, a), admin = privileged(m.role);
            if (m.role === 'VIEWER')
                fail('只读成员不能修改内容', 403);
            if ((['policy.save', 'context.save', 'topic.score', 'topic.veto', 'topic.resolve', 'topic.review'].includes(input.action)) && !admin)
                fail('此操作需要空间所有者或管理员权限', 403);
            let result: unknown;
            const audit = async (id: string) => tx.auditLog.create({ data: { workspaceId: a.workspaceId, userId: a.userId, action: 'content.' + input.action, resourceType: 'content_governance', resourceId: id, metadata: { operation: input.action, ...('reason' in input ? { reason: input.reason } : {}) } } });
            if (input.action === 'policy.save') {
                if (input.hostUserId === input.contentOwnerUserId)
                    fail('两种确认身份必须绑定不同成员', 400);
                for (const id of [input.hostUserId, input.contentOwnerUserId]) {
                    const target = await member(tx, { ...a, userId: id });
                    if (target.role === 'VIEWER')
                        fail('确认人不能是只读成员', 400);
                }
                result = await tx.workspaceContentPolicy.upsert({ where: { workspaceId: a.workspaceId }, create: { workspaceId: a.workspaceId, hostUserId: input.hostUserId, contentOwnerUserId: input.contentOwnerUserId, updatedById: a.userId }, update: { hostUserId: input.hostUserId, contentOwnerUserId: input.contentOwnerUserId, updatedById: a.userId } });
                await audit(a.workspaceId);
            }
            else if (input.action === 'context.save') {
                const latest = await tx.iPContextVersion.findFirst({ where: { workspaceId: a.workspaceId }, orderBy: { number: 'desc' } });
                if ((latest?.number ?? 0) !== input.expectedVersion)
                    fail('背景信息已被更新，请刷新后重试');
                const { action, expectedVersion, ...data } = input;
                void action;
                void expectedVersion;
                result = await tx.iPContextVersion.create({ data: { ...data, workspaceId: a.workspaceId, number: input.expectedVersion + 1, createdById: a.userId } });
                await audit(a.workspaceId);
            }
            else if (input.action === 'knowledge.create') {
                if (input.confidentiality === 'RESTRICTED' && !admin)
                    fail('只有管理员可以创建受限知识', 403);
                const source = await tx.sourceItem.findFirst({ where: { id: input.sourceItemId, workspaceId: a.workspaceId, status: { not: 'ARCHIVED' } }, select: { id: true, title: true, sourceType: true, canonicalUrl: true, rawText: true, updatedAt: true } });
                if (!source)
                    fail('来源资料不存在', 404);
                const snapshot = JSON.parse(JSON.stringify(source)) as Prisma.InputJsonValue;
                result = await tx.knowledgeEntry.create({ data: { workspaceId: a.workspaceId, sourceItemId: source!.id, sourceTitle: source!.title ?? '未命名资料', sourceSnapshot: snapshot, sourceHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), title: input.title, body: input.body, confidentiality: input.confidentiality, createdById: a.userId } });
                await audit((result as {
                    id: string;
                }).id);
            }
            else if (input.action === 'knowledge.revise') {
                const k = await tx.knowledgeEntry.findFirst({ where: { id: input.id, workspaceId: a.workspaceId, retiredAt: null } });
                if (!k || (k.confidentiality === 'RESTRICTED' && !admin))
                    fail('知识不存在或已归档', 404);
                const latest = await tx.knowledgeEntry.findFirst({ where: { rootId: k!.rootId, workspaceId: a.workspaceId }, orderBy: { version: 'desc' } });
                if (latest?.id !== k!.id)
                    fail('已有更新的知识版本，请刷新后重试');
                result = await tx.knowledgeEntry.create({ data: { rootId: k!.rootId, version: k!.version + 1, workspaceId: a.workspaceId, sourceItemId: k!.sourceItemId, sourceTitle: k!.sourceTitle, sourceSnapshot: k!.sourceSnapshot as Prisma.InputJsonValue, sourceHash: k!.sourceHash, title: input.title, body: input.body, confidentiality: k!.confidentiality, createdById: a.userId } });
                await audit((result as {
                    id: string;
                }).id);
            }
            else if (input.action === 'knowledge.archive') {
                const k = await tx.knowledgeEntry.findFirst({ where: { id: input.id, workspaceId: a.workspaceId } });
                if (!k || (k.confidentiality === 'RESTRICTED' && !admin))
                    fail('知识不存在', 404);
                result = await tx.knowledgeEntry.updateMany({ where: { rootId: k!.rootId, workspaceId: a.workspaceId }, data: { retiredAt: new Date() } });
                await audit(input.id);
            }
            else if (input.action === 'fact.create') {
                const k = await tx.knowledgeEntry.findFirst({ where: { id: input.knowledgeId, workspaceId: a.workspaceId, retiredAt: null } });
                if (!k || (k.confidentiality === 'RESTRICTED' && !admin))
                    fail('知识不存在或已归档', 404);
                const until = input.validUntil ? new Date(input.validUntil) : null;
                if (input.category === 'DYNAMIC' && !until)
                    fail('动态事实必须设置有效期', 400);
                if (until && until <= new Date())
                    fail('有效期必须在未来', 400);
                result = await tx.factRecord.create({ data: { workspaceId: a.workspaceId, knowledgeId: input.knowledgeId, claim: input.claim, category: input.category, validUntil: until, createdById: a.userId } });
                await audit((result as {
                    id: string;
                }).id);
            }
            else if (input.action === 'fact.request' || input.action === 'fact.archive') {
                const f = await visibleFact(tx, a, input.id, m.role);
                if (input.action === 'fact.archive') {
                    result = await tx.factRecord.update({ where: { id: f.id }, data: { retiredAt: new Date() } });
                }
                else {
                    if (f.retiredAt || f.knowledge.retiredAt || ['PROHIBITED', 'DISPUTED'].includes(f.category) || (f.validUntil && f.validUntil <= new Date()))
                        fail('此事实不能发起确认');
                    const p = await tx.workspaceContentPolicy.findUnique({ where: { workspaceId: a.workspaceId } });
                    if (!p?.hostUserId || !p.contentOwnerUserId || p.hostUserId === p.contentOwnerUserId)
                        fail('请先绑定两位事实确认人');
                    if (factState(f) === 'PENDING' && f.confirmations[0]?.hostUserId === p!.hostUserId && f.confirmations[0]?.contentOwnerUserId === p!.contentOwnerUserId)
                        fail('已有待处理的确认请求');
                    for (const id of [p!.hostUserId!, p!.contentOwnerUserId!]) {
                        const role = (await member(tx, { ...a, userId: id })).role;
                        if (role === 'VIEWER' || (f.knowledge.confidentiality === 'RESTRICTED' && !privileged(role)))
                            fail('确认人没有访问此事实的权限');
                    }
                    result = await tx.factConfirmation.create({ data: { factId: f.id, hostUserId: p!.hostUserId!, contentOwnerUserId: p!.contentOwnerUserId!, requestedById: a.userId, expiresAt: new Date(Date.now() + input.ttlHours * 3600000) } });
                }
                await audit(f.id);
            }
            else if (input.action === 'fact.decide') {
                const request = await tx.factConfirmation.findFirst({ where: { id: input.id, fact: { workspaceId: a.workspaceId } }, include: { fact: { include: factInclude }, approvals: true } });
                if (!request)
                    fail('确认请求不存在', 404);
                const f = await visibleFact(tx, a, request!.factId, m.role);
                if (f.confirmations[0]?.id !== request!.id || factState(f) !== 'PENDING')
                    fail('确认请求已过期、结束或被新请求替代');
                const currentPolicy = await tx.workspaceContentPolicy.findUnique({ where: { workspaceId: a.workspaceId } });
                if (currentPolicy?.hostUserId !== request!.hostUserId || currentPolicy?.contentOwnerUserId !== request!.contentOwnerUserId)
                    fail('确认人已变更，请重新发起确认');
                const identity = request!.hostUserId === a.userId ? 'HOST' : request!.contentOwnerUserId === a.userId ? 'CONTENT_OWNER' : null;
                if (!identity)
                    fail('当前账号不是该请求的指定确认人', 403);
                result = await tx.factApproval.create({ data: { confirmationId: request!.id, identity: identity!, actorId: a.userId, decision: input.decision, reason: input.reason } });
                await audit(f.id);
            }
            else {
                if (input.action === 'topic.create') {
                    await evidence(tx, a, input.evidenceIds, m.role);
                    const { action, ...v } = input;
                    void action;
                    result = await tx.contentTopic.create({ data: { workspaceId: a.workspaceId, createdById: a.userId, title: input.title, versions: { create: { ...v, number: 1, createdById: a.userId } } } });
                    await audit((result as {
                        id: string;
                    }).id);
                }
                else {
                    const t = await tx.contentTopic.findFirst({ where: { id: input.id, workspaceId: a.workspaceId }, include: { versions: { orderBy: { number: 'desc' } }, decisions: { orderBy: { createdAt: 'asc' } } } });
                    if (!t)
                        fail('选题不存在', 404);
                    for (const id of t!.versions[0]!.evidenceIds as string[])
                        await visibleFact(tx, a, id, m.role);
                    if (t!.revision !== input.revision)
                        fail('选题已被更新，请刷新后重试');
                    if (t!.status === 'ARCHIVED')
                        fail('选题已归档');
                    const v = t!.versions[0] ?? fail('选题版本缺失，无法继续操作'), decisions = t!.decisions.filter(d => d.version === v.number);
                    const score = decisions.find(d => d.kind === 'SCORE');
                    const openVetoes = decisions.filter(d => d.kind === 'VETO' && !decisions.some(r => r.kind === 'RESOLVE' && (r.payload as {
                        decisionId: string;
                    }).decisionId === d.id));
                    let status = t!.status, projectId = t!.projectId;
                    let kind: string | null = null, payload: Prisma.InputJsonValue = {};
                    if (input.action === 'topic.revise') {
                        if (projectId)
                            fail('选题已经关联项目，请在项目中继续工作');
                        await evidence(tx, a, input.evidenceIds, m.role);
                        await tx.contentTopicVersion.create({ data: { topicId: t!.id, number: v.number + 1, title: input.title, audience: input.audience, goal: input.goal, judgement: input.judgement, evidenceIds: input.evidenceIds, createdById: a.userId } });
                        status = 'DRAFT';
                        await tx.contentTopic.update({ where: { id: t!.id }, data: { title: input.title } });
                    }
                    else if (input.action === 'topic.score') {
                        if (score || projectId || t!.status !== 'DRAFT')
                            fail('此版本不能重复评分，请创建新版本');
                        const scored = scoreStatus(input.dimensions);
                        status = scored.status;
                        kind = 'SCORE';
                        payload = { ...scored, dimensions: input.dimensions, reason: input.reason };
                    }
                    else if (input.action === 'topic.veto') {
                        if (projectId || t!.status === 'APPROVED')
                            fail('已批准的选题需先返工再添加否决项');
                        kind = 'VETO';
                        payload = { code: input.code, reason: input.reason };
                    }
                    else if (input.action === 'topic.resolve') {
                        if (!openVetoes.some(d => d.id === input.decisionId))
                            fail('否决项不存在或已解决');
                        kind = 'RESOLVE';
                        payload = { decisionId: input.decisionId, reason: input.reason };
                    }
                    else if (input.action === 'topic.review') {
                        if (projectId)
                            fail('选题已关联项目');
                        if (input.decision === 'APPROVE') {
                            if (t!.status !== 'PENDING_APPROVAL' || !score || (score.payload as {
                                total: number;
                            }).total < 80 || openVetoes.length)
                                fail('批准需要评分达到80分且无未解决否决项');
                            await evidence(tx, a, v.evidenceIds as string[], m.role);
                            status = 'APPROVED';
                        }
                        else {
                            if (!['PENDING_APPROVAL', 'REWORK_REQUIRED', 'ON_HOLD', 'APPROVED'].includes(t!.status))
                                fail('此状态不能执行审核');
                            status = input.decision === 'REWORK' ? 'REWORK_REQUIRED' : input.decision === 'HOLD' ? 'ON_HOLD' : 'REJECTED';
                        }
                        kind = 'REVIEW';
                        payload = { decision: input.decision, reason: input.reason };
                    }
                    else if (input.action === 'topic.project') {
                        if (projectId)
                            return { projectId };
                        if (t!.status !== 'APPROVED')
                            fail('选题必须批准后才能转换为项目');
                        await evidence(tx, a, v.evidenceIds as string[], m.role);
                        const publishedContext = await tx.iPContextVersion.findFirst({ where: { workspaceId: a.workspaceId, status: "PUBLISHED" }, orderBy: { number: "desc" } });
                        const p = await tx.contentProject.create({ data: { workspaceId: a.workspaceId, createdById: a.userId, ...(publishedContext ? { ipContextSnapshot: JSON.parse(JSON.stringify(publishedContext)) } : {}), title: v.title, audience: v.audience, goal: v.goal, description: v.judgement, status: 'DRAFT' } });
                        const draft = await tx.draftBranch.create({ data: { workspaceId: a.workspaceId, projectId: p.id, title: '主稿', createdById: a.userId, updatedById: a.userId } });
                        await tx.contentProject.update({ where: { id: p.id }, data: { primaryDraftBranchId: draft.id } });
                        const sourceIds = new Set<string>();
                        for (const id of v.evidenceIds as string[]) {
                            const f = await visibleFact(tx, a, id, m.role);
                            const source = await tx.sourceItem.findFirst({ where: { id: f.knowledge.sourceItemId, workspaceId: a.workspaceId, status: { not: 'ARCHIVED' } } });
                            if (!source)
                                fail('关联资料已归档或删除，不能创建项目');
                            sourceIds.add(source!.id);
                            await tx.evidenceItem.create({ data: { workspaceId: a.workspaceId, projectId: p.id, sourceItemId: source!.id, type: 'FACT', claim: f.claim, excerpt: f.knowledge.body, status: 'CONFIRMED', confirmedById: a.userId, confirmedAt: new Date(), createdById: a.userId, locator: { factRecordId: f.id }, note: '已完成双身份事实确认；确认记录 ' + f.confirmations[0]!.id } });
                        }
                        let n = 0;
                        for (const sourceItemId of sourceIds)
                            await tx.projectSource.create({ data: { projectId: p.id, sourceItemId, role: 'EVIDENCE', sortOrder: n++ } });
                        projectId = p.id;
                        kind = 'PROJECT';
                        payload = { projectId: p.id };
                    }
                    else if (input.action === 'topic.archive') {
                        status = 'ARCHIVED';
                        kind = 'ARCHIVE';
                        payload = { reason: input.reason };
                    }
                    if (kind)
                        await tx.contentTopicDecision.create({ data: { topicId: t!.id, version: v.number, kind, payload, actorId: a.userId } });
                    result = await tx.contentTopic.update({ where: { id: t!.id }, data: { revision: { increment: 1 }, status, projectId } });
                    await audit(t!.id);
                }
            }
            return result;
        }, { isolationLevel: 'Serializable', timeout: 20000 });
    }
    catch (e) {
        if (e && typeof e === 'object' && 'code' in e && ['P2002', 'P2034'].includes(String(e.code)))
            throw new HubError(409, '内容已被其他操作更新，请刷新后重试');
        throw e;
    }
}
