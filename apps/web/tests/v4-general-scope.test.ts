import { expect, it } from "vitest";
import { ScopeGate } from "../server/ai/control/scope-gate";

it.each(["帮我做数学作业", "写代码作业的单元测试", "解释恐龙是什么", "分析这个项目的数据"]) (
  "allows a general project task: %s", userInput => {
    expect(new ScopeGate().evaluate({ workspaceId: "w", userId: "u", projectId: "p", taskType: "GENERAL_QUERY", userInput }).decision).toBe("ALLOW_WITH_CONTEXT");
  },
);
it("retains the old content taxonomy for legacy content tasks", () => {
  expect(new ScopeGate().evaluate({ workspaceId: "w", userId: "u", projectId: "p", taskType: "DRAFT_SUGGESTION", userInput: "帮我做数学作业" }).decision).toBe("OUT_OF_SCOPE");
});
