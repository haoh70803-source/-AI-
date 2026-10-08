import { createHash } from 'node:crypto';
import { z } from 'zod';
export const FEISHU_API = 'https://open.feishu.cn/open-apis';
export const MAX_DOCUMENTS = 20;
export class FeishuError extends Error {
    constructor(public status: number, message: string, public reason = 'ERROR') { super(message); }
}
export function parseFeishuUrl(value: string) {
    let u: URL;
    try {
        u = new URL(value);
    }
    catch {
        throw new FeishuError(400, '请填写完整飞书文档链接');
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !(u.hostname === 'feishu.cn' || /^[a-z0-9-]+\.feishu\.cn$/i.test(u.hostname)))
        throw new FeishuError(400, '只支持 HTTPS 飞书文档链接');
    const m = u.pathname.match(/^\/(docx|wiki)\/([A-Za-z0-9]{10,100})\/?$/);
    if (!m)
        throw new FeishuError(400, '首期支持飞书新版文档 /docx/ 与知识库中的新版文档 /wiki/');
    return { kind: m[1]!, token: m[2]!, url: u.origin + '/' + m[1] + '/' + m[2] };
}
const id = z.string().min(1).max(100), rev = z.number().int().positive();
export const feishuInput = z.discriminatedUnion('action', [
    z.object({ action: z.literal('configure'), appId: z.string().trim().regex(/^cli_[a-zA-Z0-9]{6,80}$/), appSecret: z.string().min(8).max(200).optional(), revision: z.number().int().min(0), enabled: z.boolean(), autoSync: z.boolean(), teamShared: z.literal(true) }).strict(),
    z.object({ action: z.literal('test') }).strict(),
    z.object({ action: z.literal('add'), url: z.string().max(1000), category: z.enum(['METHOD', 'CASE', 'BRAND', 'OTHER']) }).strict(),
    z.object({ action: z.literal('sync') }).strict(),
    z.object({ action: z.literal('remove'), id, revision: rev }).strict(),
    z.object({ action: z.literal('restore'), id, revision: rev }).strict(),
    z.object({ action: z.literal('disconnect'), revision: rev }).strict(),
]);
export function terms(text: string) { const s = text.normalize('NFKC').toLowerCase(), set = new Set<string>(); for (const word of s.match(/[a-z0-9]{2,40}/g) ?? [])
    set.add(word); for (const run of s.match(/[\p{Script=Han}]+/gu) ?? [])
    for (let i = 0; i < run.length - 1; i++)
        set.add(run.slice(i, i + 2)); return [...set].slice(0, 3000); }
export function chunks(text: string, title = '') { const cleaned = text.replace(/\r\n/g, '\n').trim(); if (cleaned.length > 300000)
    throw new FeishuError(413, '文档超过30万字，请拆分后再同步'); const result = []; for (let start = 0; start < cleaned.length; start += 700) {
    const t = cleaned.slice(start, start + 850);
    result.push({ position: result.length, text: t, terms: terms(title + '\n' + t) });
    if (start + 850 >= cleaned.length)
        break;
} return result; }
export function contentHash(text: string, title: string, version: string) { return createHash('sha256').update(JSON.stringify({ text, title, version })).digest('hex'); }
export function rankChunks<T extends {
    text: string;
    terms: string[];
}>(rows: T[], query: string) { const q = terms(query).slice(0, 100); if (!q.length)
    return []; return rows.map(row => ({ row, score: q.reduce((n, t) => n + (row.terms.includes(t) ? 1 : 0), 0) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.row); }
export function unavailable(status: number, code: number) { return status === 403 || status === 404 || [1770002, 1770003, 1770032, 131005, 131006, 131012, 91403, 99991672].includes(code); }
