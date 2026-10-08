import { createHash, randomUUID } from "node:crypto";
import Redis from "ioredis";
export type ExperienceOperation = "AI" | "SEARCH" | "TRANSCRIBE" | "UPLOAD";
export const EXPERIENCE_LIMITS = {
  AI: { visitor: 40, daily: 150, concurrent: 5 },
  SEARCH: { visitor: 15, daily: 50, concurrent: 2 },
  TRANSCRIBE: { visitor: 5, daily: 20, concurrent: 0 },
  UPLOAD: { visitor: 10, daily: 50, concurrent: 1 },
} as const;
const labels = { AI: "AI 生成", SEARCH: "联网与内容采集", TRANSCRIBE: "音视频转写", UPLOAD: "文件上传" };
export function experienceLimitsEnabled() { return process.env.EXPERIENCE_LIMITS_ENABLED === "true" || process.env.DEMO_MODE === "true"; }
export class ExperienceLimitError extends Error { readonly code = "EXPERIENCE_LIMIT"; }
let client: Redis | undefined;
function redis() { return client ??= new Redis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: 1, connectTimeout: 3000, commandTimeout: 4000, lazyConnect: true }); }
const reserveScript = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
if tonumber(ARGV[4]) > 0 and redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[4]) then return 3 end
local amount = tonumber(ARGV[6])
if tonumber(redis.call('GET', KEYS[1]) or '0') + amount > tonumber(ARGV[2]) then return 1 end
if tonumber(redis.call('GET', KEYS[2]) or '0') + amount > tonumber(ARGV[3]) then return 2 end
local first = redis.call('INCRBY', KEYS[1], amount)
if first == amount then redis.call('EXPIRE', KEYS[1], 259200) end
redis.call('INCRBY', KEYS[2], amount)
redis.call('EXPIRE', KEYS[2], 172800)
if tonumber(ARGV[4]) > 0 then redis.call('ZADD', KEYS[3], now + 600000, ARGV[5]); redis.call('EXPIRE', KEYS[3], 660) end
return 0`;
export async function reserveExperienceUsage(input: { workspaceId: string; userId: string; operation: ExperienceOperation; amount?: number; quotaOnly?: boolean }) {
  if (!experienceLimitsEnabled()) return async () => {};
  const limit = EXPERIENCE_LIMITS[input.operation];
  const concurrency = input.quotaOnly ? 0 : limit.concurrent;
  const amount = Math.max(1, Math.min(10, input.amount || 1));
  const site = createHash("sha256").update(process.env.EXPERIENCE_SITE_ID || process.env.APP_URL || "experience").digest("hex").slice(0,16);
  const visitor = createHash("sha256").update(input.workspaceId + ":" + input.userId).digest("hex").slice(0,24);
  const day = new Date().toLocaleDateString("en-CA", {timeZone:"Asia/Shanghai"});
  const prefix = `experience:${site}:${input.operation}`;
  const keys = [`${prefix}:visitor:${visitor}`,`${prefix}:day:${day}`,`${prefix}:active`];
  const token = randomUUID();
  let result: number;
  try { result = Number(await redis().eval(reserveScript, 3, ...keys, Date.now(), limit.visitor, limit.daily, concurrency, token, amount)); }
  catch { throw new ExperienceLimitError("体验额度服务暂不可用，请稍后重试。"); }
  if (result === 1) throw new ExperienceLimitError(`你的${labels[input.operation]}体验额度已用完（三天内 ${limit.visitor} 次）。`);
  if (result === 2) throw new ExperienceLimitError(`今天全站的${labels[input.operation]}体验额度已用完，请明天再试。`);
  if (result === 3) throw new ExperienceLimitError(`${labels[input.operation]}正在忙，请稍后重试。`);
  const timer = concurrency ? setInterval(() => { void redis().zadd(keys[2]!, "XX", Date.now()+600000, token).catch(() => undefined); }, 30000) : undefined;
  timer?.unref();
  return async () => { if (timer) clearInterval(timer); if (concurrency) await redis().zrem(keys[2]!,token).catch(() => undefined); };
}
export async function closeExperienceLimitConnection() { if (client) { await client.quit(); client = undefined; } }
