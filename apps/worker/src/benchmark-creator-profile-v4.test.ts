import { describe, expect, it } from "vitest";
import {
  LLMError,
  benchmarkCreatorProfileGenerationV4Schema,
  benchmarkCreatorProfileInputV4Schema,
  benchmarkCreatorProfileOutputV4Instruction,
  buildDeterministicCreatorProfileSummary,
  type BenchmarkCreatorProfileGenerationV4,
} from "@content-center/providers";
import { normalizeBenchmarkCreatorProfileV4Output, type CreatorProfileAtom } from "./benchmark-creator-profile";

function fixture() {
  const inputs = Array.from({ length: 5 }, (_, index) => ({ sampleId: `s${index + 1}`, sourceItemId: `source-${index + 1}`, materialDistillationId: `m7-${index + 1}`, materialDistillationVersion: index + 1 }));
  const atomTexts = ["开头直接给出具体成交数字和学生成绩", "中间才补充转化率作为说明", "客户案例用于证明观点", "直播结果开场后解释原因", "个人现场经历和行业观点"];
  const atoms: CreatorProfileAtom[] = inputs.map((input, index) => ({ ...input, ref: `E00${index + 1}`, itemKind: "HIGHLIGHT", itemKey: "0", title: `精华 ${index + 1}`, text: atomTexts[index]!, type: "method", quality: "OBSERVE", sourceRefs: ["T001"], evidence: [{ ref: "T001", text: atomTexts[index]! }] }));
  const manifest = benchmarkCreatorProfileInputV4Schema.parse({ kind: "CREATOR_PROFILE_INPUT", schemaVersion: "benchmark-creator-profile-v4", account: { name: "真实博主", platform: "DOUYIN", bio: "面向教培机构老板和校区管理者", tags: ["教培运营"] }, distillations: inputs, accountResearch: null, priorProfileVersion: 9 });
  return { inputs, atoms, manifest };
}

const signal = (code: string, evidenceRefs: string[]) => ({ code, evidenceRefs });
const video = (index: number, primaryTopic: string, topicSignals: unknown[] = [], styleSignals: unknown[] = []) => ({ sampleRef: `V00${index}`, primaryTopic, topicSignals, styleSignals });
const generation = (videos: unknown[]): BenchmarkCreatorProfileGenerationV4 => benchmarkCreatorProfileGenerationV4Schema.parse({ videos });

