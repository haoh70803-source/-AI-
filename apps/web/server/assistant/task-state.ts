import type { LLMGenerateInput } from "@content-center/providers";

type Turn = { id: string; content: string };
export type AssistantTaskState = { version: 1; anchor: Turn; updates: Turn[] };
function turn(value: unknown): value is Turn { return Boolean(value && typeof value === "object" && typeof (value as Turn).id === "string" && typeof (value as Turn).content === "string" && (value as Turn).content.length <= 4000); }
export function readTaskState(value: unknown): AssistantTaskState | null {
  const state = value as AssistantTaskState | null;
  return state?.version === 1 && turn(state.anchor) && Array.isArray(state.updates) && state.updates.length <= 4 && state.updates.every(turn) ? state : null;
}
/** Bounded user instructions and supplements, never an AI-written interpretation. */
export function advanceTaskState(previous: AssistantTaskState | null, current: Turn): AssistantTaskState {
  const edit = /^(?:再|请|帮我)?(?:改|重写|润色|精简|缩短|扩写|保留|不要|只要|短一点|长一点|口语一点|换个开头|换一个开头|更自然)/u.test(current.content.trim());
  const newTask = /(?:换个任务|换一个任务|新任务|重新开始|不写.{0,12}(?:改|写)|改为|改成|帮我(?:把|写|做|分析|研究|整理)|请(?:写|分析|研究|整理)|^(?:写|分析|研究|审计|介绍|解释|制定|设计))/u.test(current.content.trim());
  const switchTask = /换个任务|换一个任务|新任务|重新开始|不写.{0,12}(?:改|写)|^(?:取消|结束)(?:这个|当前)?任务[。！!\s]*$/u.test(current.content.trim());
  if (!previous || switchTask || (!edit && newTask)) return { version: 1, anchor: current, updates: [] };
  const all = [...previous.updates, current];
  const updates = all.length > 4 ? [all[0]!, ...all.slice(-3)] : all;
  while (updates.length && Buffer.byteLength(JSON.stringify({ anchor: previous.anchor, updates }), "utf8") > 16_000) updates.shift();
  return { version: 1, anchor: previous.anchor, updates };
}
function knowledgeInstruction(text: string): boolean | null {
  if (/(?:不要|不用|无需|禁止)(?:再)?(?:检索|搜索|查询|使用|参考)?(?:飞书|知识库)|只(?:用|使用)(?:我|当前|选中|这些|引用)/u.test(text)) return false;
  // Discussing a capability is not an instruction to execute it.
  if (/(?:什么是|解释|介绍).{0,8}(?:飞书|知识库)|(?:能|可以|支持).{0,8}(?:检索|搜索).{0,8}(?:飞书|知识库).{0,4}[吗么？?]/u.test(text)) return null;
  if (/(?:检索|搜索|搜一下|查一下|查找|查询|参考|根据|使用|结合).{0,24}(?:飞书|知识库|知识|资料)|(?:飞书|知识库).{0,24}(?:检索|搜索|搜一下|查一下|查找|查询)/u.test(text)) return true;
  return null;
}

export function taskNeedsKnowledge(state: AssistantTaskState, current: string, hasExplicitContext = false) {
  const instruction = knowledgeInstruction(current);
  if (instruction !== null) {
    // Explicitly supplied documents are read directly; they do not imply a library search.
    return instruction && (!hasExplicitContext || /飞书|知识库/u.test(current));
  }
  if (hasExplicitContext || /^(?:你好|您好|谢谢|好的|什么是|解释|介绍)/u.test(current.trim())) return false;
  if (/^(?:再|请|帮我)?(?:改|重写|润色|精简|缩短|扩写|保留|短一点|长一点|口语一点|换个开头|换一个开头|更自然)/u.test(current.trim())) return false;
  // Only a task continuation inherits a previous retrieval requirement.
  if (/^(?:继续|接着|按刚才|按照刚才|再来|再写|再给)/u.test(current.trim())) {
    for (const text of [state.anchor.content, ...state.updates.map(t => t.content)].reverse()) {
      const previous = knowledgeInstruction(text);
      if (previous !== null) return previous;
    }
  }
  return false;
}

/** Decide external capabilities before executing any of them. No model call or side effect. */
export function resolveAssistantIntent(state: AssistantTaskState, current: string, candidates: { webQuery?: string | null; mediaUrl?: string | null; hasExplicitContext?: boolean } = {}) {
  const knowledgeRetrieval = taskNeedsKnowledge(state, current, candidates.hasExplicitContext);
  const mediaUrl = /(?:不要|不用|无需|禁止)(?:再)?(?:采集|转写|转录|读取链接)/u.test(current) ? null : candidates.mediaUrl ?? null;
  const knowledgeRequest = knowledgeInstruction(current) === true;
  const explicitWeb = /联网|上网|互联网|网上|网页/u.test(current);
  const webQuery = mediaUrl || (knowledgeRequest && !explicitWeb) ? null : candidates.webQuery ?? null;
  return { knowledgeRetrieval, webQuery, mediaUrl, directAnswer: !knowledgeRetrieval && !webQuery && !mediaUrl };
}
/** Reuse admitted history IDs; never reintroduce an omitted AI answer. */
export function taskDialogue(state: AssistantTaskState, currentId: string, recent: Array<Turn & { role: "USER" | "ASSISTANT" }>): NonNullable<LLMGenerateInput["messages"]> {
  const seen = new Set(recent.map(t => t.id));
  const pinned = [state.anchor, ...state.updates].filter(t => t.id !== currentId && !seen.has(t.id));
  return [...pinned.map(t => ({ role: "user" as const, content: t.content })), ...recent.map(t => ({ role: t.role === "USER" ? "user" as const : "assistant" as const, content: t.content }))];
}
