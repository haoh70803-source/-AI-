import { z } from 'zod';
export const scoreLimits = { audience: 15, scenario: 15, hook: 10, judgement: 15, uniqueness: 15, evidence: 15, aiFit: 5, platformFit: 5, commercial: 5 } as const;
export const scoreLabels: Record<keyof typeof scoreLimits, string> = { audience: '受众明确', scenario: '场景真实', hook: '停留理由', judgement: '核心判断', uniqueness: 'IP 独特性', evidence: '真实证据', aiFit: 'AI 适配', platformFit: '平台适配', commercial: '商业价值' };
export const vetoLabels = { UNVERIFIED_FIRST_PERSON: '第一人称事实未经确认', UNVERIFIED_NUMERIC_CLAIM: '数字主张未经确认', FREE_TOOL_TRAFFIC: '只以免费工具吸引流量', FORCED_AI_INSERTION: '强行植入 AI', COPYING_WITHOUT_IP_JUDGEMENT: '缺少原创 IP 判断', UNVERIFIED_COMPLIANCE: '合规证据不足', ATTACKING_PEERS: '攻击同行', MULTIPLE_CORE_TOPICS: '多个核心主题', ANXIETY_WITHOUT_ACTION: '制造焦虑却没有行动建议', PRIVATE_INFORMATION_RISK: '涉及隐私风险' } as const;
const text = z.string().trim().min(1).max(500);
const long = z.string().trim().min(1).max(12000);
const id = z.string().min(1).max(120);
const base = { id, revision: z.number().int().positive() };
const version = { title: text, audience: text, goal: text, judgement: long, evidenceIds: z.array(id).max(30) };
const dimensions = z.object(Object.fromEntries(Object.entries(scoreLimits).map(([key, max]) => [key, z.number().int().min(0).max(max)])) as Record<keyof typeof scoreLimits, z.ZodNumber>).strict();
export const hubInput = z.discriminatedUnion('action', [
    z.object({ action: z.literal('topic.create'), ...version }).strict(),
    z.object({ action: z.literal('topic.revise'), ...base, ...version }).strict(),
    z.object({ action: z.literal('topic.score'), ...base, dimensions, reason: long }).strict(),
    z.object({ action: z.literal('topic.veto'), ...base, code: z.enum(Object.keys(vetoLabels) as [
            keyof typeof vetoLabels,
            ...(keyof typeof vetoLabels)[]
        ]), reason: long }).strict(),
    z.object({ action: z.literal('topic.resolve'), ...base, decisionId: id, reason: long }).strict(),
    z.object({ action: z.literal('topic.review'), ...base, decision: z.enum(['APPROVE', 'REWORK', 'REJECT', 'HOLD']), reason: long }).strict(),
    z.object({ action: z.literal('topic.project'), ...base }).strict(),
    z.object({ action: z.literal('topic.archive'), ...base, reason: long }).strict(),
    z.object({ action: z.literal('knowledge.create'), sourceItemId: id, title: text, body: long, confidentiality: z.enum(['INTERNAL', 'RESTRICTED']) }).strict(),
    z.object({ action: z.literal('knowledge.revise'), id, title: text, body: long }).strict(),
    z.object({ action: z.literal('knowledge.archive'), id, reason: long }).strict(),
    z.object({ action: z.literal('fact.create'), knowledgeId: id, claim: long, category: z.enum(['STABLE', 'DYNAMIC', 'PROHIBITED', 'DISPUTED']), validUntil: z.iso.datetime({ offset: true }).nullable() }).strict(),
    z.object({ action: z.literal('fact.request'), id, ttlHours: z.number().int().min(1).max(24) }).strict(),
    z.object({ action: z.literal('fact.decide'), id, decision: z.enum(['APPROVE', 'REJECT']), reason: long }).strict(),
    z.object({ action: z.literal('fact.archive'), id, reason: long }).strict(),
    z.object({ action: z.literal('policy.save'), hostUserId: id, contentOwnerUserId: id }).strict(),
    z.object({ action: z.literal('context.save'), expectedVersion: z.number().int().min(0), status: z.enum(['DRAFT', 'PUBLISHED']), positioning: long, audience: text, tone: text, boundaries: long }).strict(),
]);
export type HubInput = z.infer<typeof hubInput>;
export function scoreStatus(dimensions: Record<keyof typeof scoreLimits, number>) {
    const total = Object.values(dimensions).reduce((a, b) => a + b, 0);
    return { total, status: total >= 80 ? 'PENDING_APPROVAL' : total >= 65 ? 'REWORK_REQUIRED' : 'REJECTED' };
}
type Confirmation = {
    id: string;
    expiresAt: Date;
    createdAt: Date;
    hostUserId: string;
    contentOwnerUserId: string;
    approvals: {
        identity: string;
        actorId: string;
        decision: string;
    }[];
};
export function factState(fact: {
    category: string;
    retiredAt: Date | null;
    validUntil: Date | null;
    confirmations: Confirmation[];
    knowledge: {
        retiredAt: Date | null;
    };
}, now = new Date()) {
    if (fact.retiredAt || fact.knowledge.retiredAt)
        return 'ARCHIVED';
    if (['PROHIBITED', 'DISPUTED'].includes(fact.category))
        return fact.category;
    if (fact.validUntil && fact.validUntil <= now)
        return 'EXPIRED';
    const request = fact.confirmations[0];
    if (!request)
        return 'UNCONFIRMED';
    if (request.approvals.some(a => a.decision === 'REJECT'))
        return 'REJECTED';
    const approved = ['HOST', 'CONTENT_OWNER'].every(identity => request.approvals.some(a => a.identity === identity && a.decision === 'APPROVE' && a.actorId === (identity === 'HOST' ? request.hostUserId : request.contentOwnerUserId))) && request.hostUserId !== request.contentOwnerUserId;
    if (approved)
        return fact.category === 'DYNAMIC' && request.createdAt.getTime() + 86400000 <= now.getTime() ? 'EXPIRED' : 'CONFIRMED';
    return request.expiresAt <= now ? 'EXPIRED' : 'PENDING';
}
