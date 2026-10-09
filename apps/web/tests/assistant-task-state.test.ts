import { expect, it } from "vitest";
import { advanceTaskState, readTaskState, taskDialogue, taskNeedsKnowledge } from "../server/assistant/task-state";
const first = { id: "first", content: "帮我把一件日常小事写成朋友圈文案。50字以内简短版，约120字叙事版，再给配图建议。根据真实场景和感受，不编故事。" };
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
