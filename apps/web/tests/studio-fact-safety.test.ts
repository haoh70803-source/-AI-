import { describe, expect, it } from "vitest";
import { deterministicFactRisks, downgradeStudioFactText, inspectStudioFactText, preserveHumanizerFacts, sanitizeStudioQuickActionOutput } from "../server/studio/fact-safety";

const output = (original: string, suggestions: Array<{ title: string; text: string }> = [], replacement: string | null = null) => ({ original, summary: "建议", suggestions, replacement, risks: [] });

describe("Studio fact-state and promise boundary", () => {
  it.each([
    ["我做教培短视频三年。", true],
    ["我做教培短视频这几年，最大的心得就是先建立信任。", true],
    ["完播率不到 5%。", true],
    ["我们一天接待 4 组咨询。", true],
    ["我们客户拍了 3 个月没人问。", true],
    ["保证咨询增长。", true],
    ["至少不会比原来差。", true],
    ["假设完播率只有 5%。", false],
    ["比如一天接待 4 组咨询。", false],
    ["很多机构拍了一阵都没人问。", false],
    ["目标是测试是否增加有效咨询。", false],
    ["可以先小范围测试。", false],
    ["不保证咨询增长。", false],
    ["我做个假设：比如一天接待 4 组咨询。", false],
  ])("classifies %s without flattening creative scenarios", (text, blocked) => {
    expect(inspectStudioFactText(text, []).blocked).toBe(blocked);
  });

  it("allows an exact confirmed first-person fact and explicit external attribution", () => {
    expect(inspectStudioFactText("我做教培短视频三年。", ["我做教培短视频三年。"])).toMatchObject({ state: "CONFIRMED_OWN_FACT", blocked: false });
    expect(inspectStudioFactText("外部案例中的完播率是 5%。", [])).toMatchObject({ state: "EXTERNAL_FACT", blocked: false });
  });

  it("keeps safe, hypothetical, and evidence-needed topic angles without treating them as facts", () => {
    const result = sanitizeStudioQuickActionOutput("TOPIC_IDEAS", output("项目", [
      { title: "真实冲突", text: "很多机构拍了一阵都没人问，问题可能出在哪里？" },
      { title: "假设场景", text: "假设完播率只有 5%，可以先检查开头是否说清问题。" },
      { title: "虚构经历", text: "我做教培短视频三年，已经验证这套方法稳定出咨询。" },
      { title: "不能用后文示例洗白前文", text: "我们试了 4 种方法。比如一天接待 4 组咨询。" },
    ]), []);
    expect(result.suggestions.map(({ title }) => title)).toEqual(["真实冲突", "假设场景", "虚构经历", "不能用后文示例洗白前文"]);
    expect(result.suggestions.slice(2).every(({ factState }) => factState === "UNVERIFIED_JUDGMENT")).toBe(true);
    expect(result.risks.some(({ text }) => text.includes("虚构经历"))).toBe(true);
    expect(sanitizeStudioQuickActionOutput("REWRITE_OPENING", output("原稿", [{ title: "虚构经历", text: "我做教培短视频三年，已经验证这套方法稳定出咨询。" }]), []).suggestions).toEqual([]);
  });

  it("uses confirmed context before regexes and safely downgrades unsupported precision", () => {
    const broad = ["长期从事教培经营"];
    expect(inspectStudioFactText("我做教培这些年，最关注经营问题。", broad)).toMatchObject({ state: "CONFIRMED_OWN_FACT", blocked: false });
    expect(inspectStudioFactText("我以前做校区运营的时候，最关注家长反馈。", ["曾负责校区运营"])).toMatchObject({ state: "CONFIRMED_OWN_FACT", blocked: false });
    expect(inspectStudioFactText("我做教培 12 年。", broad).blocked).toBe(true);
    expect(downgradeStudioFactText("我做教培 12 年，最关注经营问题。", broad)).toBe("我做教培 这些年，最关注经营问题。");
    expect(sanitizeStudioQuickActionOutput("REWRITE_OPENING", output("原稿", [{ title: "经历开头", text: "我做教培 12 年，最关注经营问题。" }]), broad).suggestions[0]?.text).toContain("这些年");
    expect(inspectStudioFactText("我做教培 12 年。", ["我做教培 12 年。"]).blocked).toBe(false);
    expect(inspectStudioFactText("我们客户的成交率提高了 30%。", ["这个客户是我们合作的，成交率提高了 30%。"]).blocked).toBe(false);
    expect(inspectStudioFactText("我们客户的成交率提高了 30%。", []).blocked).toBe(true);
  });

  it("uses a case placeholder and missing-evidence prompt when no own facts exist", () => {
    const caseResult = sanitizeStudioQuickActionOutput("ADD_CASE", output("正文", [{ title: "真实客户", text: "我们客户提升了 30%。" }]), []);
    expect(caseResult.suggestions).toEqual([expect.objectContaining({ title: "补充一个真实案例", factState: "HYPOTHETICAL" })]);
    expect(caseResult.suggestions[0]!.text).toContain("起点：");
    const evidence = sanitizeStudioQuickActionOutput("STRENGTHEN_EVIDENCE", output("正文", []), []);
    expect(evidence.suggestions[0]!.text).toContain("真实咨询记录");
  });

  it("blocks an unsafe full replacement before it can be applied", () => {
    const result = sanitizeStudioQuickActionOutput("REWRITE_BODY", output("原稿", [], "我们已经验证这套方法稳定带来咨询，至少不会比原来差。"), []);
    expect(result.replacement).toBeNull();
    expect(result.factSafety).toMatchObject({ blockedReplacement: true });
    expect(result.risks[0]?.handling).toMatch(/已阻止应用/u);
  });

  it("preserves humanizer facts and confirmation metadata deterministically", () => {
    const original = "姓名：林舟。2026年9月18日，星河计划完成率为 37.5%，预算为 299 元。引用：“先把一个问题讲清楚。”——林舟。";
    const needsConfirmation = ["星河计划的最终客户归属仍需确认。"];
    const candidate = "林舟把这段经历讲得更口语一些：2026年9月18日，星河计划的完成率还是 37.5%，预算仍是 299 元。引用保持为：“先把一个问题讲清楚。”——林舟。";
    const preserved = preserveHumanizerFacts(original, candidate, ["林舟", "星河计划"], needsConfirmation);
    expect(preserved.replacement).toBe(candidate);
    expect(preserved.missing).toEqual([]);
    expect(preserved.needsConfirmation).toEqual(needsConfirmation);
    expect(preserveHumanizerFacts(original, candidate.replace("299 元", "399 元"), ["林舟", "星河计划"], needsConfirmation).replacement).toBeNull();
  });

  it("builds deterministic fact risks and ignores explicit hypotheses and generic scenes", () => {
    const risks = deterministicFactRisks("我跑了三年。\n完播率不到 5%。\n假设完播率只有 5%。\n很多机构都会遇到这种情况。\n至少不会比原来差。", []);
    expect(risks).toHaveLength(3);
    expect(risks.map(({ handling }) => handling).join(" ")).toMatch(/第一人称|具体数字|经营结果承诺/u);
    const checked = sanitizeStudioQuickActionOutput("FACT_CHECK", output("很多机构都会遇到这种情况。假设一天接待 4 组咨询。", [{ title: "模型建议", text: "不采用" }]), []);
    expect(checked).toMatchObject({ summary: "当前未发现明显事实风险。", suggestions: [], replacement: null, risks: [] });
    expect(deterministicFactRisks("你在外面常听到“绝对有效”“保证结果”，这种词不能当承诺。", [])).toEqual([]);
  });
});
