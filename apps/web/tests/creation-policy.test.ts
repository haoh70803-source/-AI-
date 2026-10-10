import { describe, expect, it } from "vitest";
import { creationOptionsSchema } from "../lib/contracts/creation";
import { mergeLocalEdit, paragraphScope, resolveCreationPolicy } from "../server/assistant/creation-policy";
import { creationCases } from "./fixtures/creation-cases";
describe("creation strategies", () => {
  for (const sample of creationCases) it(sample.name, () => {
    const policy = resolveCreationPolicy(sample.prompt);
    expect(policy.task).toBe(sample.task);
    expect(policy.instruction).toContain("本轮明确要求优先");
    expect(policy.instruction).not.toContain("至少500字");
  });
  it("keeps answers short and plans complete without a universal length floor", () => {
    expect(resolveCreationPolicy("什么是错题整理？").maxCompletionTokens).toBeLessThan(resolveCreationPolicy("写一个完整招生策划").maxCompletionTokens);
    expect(resolveCreationPolicy("一句话解释招生方案").depth).toBe("BRIEF");
    expect(resolveCreationPolicy("什么是口播稿？").task).toBe("QA");
    expect(resolveCreationPolicy("制定一个包含选题的招生策划").task).toBe("PLAN");
  });
  it("honors configured depth and real divergence, then focuses on a chosen direction", () => {
    const options = creationOptionsSchema.parse({ mode: "EXPLORE", divergence: "WIDE", depth: "DEEP", naturalness: "PROFESSIONAL", persona: "校长" });
    const explore = resolveCreationPolicy("谈家校沟通", options);
    expect(explore.instruction).toContain("5个"); expect(explore.instruction).toContain("至少改变两个维度");
    const execute = resolveCreationPolicy("按第二个方向写成稿", { ...options, mode: "EXECUTE" });
    expect(execute.mode).toBe("EXECUTE"); expect(execute.instruction).toContain("不再附无关方案");
    expect(resolveCreationPolicy("只改开头", options).mode).toBe("EXECUTE");
  });
  it("merges selected Unicode text and preserves every untouched character", () => {
    const body = "第一段🙂。\r\n\r\n第二段需要修改。\r\n\r\n第三段原样。";
    const scope = paragraphScope(body, "只改第二段")!;
    const merged = mergeLocalEdit(body, scope, "新版本：修改后的片段。");
    expect(merged).toBe("第一段🙂。\r\n\r\n修改后的片段。\r\n\r\n第三段原样。");
    expect(() => mergeLocalEdit(body, { start: 0, end: 999 }, "错误")).toThrow();
    expect(() => paragraphScope(body, "只改第九段")).toThrow();
    expect(paragraphScope("第一段。\n第二段。\n第三段。", "只改第二段")).toEqual({ start: 5, end: 9 });
    expect(paragraphScope("第一段。\n第二段。\n第三段。", "把第二段缩短一半")).toEqual({ start: 5, end: 9 });
    expect(paragraphScope("第一段。\n第二段。\n第三段。", "不要修改第二段")).toBeNull();
  });
  it("rejects unsupported controls rather than silently ignoring them", () => {
    expect(creationOptionsSchema.safeParse({ depth: "FOREVER" }).success).toBe(false);
    expect(creationOptionsSchema.safeParse({ persona: "x".repeat(161) }).success).toBe(false);
  });
});
