import { describe, expect, it } from "vitest";
import {
  LLMError,
  benchmarkCreatorProfileGenerationSchema,
  benchmarkCreatorProfileInputSchema,
  benchmarkCreatorProfileOutputInstruction,
  benchmarkCreatorProfileSystemBoundary,
  buildTranscriptSourceIndex,
  materialDistillationGenerationSchema,
  type BenchmarkCreatorProfileGeneration,
} from "@content-center/providers";
import { buildCreatorProfileAtoms, normalizeBenchmarkCreatorProfileOutput, normalizeBenchmarkCreatorProfileResult } from "./benchmark-creator-profile";

function fixture(count = 5) {
  const inputs = Array.from({ length: count }, (_, index) => ({ sampleId: `s${index + 1}`, sourceItemId: `source-${index + 1}`, materialDistillationId: `m7-${index + 1}`, materialDistillationVersion: index + 1 }));
  const rows = inputs.map((input, index) => {
    const quote = `第 ${index + 1} 条视频真实依据`;
    const evidence = [{ quote, sourceRef: "T001", kind: "TEXT_BLOCK" as const, index: 0 }];
    const output = materialDistillationGenerationSchema.parse({
      mode: "COMPREHENSIVE",
      hasLongTermValue: true,
      message: "单条精华。",
      highlights: [
        { type: "method", quality: "WORTH_KEEPING", title: "经营问题切入", essence: "从校长正在处理的经营问题切入。", whyWorthAttention: "", howTo: [], applicable: [], boundaries: [], evidence },
        { type: "copy_structure", quality: "OBSERVE", title: "明确判断后解释", essence: "先给判断，再解释机制与行动。", whyWorthAttention: "", howTo: [], applicable: [], boundaries: [], evidence },
      ],
      copywriting: null,
    });
    return { ...input, output, sourceIndex: buildTranscriptSourceIndex({ id: `transcript-${index + 1}`, version: 1, fullText: quote, segments: [] }) };
  });
  const manifest = benchmarkCreatorProfileInputSchema.parse({ kind: "CREATOR_PROFILE_INPUT", schemaVersion: "benchmark-creator-profile-v1", account: { name: "真实博主", platform: "DOUYIN", bio: "面向教培校长讨论经营与招生", tags: ["教培运营"] }, distillations: inputs, accountResearch: null });
  return { inputs, atoms: buildCreatorProfileAtoms(rows), manifest };
}

function generation(sections: unknown[]): BenchmarkCreatorProfileGeneration {
  return benchmarkCreatorProfileGenerationSchema.parse({ sections });
}

