import { describe, expect, it } from "vitest";
import {
  LLMError,
  benchmarkCreatorProfileGenerationV2Schema,
  benchmarkCreatorProfileInputV2Schema,
  benchmarkCreatorProfileOutputV2Instruction,
  buildTranscriptSourceIndex,
  materialDistillationGenerationSchema,
  type BenchmarkCreatorProfileGenerationV2,
} from "@content-center/providers";
import { buildCreatorProfileAtoms, normalizeBenchmarkCreatorProfileV2Output, normalizeBenchmarkCreatorProfileV2Result } from "./benchmark-creator-profile";

function fixture(priorProfile: ReturnType<typeof benchmarkCreatorProfileInputV2Schema.parse>["priorProfile"] = null) {
  const inputs = Array.from({ length: 5 }, (_, index) => ({ sampleId: `s${index + 1}`, sourceItemId: `source-${index + 1}`, materialDistillationId: `m7-${index + 1}`, materialDistillationVersion: index + 1 }));
  const rows = inputs.map((input, index) => {
    const quote = `正文证据 ${index + 1}：先给具体经营结果，再解释原因并给出行动。`;
    const output = materialDistillationGenerationSchema.parse({
      mode: "COMPREHENSIVE", hasLongTermValue: true, message: "已整理。",
      highlights: [{ type: "method", quality: "OBSERVE", title: "经营问题切入", essence: "从具体经营问题或结果切入，解释原因后给行动。", whyWorthAttention: "", howTo: [], applicable: [], boundaries: [], evidence: [{ quote, sourceRef: "T001", kind: "TEXT_BLOCK", index: 0 }] }],
      copywriting: null,
    });
    return { ...input, output, sourceIndex: buildTranscriptSourceIndex({ id: `t-${index + 1}`, version: 1, fullText: quote, segments: [] }) };
  });
  const manifest = benchmarkCreatorProfileInputV2Schema.parse({ kind: "CREATOR_PROFILE_INPUT", schemaVersion: "benchmark-creator-profile-v2", account: { name: "真实博主", platform: "DOUYIN", bio: "面向教培经营者", tags: ["教培运营"] }, distillations: inputs, accountResearch: null, priorProfileVersion: priorProfile?.version ?? null, priorProfile });
  return { inputs, atoms: buildCreatorProfileAtoms(rows), manifest };
}

const generation = (cards: unknown[]): BenchmarkCreatorProfileGenerationV2 => benchmarkCreatorProfileGenerationV2Schema.parse({ cards });
const refs = ["E001", "E002", "E003", "E004", "E005"];

