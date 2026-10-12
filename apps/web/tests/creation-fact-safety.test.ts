import { expect, it } from "vitest";
import { inspectCreationFactText } from "../server/studio/fact-safety";
it.each([
  ["我们学校当年接待了很多家长，这是示例。", true],
  ["外部案例，我们已经实现咨询翻倍。", true],
  ["示例：我们已经验证招生翻倍。", true],
  ["假设示例：一家机构开设阅读课。", false],
  ["课程提供全额退费。", true],
  ["不承诺全额退费。", false],
  ["我们学校每年保证录取，包过。", true],
  ["未提供官方政策，不要承诺保录。", false],
  ["学习可以先从关键词定位开始。", false],
  ["引用的资料说明课程安排[9]。", true],
])("strict checks %s without authenticating example labels", (text, blocked) => expect(inspectCreationFactText(text, []).blocked).toBe(blocked));
it("does not expand a confirmed fragment into new facts or external personal experience", () => {
  expect(inspectCreationFactText("我做教培12年，收入翻倍。", ["我做教培12年。"]).blocked).toBe(true);
  expect(inspectCreationFactText("我做教培12年。", ["我做教培12年。"]).blocked).toBe(false);
  const sources = [{ citation: 1, excerpt: "阅读课6次，每次60分钟，费用980元。外部案例：我们接待了20名学员。" }];
  expect(inspectCreationFactText("阅读课6次，每次60分钟，费用980元[1]。", [], sources).blocked).toBe(false);
  expect(inspectCreationFactText("阅读课6次，每次60分钟，费用880元[1]。", [], sources).blocked).toBe(true);
  expect(inspectCreationFactText("我们接待了20名学员[1]。", [], sources).blocked).toBe(true);
});
