import { expect, it } from "vitest";
import { advanceTaskState, readTaskState, resolveAssistantIntent, taskDialogue, taskNeedsKnowledge } from "../server/assistant/task-state";
const first = { id: "first", content: "帮我把一件日常小事写成朋友圈文案。50字以内简短版，约120字叙事版，再给配图建议。根据真实场景和感受，不编故事。" };
it.each(["你好", "什么是知识库？", "解释递归", "写一段生日祝福", "短一点", "你可以检索飞书知识库吗？"])("answers without automatic retrieval: %s", content => {
  const state = advanceTaskState(null, { id: "now", content });
  expect(resolveAssistantIntent(state, content)).toEqual({ knowledgeRetrieval: false, webQuery: null, mediaUrl: null, directAnswer: true });
});
it("distinguishes library retrieval from web search and explicit source reading", () => {
  const state = advanceTaskState(null, { id: "now", content: "搜索知识库中的品牌资料" });
  expect(resolveAssistantIntent(state, state.anchor.content, { webQuery: state.anchor.content })).toMatchObject({ knowledgeRetrieval: true, webQuery: null, directAnswer: false });
  expect(resolveAssistantIntent(state, "根据引用资料写一版", { hasExplicitContext: true })).toMatchObject({ knowledgeRetrieval: false, directAnswer: true });
  expect(resolveAssistantIntent(state, "根据飞书知识库和引用资料写一版", { hasExplicitContext: true })).toMatchObject({ knowledgeRetrieval: true });
  expect(resolveAssistantIntent(state, "联网搜索最新政策", { webQuery: "最新政策" })).toMatchObject({ knowledgeRetrieval: false, webQuery: "最新政策", directAnswer: false });
  expect(resolveAssistantIntent(state, "搜索知识库并联网搜索最新政策", { webQuery: "最新政策" })).toMatchObject({ knowledgeRetrieval: true, webQuery: "最新政策" });
});
it("inherits retrieval only for a continuation, not edits or unrelated questions", () => {
  const state = advanceTaskState(null, { id: "first", content: "根据飞书知识库写方案" });
  expect(taskNeedsKnowledge(state, "继续写方案")).toBe(true);
  expect(taskNeedsKnowledge(state, "润色一下")).toBe(false);
  expect(taskNeedsKnowledge(state, "1加1等于几")).toBe(false);
  expect(taskNeedsKnowledge(state, "不用知识库，直接回答")).toBe(false);
});
it("routes media before web search and respects cancellation", () => {
  const state = advanceTaskState(null, first);
  expect(resolveAssistantIntent(state, "转写这个作品", { mediaUrl: "https://example.com/video", webQuery: "作品" })).toMatchObject({ mediaUrl: "https://example.com/video", webQuery: null, knowledgeRetrieval: false });
  expect(resolveAssistantIntent(state, "不要转写，只解释这个链接", { mediaUrl: "https://example.com/video" })).toMatchObject({ mediaUrl: null, directAnswer: true });
});
it("pins the original task when the user answers the clarifying question", () => {
  const state = advanceTaskState(advanceTaskState(null, first), { id: "second", content: "煮泡面发现鸡蛋没了，清汤寡水吃完，居然挺满足" });
  expect(state.anchor).toEqual(first); expect(state.updates[0]?.content).toContain("挺满足"); expect(taskNeedsKnowledge(state, "短一点")).toBe(false);
  expect(taskNeedsKnowledge(state, "检索飞书的写作知识")).toBe(true);
  const optedOut = advanceTaskState(state, { id: "optout", content: "不用飞书" });
  expect(taskNeedsKnowledge(optedOut, "再写一版")).toBe(false);
  expect(taskNeedsKnowledge(optedOut, "现在检索飞书补充知识")).toBe(true);
});
it("keeps the first supplement and recent edits beyond the context window", () => {
  let state = advanceTaskState(null, first);
  state = advanceTaskState(state, { id: "scene", content: "煮泡面发现鸡蛋没了，居然挺满足" });
  for (let i = 0; i < 12; i++) state = advanceTaskState(state, { id: `edit${i}`, content: "短一点" });
  expect(state.anchor).toEqual(first); expect(state.updates).toHaveLength(4); expect(state.updates[0]?.id).toBe("scene"); expect(state.updates.at(-1)?.id).toBe("edit11");
});
it("replaces the old task when the user explicitly switches work", () => {
  const previous = advanceTaskState(null, first);
  for (const content of ["新任务：分析客户资料", "不写朋友圈了，改写招聘通知", "帮我分析运营成本"]) {
    expect(advanceTaskState(previous, { id: "new", content })).toEqual({ version: 1, anchor: { id: "new", content }, updates: [] });
  }
});
it("preserves roles without duplicating history or importing AI examples as user facts", () => {
  const state = advanceTaskState(advanceTaskState(null, first), { id: "now", content: "居然挺满足" });
  const messages = taskDialogue(state, "now", [{ ...first, role: "USER" }, { id: "answer", role: "ASSISTANT", content: "示例：晚上加了醋" }]);
  expect(messages).toEqual([{ role: "user", content: first.content }, { role: "assistant", content: "示例：晚上加了醋" }]);
  expect(taskDialogue(state, "now", [])[0]).toEqual({ role: "user", content: first.content });
  expect(readTaskState({ version: 1, anchor: { id: "x", content: "x".repeat(4001) }, updates: [] })).toBeNull();
});