describe("benchmark creator profile V2 product contract", () => {
  it("forms the seven employee cards from five current samples", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV2Output(generation([
      { code: "PROFILE", status: "CLEAR", text: "从当前样本看，这是一个面向教培经营者的实战内容账号。", evidenceRefs: refs.slice(0, 3) },
      { code: "CONTENT_MIX", status: "CLEAR", text: "当前分析的 5 条里，3 条围绕招生和成交，2 条讨论团队执行。", evidenceRefs: refs },
      { code: "TOPIC_STYLE", status: "CLEAR", text: "当前样本经常从具体经营问题或数字结果切入，再解释原因。", evidenceRefs: refs.slice(0, 3) },
      { code: "CONTENT_STYLE", status: "CLEAR", text: "当前样本共同采用的方式是先给具体结果，再解释原因并给出行动。", evidenceRefs: refs.slice(0, 3) },
      { code: "RECURRING_VIEWPOINT", status: "OBSERVE", text: "目前研究到的视频反复强调：\n• 有意向以后还需要持续执行把事情接住。", evidenceRefs: refs.slice(0, 2) },
      { code: "LEARN", status: "CLEAR", text: "可以从员工正在处理的具体问题切入，用自己的真实结果解释，最后给出一个动作。", evidenceRefs: refs.slice(0, 3) },
      { code: "AVOID", status: "CLEAR", text: "可以学证据方式，但来源中的客户、成绩和成交数字不能当成我们的事实。", evidenceRefs: refs.slice(0, 3) },
    ]), data.atoms, data.manifest);
    expect(output.schemaVersion).toBe("benchmark-creator-profile-v2");
    expect(output.cards.map(({ code }) => code)).toEqual(["PROFILE", "CONTENT_MIX", "TOPIC_STYLE", "CONTENT_STYLE", "RECURRING_VIEWPOINT", "LEARN", "AVOID"]);
    expect(output.cards.find(({ code }) => code === "CONTENT_MIX")?.text).toContain("当前分析的 5 条里");
    expect(output.cards.find(({ code }) => code === "RECURRING_VIEWPOINT")?.status).toBe("OBSERVE");
  });

  it("rejects full-account percentages and keeps current-sample counts", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV2Output(generation([
      { code: "PROFILE", status: "OBSERVE", text: "从当前样本看，这是教培经营内容账号。", evidenceRefs: ["E001"] },
      { code: "CONTENT_MIX", status: "CLEAR", text: "账号 60% 的内容都在讲招生。", evidenceRefs: refs.slice(0, 3) },
      { code: "CONTENT_MIX", status: "CLEAR", text: "当前分析的 5 条里，3 条围绕招生。", evidenceRefs: refs.slice(0, 3) },
    ]), data.atoms, data.manifest);
    expect(output.cards.map(({ code }) => code)).toEqual(["PROFILE", "CONTENT_MIX"]);
    expect(output.cards[1]?.text).not.toContain("60%");
  });

  it("blocks evidence-union style claims but accepts a true cross-video intersection", () => {
    const data = fixture();
    data.atoms[0]!.text += " 这条采用采访和到校记录。";
    const union = normalizeBenchmarkCreatorProfileV2Output(generation([
      { code: "PROFILE", status: "OBSERVE", text: "从当前样本看，这是教培经营内容账号。", evidenceRefs: ["E001"] },
      { code: "CONTENT_STYLE", status: "CLEAR", text: "这个账号经常用采访、成交数字和团队故事。", evidenceRefs: refs.slice(0, 3) },
    ]), data.atoms, data.manifest);
    expect(union.cards.map(({ code }) => code)).toEqual(["PROFILE"]);
    const intersection = normalizeBenchmarkCreatorProfileV2Output(generation([{ code: "CONTENT_STYLE", status: "CLEAR", text: "当前样本共同采用的方式是先给具体结果，再解释原因并给出行动。", evidenceRefs: refs.slice(0, 3) }]), data.atoms, data.manifest);
    expect(intersection.cards[0]).toMatchObject({ code: "CONTENT_STYLE", status: "CLEAR" });
  });

  it("keeps recurring viewpoints to one minimum common claim", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV2Output(generation([
      { code: "PROFILE", status: "OBSERVE", text: "从当前样本看，这是教培经营内容账号。", evidenceRefs: ["E001"] },
      { code: "RECURRING_VIEWPOINT", status: "CLEAR", text: "执行是账号的竞争壁垒，也是失败根因。", evidenceRefs: refs.slice(0, 3) },
      { code: "RECURRING_VIEWPOINT", status: "CLEAR", text: "当前样本反复强调，提出方法以后还需要持续执行。", evidenceRefs: refs.slice(0, 3) },
    ]), data.atoms, data.manifest);
    expect(output.cards.filter(({ code }) => code === "RECURRING_VIEWPOINT")).toHaveLength(1);
    expect(output.cards[0]?.text).not.toContain("竞争壁垒");
    const valid = normalizeBenchmarkCreatorProfileV2Output(generation([{ code: "RECURRING_VIEWPOINT", status: "CLEAR", text: "当前样本反复强调，提出方法以后还需要持续执行。", evidenceRefs: refs.slice(0, 3) }]), data.atoms, data.manifest);
    expect(valid.cards).toHaveLength(1);
  });

  it("enforces CLEAR ceilings for descriptive and profile cards", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV2Output(generation([
      { code: "PROFILE", status: "CLEAR", text: "从当前样本看，这是教培经营内容账号。", evidenceRefs: ["E001"] },
      { code: "TOPIC_STYLE", status: "CLEAR", text: "目前研究到的视频从具体经营问题切入。", evidenceRefs: refs.slice(0, 2) },
      { code: "CONTENT_STYLE", status: "CLEAR", text: "当前样本先给结果，再解释原因并给行动。", evidenceRefs: refs.slice(0, 3) },
    ]), data.atoms, data.manifest);
    expect(output.cards.map(({ status }) => status)).toEqual(["OBSERVE", "OBSERVE", "CLEAR"]);
  });

  it("derives LEARN and AVOID only from accepted upstream evidence and caps status", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV2Output(generation([
      { code: "TOPIC_STYLE", status: "OBSERVE", text: "当前样本从具体经营问题切入。", evidenceRefs: refs.slice(0, 2) },
      { code: "LEARN", status: "CLEAR", text: "可以从员工正在处理的具体问题切入，再给自己的行动。", evidenceRefs: refs.slice(0, 2) },
      { code: "AVOID", status: "CLEAR", text: "来源里的客户结果只能作为外部案例，不能变成我们的案例。", evidenceRefs: refs.slice(0, 2) },
    ]), data.atoms, data.manifest);
    expect(output.cards.map(({ code, status }) => [code, status])).toEqual([["TOPIC_STYLE", "OBSERVE"], ["LEARN", "OBSERVE"], ["AVOID", "OBSERVE"]]);
    const noUpstream = normalizeBenchmarkCreatorProfileV2Output(generation([
      { code: "PROFILE", status: "OBSERVE", text: "从当前样本看，这是教培经营内容账号。", evidenceRefs: ["E001"] },
      { code: "LEARN", status: "CLEAR", text: "学习他的专业", evidenceRefs: refs.slice(0, 2) },
      { code: "AVOID", status: "CLEAR", text: "不要完全照搬", evidenceRefs: refs.slice(0, 2) },
    ]), data.atoms, data.manifest);
    expect(noUpstream.cards.map(({ code }) => code)).toEqual(["PROFILE"]);
  });

  it("filters unknown refs, single-video recurrence, causal claims, and own-fact pollution", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV2Output(generation([
      { code: "PROFILE", status: "OBSERVE", text: "从当前样本看，这是教培经营内容账号。", evidenceRefs: ["E001", "missing"] },
      { code: "RECURRING_VIEWPOINT", status: "OBSERVE", text: "当前样本反复强调执行。", evidenceRefs: ["E001"] },
      { code: "TOPIC_STYLE", status: "CLEAR", text: "这种开头是账号爆火的原因。", evidenceRefs: refs.slice(0, 3) },
      { code: "CONTENT_STYLE", status: "CLEAR", text: "我们的客户和成交成绩可以直接作为证明。", evidenceRefs: refs.slice(0, 3) },
    ]), data.atoms, data.manifest);
    expect(output.cards).toHaveLength(1);
    expect(output.cards[0]?.evidenceRefs).toEqual(["E001"]);
  });

  it("persists prior version as revision context without treating it as evidence", () => {
    const prior = { studyId: "old-study", version: 6, schemaVersion: "benchmark-creator-profile-v2" as const, cards: [{ code: "RECURRING_VIEWPOINT" as const, status: "CLEAR" as const, text: "旧版说流量后需要团队承接。" }] };
    const data = fixture(prior);
    const output = normalizeBenchmarkCreatorProfileV2Output(generation([{ code: "RECURRING_VIEWPOINT", status: "OBSERVE", text: "当前样本反复强调，方法之后还需要持续执行。", evidenceRefs: refs.slice(0, 2) }]), data.atoms, data.manifest);
    expect(output.priorProfileVersion).toBe(6);
    expect(output.cards).toHaveLength(1);
    expect(output.cards[0]?.evidence.every(({ evidenceRef }) => evidenceRef.startsWith("E"))).toBe(true);
  });

  it("preserves strict candidate tolerance and exact evidence locks", () => {
    const data = fixture();
    const result = normalizeBenchmarkCreatorProfileV2Result(generation([
      { code: "UNKNOWN", status: "CLEAR", text: "错误", evidenceRefs: ["E001"] },
      { code: "PROFILE", status: "OBSERVE", text: "从当前样本看，这是教培经营内容账号。", evidenceRefs: ["E001"] },
    ]), data.atoms, data.manifest);
    expect(result.diagnostics).toEqual({ rawCardCount: 2, validCardCount: 1, droppedCardCount: 1 });
    expect(result.output.cards[0]?.evidence[0]).toMatchObject({ sampleId: "s1", sourceItemId: "source-1", materialDistillationId: "m7-1", materialDistillationVersion: 1, sourceRefs: ["T001"] });
    expect(() => normalizeBenchmarkCreatorProfileV2Output(generation([{ code: "UNKNOWN", status: "CLEAR", text: "错误", evidenceRefs: ["missing"] }]), data.atoms, data.manifest)).toThrowError(LLMError);
    expect(normalizeBenchmarkCreatorProfileV2Output(generation([]), data.atoms, data.manifest).cards).toEqual([]);
  });

  it("keeps the prompt simple, sample-scoped, update-aware, and independent from M8", () => {
    expect(benchmarkCreatorProfileOutputV2Instruction).toContain('Return only {"cards":[...]}');
    expect(benchmarkCreatorProfileOutputV2Instruction).toContain("current 5–10 researched samples");
    expect(benchmarkCreatorProfileOutputV2Instruction).toContain("Previous profile cards");
    expect(benchmarkCreatorProfileOutputV2Instruction).toContain("New E refs win");
    expect(benchmarkCreatorProfileOutputV2Instruction).toContain("Titles are background only");
    expect(benchmarkCreatorProfileOutputV2Instruction).not.toContain("M8");
  });
});
