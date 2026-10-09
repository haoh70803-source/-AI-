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
export function taskNeedsKnowledge(state: AssistantTaskState, current: string) {
  const turns = [state.anchor.content, ...state.updates.map(t => t.content), current];
  for (const text of [...turns].reverse()) {
    if (/(?:不要|不用|无需|禁止)(?:再)?(?:检索|搜索|使用)?飞书|只(?:用|使用)(?:我|当前|选中|这些)/u.test(text)) return false;
    if (/(?:检索|搜索|查询|参考|根据).{0,16}(?:飞书|知识|资料)|飞书/u.test(text)) return true;
  }
  const request = turns.join("\n");
  return !/(?:日常小事|日常分享|真实.{0,8}(?:经历|场景|感受)).{0,200}(?:朋友圈|文案)|朋友圈.{0,200}(?:日常|经历|感受)/su.test(request);
}
/** Reuse admitted history IDs; never reintroduce an omitted AI answer. */
export function taskDialogue(state: AssistantTaskState, currentId: string, recent: Array<Turn & { role: "USER" | "ASSISTANT" }>): NonNullable<LLMGenerateInput["messages"]> {
  const seen = new Set(recent.map(t => t.id));
  const pinned = [state.anchor, ...state.updates].filter(t => t.id !== currentId && !seen.has(t.id));
  return [...pinned.map(t => ({ role: "user" as const, content: t.content })), ...recent.map(t => ({ role: t.role === "USER" ? "user" as const : "assistant" as const, content: t.content }))];
}
