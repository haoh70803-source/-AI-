import "server-only";
import { db } from "@content-center/db";
import { terms } from "@content-center/integrations";
import { AIControlError, type ContextItem } from "../ai/control/contracts";
import { assistantCache, assistantCacheKey, type AssistantCache } from "./cache";

type Actor = { workspaceId: string; userId: string; projectId: string; threadId: string };
type Message = { id: string; content: string; role: "USER" | "ASSISTANT"; createdAt: Date; updatedAt: Date };
const preferenceMarkers = ["记住", "以后", "始终", "偏好", "不要", "禁止", "取消", "不再"];
const genericTerms = new Set(["帮我", "写一", "一条", "给我", "一下", "这个", "那个", "继续", "修改", "内容", "口播", "文案", "稿子"]);
export function memoryTerms(query: string) { return terms(query).filter(t => !genericTerms.has(t)).slice(0, 24); }

export function memoryItems(rows: Message[], query: string): ContextItem[] {
  const tokens = memoryTerms(query);
  const score = (row: Message) => tokens.reduce((n, token) => n + (row.content.toLowerCase().includes(token) ? 1 : 0), 0);
  const preferences = rows.filter(row => row.role === "USER" && preferenceMarkers.some(marker => row.content.includes(marker))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6);
  const relevant = rows.filter(row => score(row) > 0).sort((a, b) => score(b) - score(a) || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6);
  let bytes = 0;
  return [...new Map([...preferences, ...relevant].map(row => [row.id, row])).values()].flatMap(row => {
    const content = JSON.stringify({ role: row.role, recordedAt: row.createdAt.toISOString(), text: row.content, boundary: "历史记录可能已经过时；本轮要求优先，较新的用户要求覆盖旧要求。不能据此自动确认身份、经历或其他事实。" });
    const size = Buffer.byteLength(content, "utf8");
    if (bytes + size > 6000) return [];
    bytes += size;
    return [{ objectType: "CONVERSATION_MEMORY", objectId: row.id, version: row.updatedAt.toISOString(), ownership: "PENDING" as const, provenance: "persisted_private_conversation", whySelected: "从当前用户当前项目的持久历史召回偏好或相关讨论", truncated: false, content }];
  });
}

/** Retrieval spans persisted history, not just the recent model context window. */
export async function recallAssistantMemory(input: Actor & { query: string; excludeIds: string[]; before: Date }, dependencies: { cache?: AssistantCache; store?: typeof db } = {}) {
  const store = dependencies.store ?? db;
  const cache = dependencies.cache ?? assistantCache;
  const thread = { id: input.threadId, workspaceId: input.workspaceId, projectId: input.projectId, createdById: input.userId, canvasObjectId: null, workspace: { disabledAt: null, members: { some: { userId: input.userId, disabledAt: null, user: { disabledAt: null } } } } };
  if (!await store.assistantThread.findFirst({ where: thread, select: { id: true } })) throw new AIControlError("PERMISSION_DENIED");
  const where = { threadId: input.threadId, thread, status: "COMPLETED" as const, id: { notIn: input.excludeIds }, createdAt: { lt: input.before } };
  // New messages or edits change the version. Even a cache hit never bypasses scope checks.
  const latest = await store.assistantMessage.findFirst({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, updatedAt: true } });
  const key = assistantCacheKey("memory", { workspaceId: input.workspaceId, userId: input.userId, projectId: input.projectId, threadId: input.threadId, query: input.query, excludeIds: input.excludeIds, latest });
  let cached: unknown;
  try { cached = JSON.parse(await cache.get(key) ?? "null"); } catch { cached = null; }
  const ids = Array.isArray(cached) && cached.length <= 12 && cached.every(id => typeof id === "string") ? cached as string[] : null;
  const select = { id: true, content: true, role: true, createdAt: true, updatedAt: true } as const;
  let rows: Message[];
  if (ids) rows = await store.assistantMessage.findMany({ where: { ...where, id: { in: ids, notIn: input.excludeIds } }, select });
  else {
    const tokens = memoryTerms(input.query);
    const [preferences, relevant] = await Promise.all([
      store.assistantMessage.findMany({ where: { ...where, role: "USER", OR: preferenceMarkers.map(marker => ({ content: { contains: marker } })) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12, select }),
      tokens.length ? store.assistantMessage.findMany({ where: { ...where, OR: tokens.map(token => ({ content: { contains: token, mode: "insensitive" as const } })) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40, select }) : Promise.resolve([]),
    ]);
    rows = [...new Map([...preferences, ...relevant].map(row => [row.id, row])).values()];
  }
  const items = memoryItems(rows, input.query);
  if (!ids) await cache.set(key, JSON.stringify(items.map(item => item.objectId)), 60).catch(() => {});
  return { items, cacheHit: Boolean(ids) };
}