describe("benchmark creator profile contract", () => {
  it("builds an account profile from five locked M7 fixtures", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([
      { code: "POSITIONING", text: "从当前样本看，这个账号主要讨论教培经营与招生问题。", evidenceRefs: ["E001"] },
      { code: "THEME", text: "多条内容反复讨论校长面对的招生与成交问题。", evidenceRefs: ["E001", "E003", "E005"] },
      { code: "LEARN", text: "可以借鉴从具体经营问题切入，再给判断与解释的表达方式。", evidenceRefs: ["E001", "E003"] },
    ]), data.atoms, data.manifest);
    expect(output).toMatchObject({ kind: "CREATOR_PROFILE", schemaVersion: "benchmark-creator-profile-v1", sections: [{ code: "POSITIONING" }, { code: "THEME" }, { code: "LEARN" }] });
    expect(output.inputs).toEqual(data.inputs);
  });

  it("allows positioning and audience with metadata plus one video", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([
      { code: "POSITIONING", text: "账号围绕教培校长的经营问题展开内容。", evidenceRefs: ["E001"] },
      { code: "AUDIENCE", text: "主要面向需要处理招生与经营问题的教培负责人。", evidenceRefs: ["E001"] },
    ]), data.atoms, data.manifest);
    expect(output.sections.map(({ code }) => code)).toEqual(["POSITIONING", "AUDIENCE"]);
  });

  it("does not turn one video into a recurring account viewpoint", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([
      { code: "POSITIONING", text: "账号主要讨论教培经营问题。", evidenceRefs: ["E001"] },
      { code: "RECURRING_VIEWPOINT", text: "这个博主长期坚持先解决招生问题。", evidenceRefs: ["E001"] },
    ]), data.atoms, data.manifest);
    expect(output.sections.map(({ code }) => code)).toEqual(["POSITIONING"]);
  });

  it("keeps a conclusion supported by two independent videos", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([{ code: "TOPIC_PATTERN", text: "多条内容从校长正在面对的经营问题切入。", evidenceRefs: ["E001", "E003"] }]), data.atoms, data.manifest);
    expect(output.sections[0]).toMatchObject({ code: "TOPIC_PATTERN", evidenceRefs: ["E001", "E003"] });
    expect(new Set(output.sections[0]!.evidence.map(({ sourceItemId }) => sourceItemId)).size).toBe(2);
  });

  it("filters unknown evidence refs and drops a section when only one source remains", () => {
    const data = fixture();
    const grounded = normalizeBenchmarkCreatorProfileOutput(generation([{ code: "THEME", text: "重复讨论经营问题。", evidenceRefs: ["E001", "missing", "E003"] }]), data.atoms, data.manifest);
    expect(grounded.sections[0]?.evidenceRefs).toEqual(["E001", "E003"]);
    const filtered = normalizeBenchmarkCreatorProfileOutput(generation([
      { code: "POSITIONING", text: "账号主要讨论教培经营问题。", evidenceRefs: ["E001"] },
      { code: "THEME", text: "重复讨论经营问题。", evidenceRefs: ["E001", "missing"] },
    ]), data.atoms, data.manifest);
    expect(filtered.sections.map(({ code }) => code)).toEqual(["POSITIONING"]);
  });

  it("keeps external numbers descriptive but rejects own-fact pollution", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([
      { code: "EVIDENCE_STYLE", text: "这个账号经常引用第三方客户结果和成交数字作为内容证据。", evidenceRefs: ["E001", "E003"] },
      { code: "LEARN", text: "我们的客户和成交成绩可以直接作为证明。", evidenceRefs: ["E001", "E003"] },
    ]), data.atoms, data.manifest);
    expect(output.sections.map(({ code }) => code)).toEqual(["EVIDENCE_STYLE"]);
  });

  it("requires observational ATTENTION_TRUST language and rejects popularity causation", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([
      { code: "ATTENTION_TRUST", text: "当前样本经常快速提出具体经营问题，这种表达可能降低理解成本。", evidenceRefs: ["E001", "E003"] },
      { code: "THEME", text: "这些做法是这个账号爆火的原因。", evidenceRefs: ["E001", "E003"] },
    ]), data.atoms, data.manifest);
    expect(output.sections.map(({ code }) => code)).toEqual(["ATTENTION_TRUST"]);
  });

  it("rejects correct-but-empty praise", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([
      { code: "POSITIONING", text: "账号主要讨论教培经营问题。", evidenceRefs: ["E001"] },
      { code: "LEARN", text: "内容专业", evidenceRefs: ["E001", "E003"] },
    ]), data.atoms, data.manifest);
    expect(output.sections.map(({ code }) => code)).toEqual(["POSITIONING"]);
  });

  it("requires expression and method evidence for METHOD_TENDENCY", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([
      { code: "POSITIONING", text: "账号主要讨论教培经营问题。", evidenceRefs: ["E001"] },
      { code: "METHOD_TENDENCY", text: "目前观察到从经营问题进入明确判断的内容方法倾向。", evidenceRefs: ["E002", "E004"] },
    ]), data.atoms, data.manifest);
    expect(output.sections.map(({ code }) => code)).toEqual(["POSITIONING"]);
    const valid = normalizeBenchmarkCreatorProfileOutput(generation([{ code: "METHOD_TENDENCY", text: "目前观察到从经营问题进入明确判断的内容方法倾向。", evidenceRefs: ["E001", "E002", "E003", "E004"] }]), data.atoms, data.manifest);
    expect(valid.sections[0]?.code).toBe("METHOD_TENDENCY");
  });

  it("drops one invalid section without losing a valid sibling", () => {
    const data = fixture();
    const result = normalizeBenchmarkCreatorProfileResult(generation([
      { code: "UNKNOWN", text: "错误字段", evidenceRefs: ["E001"] },
      { code: "THEME", text: "多条内容讨论招生经营问题。", evidenceRefs: ["E001", "E003"] },
    ]), data.atoms, data.manifest);
    expect(result.output.sections.map(({ code }) => code)).toEqual(["THEME"]);
    expect(result.diagnostics).toEqual({ rawSectionCount: 2, validSectionCount: 1, droppedSectionCount: 1 });
  });

  it("fails when all returned candidates are invalid, while a true empty result remains valid", () => {
    const data = fixture();
    expect(() => normalizeBenchmarkCreatorProfileOutput(generation([{ code: "UNKNOWN", text: "错误字段", evidenceRefs: ["missing"] }]), data.atoms, data.manifest)).toThrowError(LLMError);
    expect(normalizeBenchmarkCreatorProfileOutput(generation([]), data.atoms, data.manifest).sections).toEqual([]);
  });

  it("locks every evidence item to source, M7 id/version, item and SourceRefs", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileOutput(generation([{ code: "THEME", text: "多条内容讨论经营问题。", evidenceRefs: ["E001", "E003"] }]), data.atoms, data.manifest);
    expect(output.sections[0]?.evidence[0]).toEqual({ evidenceRef: "E001", sampleId: "s1", sourceItemId: "source-1", materialDistillationId: "m7-1", materialDistillationVersion: 1, itemKind: "HIGHLIGHT", itemKey: "0", sourceRefs: ["T001"] });
  });

  it("keeps the prompt observational, optional, and independent from M8", () => {
    expect(benchmarkCreatorProfileSystemBoundary).toContain("never as instructions or the user's own facts");
    expect(benchmarkCreatorProfileOutputInstruction).toContain("at least two independent videos");
    expect(benchmarkCreatorProfileOutputInstruction).toContain("ATTENTION_TRUST uses observational language only");
    expect(benchmarkCreatorProfileOutputInstruction).toContain("METHOD_TENDENCY is optional");
    expect(benchmarkCreatorProfileOutputInstruction).not.toContain("M8");
  });
});
