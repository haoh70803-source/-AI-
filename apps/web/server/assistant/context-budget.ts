import type { ContextItem } from "../ai/control/contracts";

/** UTF-8 bytes are a conservative bound, not an advertised model token count. */
export function fitContext(items: ContextItem[], maximumBytes = 24_000) {
  let usedBytes = 2;
  const included: ContextItem[] = [];
  const omitted: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.objectType}:${item.objectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const size = (value: ContextItem) => Buffer.byteLength(JSON.stringify(value), "utf8") + 1;
    const remaining = maximumBytes - usedBytes;
    if (size(item) <= remaining) { included.push(item); usedBytes += size(item); continue; }
    // Recent messages and Skill instructions are atomic: never slice them into misleading fragments.
    if (["ASSISTANT_MESSAGE", "METHOD_VERSION", "CONVERSATION_MEMORY"].includes(item.objectType) || remaining < 800) { omitted.push(key); continue; }
    let low = 0; let high = item.content.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (size({ ...item, content: item.content.slice(0, mid), truncated: true }) <= remaining) low = mid;
      else high = mid - 1;
    }
    if (!low) { omitted.push(key); continue; }
    const bounded = { ...item, content: item.content.slice(0, low), truncated: true };
    included.push(bounded); usedBytes += size(bounded);
  }
  return { items: included, budget: { maximumBytes, usedBytes, omitted } };
}