describe("benchmark creator profile V4 deterministic signals", () => {
  it("derives a conservative PROFILE from explicit metadata and current topics", () => {
    const data = fixture();
    const summary = buildDeterministicCreatorProfileSummary(data.manifest.account, ["短视频招生", "招生转化", "定价策略", "行业观点", "直播执行"]);
    expect(summary).toEqual({ status: "CLEAR", text: "从当前研究内容看，这个账号主要面向教培机构老板和校区管理者，内容主要涉及招生、成交、定价、行业观点和执行等教培经营问题。" });
    for (const term of ["全链路服务商", "赋能者", "竞争壁垒", "增长飞轮", "护城河"]) expect(summary?.text).not.toContain(term);
  });

  it("does not guess an audience from unclear metadata and never marks one video CLEAR", () => {
    const unclear = { name: "普通账号", platform: "DOUYIN", bio: "分享日常内容", tags: [] };
    expect(buildDeterministicCreatorProfileSummary(unclear, ["行业观点", "直播执行"])?.text).toBe("从当前研究内容看，这个账号主要讨论行业观点和执行等内容。");
    expect(buildDeterministicCreatorProfileSummary(unclear, ["行业观点", "直播执行"])?.status).toBe("OBSERVE");
    expect(buildDeterministicCreatorProfileSummary(fixture().manifest.account, ["短视频招生"])?.status).toBe("OBSERVE");
  });

  it("does not accept a model-generated PROFILE in the V4 contract", () => {
    expect(benchmarkCreatorProfileGenerationV4Schema.safeParse({ profile: { text: "AI 标签" }, videos: [] }).success).toBe(false);
  });

  it("keeps NUMBER_RESULT only for the video classified as using it as an entry", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([
      video(1, "招生成交", [signal("NUMBER_RESULT", ["E001"])]), video(2, "招生成交"), video(3, "案例运营"), video(4, "直播执行"), video(5, "行业观点"),
    ]), data.atoms, data.manifest);
    expect(output.videoSignals[0]?.topicSignals.map(({ code }) => code)).toEqual(["NUMBER_RESULT"]);
    expect(output.videoSignals[1]?.topicSignals).toEqual([]);
    expect(output.aggregatedSignals.some(({ code }) => code === "NUMBER_RESULT")).toBe(false);
  });

  it("keeps CASE_ENTRY and CASE_DATA_EVIDENCE independent on one video", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "案例运营"), video(2, "招生成交"), video(3, "案例运营", [signal("CASE_ENTRY", ["E003"])], [signal("CASE_DATA_EVIDENCE", ["E003"])]), video(4, "直播执行"), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(output.videoSignals[2]).toMatchObject({ topicSignals: [{ code: "CASE_ENTRY" }], styleSignals: [{ code: "CASE_DATA_EVIDENCE" }] });
    expect(output.aggregatedSignals).toEqual([]);
  });

  it("rejects a signal that cites another video's EvidenceRef", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生成交", [signal("NUMBER_RESULT", ["E002"])]), video(2, "招生成交"), video(3, "案例运营"), video(4, "直播执行"), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(output.videoSignals[0]?.topicSignals).toEqual([]);
  });

  it("aggregates two NUMBER_RESULT videos as OBSERVE and three as CLEAR", () => {
    const data = fixture();
    const two = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生成交", [signal("NUMBER_RESULT", ["E001"])]), video(2, "招生成交"), video(3, "案例运营"), video(4, "直播执行", [signal("NUMBER_RESULT", ["E004"])]), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(two.cards.find(({ code }) => code === "TOPIC_STYLE")).toMatchObject({ status: "OBSERVE", claims: [{ text: expect.stringContaining("数字或结果") }] });
    const three = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生成交", [signal("NUMBER_RESULT", ["E001"])]), video(2, "招生成交", [signal("NUMBER_RESULT", ["E002"])]), video(3, "案例运营"), video(4, "直播执行", [signal("NUMBER_RESULT", ["E004"])]), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(three.cards.find(({ code }) => code === "TOPIC_STYLE")?.status).toBe("CLEAR");
  });

  it("keeps four-source CASE_DATA_EVIDENCE but drops one-source EXPERIENCE_STORY", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([
      video(1, "招生成交", [], [signal("CASE_DATA_EVIDENCE", ["E001"])]), video(2, "招生成交", [], [signal("CASE_DATA_EVIDENCE", ["E002"])]), video(3, "案例运营", [], [signal("CASE_DATA_EVIDENCE", ["E003"])]), video(4, "直播执行", [], [signal("CASE_DATA_EVIDENCE", ["E004"])]), video(5, "行业观点", [], [signal("EXPERIENCE_STORY", ["E005"])]),
    ]), data.atoms, data.manifest);
    const style = output.cards.find(({ code }) => code === "CONTENT_STYLE");
    expect(style).toMatchObject({ status: "CLEAR", claims: [{ text: "经常用案例或数据把观点讲具体。" }] });
    expect(output.aggregatedSignals.some(({ code }) => code === "EXPERIENCE_STORY")).toBe(false);
  });

  it("renders different signals as separate deterministic bullets", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([
      video(1, "招生成交", [], [signal("RESULT_THEN_EXPLAIN", ["E001"]), signal("QUESTION_DRIVEN", ["E001"])]), video(2, "招生成交", [], [signal("RESULT_THEN_EXPLAIN", ["E002"]), signal("QUESTION_DRIVEN", ["E002"])]), video(3, "案例运营", [], [signal("RESULT_THEN_EXPLAIN", ["E003"])]), video(4, "直播执行"), video(5, "行业观点"),
    ]), data.atoms, data.manifest);
    expect(output.cards.find(({ code }) => code === "CONTENT_STYLE")?.claims.map(({ text }) => text)).toEqual(["比较常见的是先给出结果，再解释为什么。", "当前样本中多次使用提问或反问推进内容。"]);
  });

  it("counts exact primary topics without semantically merging near-synonyms", () => {
    const data = fixture();
    const repeated = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生成交"), video(2, "招生成交"), video(3, "招生成交"), video(4, "直播执行"), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(repeated.cards.find(({ code }) => code === "CONTENT_MIX")).toMatchObject({ status: "CLEAR", claims: [{ text: "当前分析的 5 条里：3 条主要围绕“招生成交”；1 条主要围绕“行业观点”；1 条主要围绕“直播执行”。" }] });
    const near = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生"), video(2, "招生成交"), video(3, "招生"), video(4, "直播执行"), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(near.cards.find(({ code }) => code === "CONTENT_MIX")?.claims[0]?.text).toContain("2 条主要围绕“招生”");
    expect(near.cards.find(({ code }) => code === "CONTENT_MIX")?.claims[0]?.text).toContain("1 条主要围绕“招生成交”");
  });

  it("reports a dispersed current batch without inventing a proportion", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生"), video(2, "成交"), video(3, "案例"), video(4, "直播"), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(output.cards.find(({ code }) => code === "CONTENT_MIX")).toMatchObject({ status: "OBSERVE", claims: [{ text: "当前这批代表内容主题比较分散，还不足以判断明显的内容比例。" }] });
  });

  it("derives at most three LEARN bullets only from repeated formal signals", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([
      video(1, "招生成交", [signal("SPECIFIC_PROBLEM", ["E001"])], [signal("CASE_DATA_EVIDENCE", ["E001"])]), video(2, "招生成交", [signal("SPECIFIC_PROBLEM", ["E002"])], [signal("CASE_DATA_EVIDENCE", ["E002"])]), video(3, "案例运营", [signal("SPECIFIC_PROBLEM", ["E003"])], [signal("CASE_DATA_EVIDENCE", ["E003"])]), video(4, "直播执行", [signal("CASE_ENTRY", ["E004"])]), video(5, "行业观点"),
    ]), data.atoms, data.manifest);
    const learn = output.cards.find(({ code }) => code === "LEARN");
    expect(learn?.claims).toHaveLength(2);
    expect(learn?.claims.every(({ derivedFrom }) => derivedFrom.length === 1)).toBe(true);
    expect(learn?.claims.some(({ text }) => text.includes("单条"))).toBe(false);
  });

  it("does not generate LEARN from a signal found in only one video", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生成交", [signal("CASE_ENTRY", ["E001"])]), video(2, "成交"), video(3, "案例"), video(4, "直播"), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(output.cards.some(({ code }) => code === "LEARN")).toBe(false);
  });

  it("keeps the current-account third-party fact boundary in AVOID", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生成交"), video(2, "招生成交"), video(3, "案例运营"), video(4, "直播执行"), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(output.cards.find(({ code }) => code === "AVOID")?.claims[0]?.text).toContain("不能变成我们的事实");
  });

  it("never generates RECURRING_VIEWPOINT and does not use PROFILE to support signals", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生"), video(2, "成交"), video(3, "案例"), video(4, "直播"), video(5, "行业观点")]), data.atoms, data.manifest);
    expect(output.cards.find(({ code }) => code === "PROFILE")?.status).toBe("CLEAR");
    expect(output.cards.some(({ code }) => code === "RECURRING_VIEWPOINT")).toBe(false);
    expect(output.cards.some(({ code }) => code === "TOPIC_STYLE" || code === "CONTENT_STYLE")).toBe(false);
  });

  it("requires every selected video and rejects abstract topic labels", () => {
    const data = fixture();
    expect(() => normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "招生"), video(2, "成交")]), data.atoms, data.manifest)).toThrowError(LLMError);
    expect(() => generation([video(1, "增长飞轮"), video(2, "成交"), video(3, "案例"), video(4, "直播"), video(5, "行业观点")])).not.toThrow();
    expect(() => normalizeBenchmarkCreatorProfileV4Output(generation([video(1, "增长飞轮"), video(2, "成交"), video(3, "案例"), video(4, "直播"), video(5, "行业观点")]), data.atoms, data.manifest)).toThrowError(LLMError);
  });

  it("keeps the prompt per-video, fixed-signal, Transcript-grounded, and single-call", () => {
    expect(benchmarkCreatorProfileOutputV4Instruction).toContain("Classify every supplied video independently");
    expect(benchmarkCreatorProfileOutputV4Instruction).toContain("NUMBER_RESULT applies only");
    expect(benchmarkCreatorProfileOutputV4Instruction).toContain("title alone does not establish QUESTION_DRIVEN");
    expect(benchmarkCreatorProfileOutputV4Instruction).toContain("program alone counts repeated signals");
    expect(benchmarkCreatorProfileOutputV4Instruction).not.toContain("M8");
  });
});
