import { describe, expect, it } from "vitest";
import {
  LLMError,
  benchmarkCreatorProfileGenerationV3Schema,
  benchmarkCreatorProfileInputV3Schema,
  benchmarkCreatorProfileOutputV3Instruction,
  type BenchmarkCreatorProfileGenerationV3,
} from "@content-center/providers";
import { normalizeBenchmarkCreatorProfileV3Output, normalizeBenchmarkCreatorProfileV3Result, type CreatorProfileAtom } from "./benchmark-creator-profile";

const topics = [
  "具体经营数字和结果切入，用客户案例解释后给行动",
  "具体经营数字和结果切入，用成交数据解释；流量后还要成交承接",
  "具体经营数字和结果切入，用真实数据解释；流量后还要团队承接",
  "这条视频使用采访和现场记录",
  "从教培从业者的行业伦理困境切入",
];

function fixture(priorProfile: ReturnType<typeof benchmarkCreatorProfileInputV3Schema.parse>["priorProfile"] = null) {
  const inputs = Array.from({ length: 5 }, (_, index) => ({ sampleId: `s${index + 1}`, sourceItemId: `source-${index + 1}`, materialDistillationId: `m7-${index + 1}`, materialDistillationVersion: index + 1 }));
  const atoms: CreatorProfileAtom[] = inputs.map((input, index) => ({ ...input, ref: `E00${index + 1}`, itemKind: "HIGHLIGHT", itemKey: "0", title: `精华 ${index + 1}`, text: topics[index]!, type: "method", quality: "OBSERVE", sourceRefs: ["T001"], evidence: [{ ref: "T001", text: `正文 ${index + 1}` }] }));
  const manifest = benchmarkCreatorProfileInputV3Schema.parse({ kind: "CREATOR_PROFILE_INPUT", schemaVersion: "benchmark-creator-profile-v3", account: { name: "真实博主", platform: "DOUYIN", bio: "面向教培经营者", tags: ["教培运营"] }, distillations: inputs, accountResearch: null, priorProfileVersion: priorProfile?.version ?? null, priorProfile });
  return { inputs, atoms, manifest };
}

const claim = (key: string, text: string, evidenceRefs: string[], derivedFrom: string[] = []) => ({ key, text, evidenceRefs, derivedFrom });
const card = (code: string, status: "CLEAR" | "OBSERVE", claims: unknown[]) => ({ code, status, claims });
const generation = (cards: unknown[]): BenchmarkCreatorProfileGenerationV3 => benchmarkCreatorProfileGenerationV3Schema.parse({ cards });

describe("benchmark creator profile V3 claim-level evidence", () => {
  it("keeps a three-source TOPIC_STYLE claim and filters its one-source sibling", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([card("TOPIC_STYLE", "CLEAR", [
      claim("K001", "当前样本经常从具体经营数字或结果切入。", ["E001", "E002", "E003"]),
      claim("K002", "当前样本经常从行业伦理困境切入。", ["E005"]),
      claim("K003", "当前样本经常从数字结果和行业伦理困境切入。", ["E001", "E002", "E003", "E005"]),
    ])]), data.atoms, data.manifest);
    expect(output.cards[0]).toMatchObject({ code: "TOPIC_STYLE", status: "CLEAR", claims: [{ id: "C001", text: expect.stringContaining("数字或结果") }] });
    expect(output.cards[0]?.claims).toHaveLength(1);
  });

  it("keeps repeated evidence behavior and drops an interview found in one video", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([card("CONTENT_STYLE", "CLEAR", [
      claim("K001", "当前样本常用具体案例或数字把判断讲清楚。", ["E001", "E002", "E003"]),
      claim("K002", "当前样本经常使用采访和现场记录。", ["E004"]),
    ])]), data.atoms, data.manifest);
    expect(output.cards[0]?.claims.map(({ text }) => text)).toEqual(["当前样本常用具体案例或数字把判断讲清楚。"]);
  });

  it("does not turn three separately supported bullets into a recurring viewpoint", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([
      card("PROFILE", "OBSERVE", [claim("K000", "从当前样本看，这是教培经营内容账号。", ["E001"])]),
      card("RECURRING_VIEWPOINT", "CLEAR", [claim("K001", "流量后需要成交承接。", ["E002"]), claim("K002", "负责人需要持续执行。", ["E004"]), claim("K003", "同一案例应多形式重复展示。", ["E001"])]),
    ]), data.atoms, data.manifest);
    expect(output.cards.map(({ code }) => code)).toEqual(["PROFILE"]);
  });

  it("keeps two-source recurrence as OBSERVE and allows three-source CLEAR", () => {
    const data = fixture();
    const observe = normalizeBenchmarkCreatorProfileV3Output(generation([card("RECURRING_VIEWPOINT", "CLEAR", [claim("K001", "当前样本反复强调，流量后还需要有人承接。", ["E002", "E003"])])]), data.atoms, data.manifest);
    expect(observe.cards[0]?.status).toBe("OBSERVE");
    const clear = normalizeBenchmarkCreatorProfileV3Output(generation([card("RECURRING_VIEWPOINT", "CLEAR", [claim("K001", "当前样本反复从具体经营结果进入解释。", ["E001", "E002", "E003"])])]), data.atoms, data.manifest);
    expect(clear.cards[0]?.status).toBe("CLEAR");
  });

  it("sets card status to the weakest retained claim", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([card("TOPIC_STYLE", "CLEAR", [claim("K001", "当前样本经常从具体经营结果切入。", ["E001", "E002", "E003"]), claim("K002", "目前观察到，部分内容从校长经营问题切入。", ["E001", "E002"])])]), data.atoms, data.manifest);
    expect(output.cards[0]).toMatchObject({ status: "OBSERVE", claims: [{ id: "C001" }, { id: "C002" }] });
  });

  it("aggregates one topic classification per video into current-sample counts", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([card("CONTENT_MIX", "CLEAR", [
      claim("K001", "招生/成交", ["E001"]), claim("K002", "招生/成交", ["E002"]), claim("K003", "招生/成交", ["E003"]), claim("K004", "直播/执行", ["E004"]), claim("K005", "行业观点", ["E005"]),
    ])]), data.atoms, data.manifest);
    expect(output.cards[0]).toMatchObject({ code: "CONTENT_MIX", status: "CLEAR", claims: [{ text: "当前分析的 5 条里：3 条“招生/成交”；1 条“行业观点”；1 条“直播/执行”。" }] });
  });

  it("omits CONTENT_MIX unless every selected video has one classification", () => {
    const data = fixture();
    expect(() => normalizeBenchmarkCreatorProfileV3Output(generation([card("CONTENT_MIX", "CLEAR", [claim("K001", "招生/成交", ["E001"]), claim("K002", "招生/成交", ["E002"])])]), data.atoms, data.manifest)).toThrowError(LLMError);
  });

  it("derives LEARN only from accepted current claims and inherits evidence", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([
      card("TOPIC_STYLE", "CLEAR", [claim("K001", "当前样本经常从具体经营数字或结果切入。", ["E001", "E002", "E003"]), claim("K002", "经常从行业伦理困境切入。", ["E005"])]),
      card("LEARN", "CLEAR", [claim("K003", "可以从员工正在处理的具体经营数字或结果切入。", [], ["K001"]), claim("K004", "学习单条伦理表达。", [], ["K002"])]),
    ]), data.atoms, data.manifest);
    expect(output.cards.find(({ code }) => code === "LEARN")?.claims).toEqual([expect.objectContaining({ derivedFrom: ["C001"], evidenceRefs: ["E001", "E002", "E003"] })]);
  });

  it("derives AVOID from formal evidence and rejects unknown derivedFrom", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([
      card("CONTENT_STYLE", "CLEAR", [claim("K001", "当前样本常用具体案例或数字把判断讲清楚。", ["E001", "E002", "E003"])]),
      card("AVOID", "CLEAR", [claim("K002", "可以学证据方式，但对方客户、成绩和成交数字不能变成我们的事实。", [], ["K001"]), claim("K003", "不要完全照搬。", [], ["K999"])]),
    ]), data.atoms, data.manifest);
    expect(output.cards.find(({ code }) => code === "AVOID")?.claims).toEqual([expect.objectContaining({ derivedFrom: ["C001"] })]);
  });

  it("does not inherit a previous claim without current evidence", () => {
    const prior = { studyId: "old", version: 8, schemaVersion: "benchmark-creator-profile-v3" as const, cards: [{ code: "RECURRING_VIEWPOINT" as const, status: "CLEAR" as const, claims: [{ id: "C001", text: "旧版说流量后需要承接。" }] }] };
    const data = fixture(prior);
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([]), data.atoms, data.manifest);
    expect(output.cards).toEqual([]);
    expect(output.priorProfileVersion).toBe(8);
  });

  it("updates one recurring meaning without keeping duplicate paraphrases", () => {
    const prior = { studyId: "old", version: 8, schemaVersion: "benchmark-creator-profile-v3" as const, cards: [{ code: "RECURRING_VIEWPOINT" as const, status: "OBSERVE" as const, claims: [{ id: "C001", text: "旧版说流量后需要成交承接。" }] }] };
    const data = fixture(prior);
    const text = "当前样本反复强调，流量后还需要有人承接。";
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([card("RECURRING_VIEWPOINT", "OBSERVE", [claim("K001", text, ["E002", "E003"]), claim("K002", text, ["E002", "E003"])])]), data.atoms, data.manifest);
    expect(output.cards[0]?.claims).toHaveLength(1);
    expect(output.priorProfileVersion).toBe(8);
  });

  it("filters own-fact pollution, why-fire claims, and unsupported consultancy language", () => {
    const data = fixture();
    const output = normalizeBenchmarkCreatorProfileV3Output(generation([
      card("PROFILE", "OBSERVE", [claim("K000", "从当前样本看，这是教培经营内容账号。", ["E001"])]),
      card("TOPIC_STYLE", "CLEAR", [claim("K001", "这种选题是账号爆火的原因。", ["E001", "E002", "E003"])]),
      card("CONTENT_STYLE", "CLEAR", [claim("K002", "我们的客户和成交成绩可以直接作为证明。", ["E001", "E002", "E003"])]),
      card("RECURRING_VIEWPOINT", "CLEAR", [claim("K003", "执行是这个账号的竞争壁垒。", ["E001", "E002", "E003"])]),
    ]), data.atoms, data.manifest);
    expect(output.cards.map(({ code }) => code)).toEqual(["PROFILE"]);
  });

  it("assigns deterministic claim ids and keeps every claim's exact evidence lock", () => {
    const data = fixture();
    const result = normalizeBenchmarkCreatorProfileV3Result(generation([card("PROFILE", "OBSERVE", [claim("K001", "从当前样本看，这是教培经营内容账号。", ["E001"])]), card("TOPIC_STYLE", "CLEAR", [claim("K002", "当前样本经常从具体经营数字或结果切入。", ["E001", "E002", "E003"])])]), data.atoms, data.manifest);
    expect(result.output.cards.flatMap(({ claims }) => claims.map(({ id }) => id))).toEqual(["C001", "C002"]);
    expect(result.output.cards[1]?.claims[0]?.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ evidenceRef: "E001", sourceItemId: "source-1", materialDistillationId: "m7-1", materialDistillationVersion: 1, sourceRefs: ["T001"] })]));
    expect(result.diagnostics).toMatchObject({ rawClaimCount: 2, validClaimCount: 2, droppedClaimCount: 0 });
  });

  it("keeps V3 prompt claim-scoped, update-aware, human, and independent from M8", () => {
    expect(benchmarkCreatorProfileOutputV3Instruction).toContain("one atomic statement");
    expect(benchmarkCreatorProfileOutputV3Instruction).toContain("one classification claim per current video");
    expect(benchmarkCreatorProfileOutputV3Instruction).toContain("derivedFrom");
    expect(benchmarkCreatorProfileOutputV3Instruction).toContain("never evidence");
    expect(benchmarkCreatorProfileOutputV3Instruction).not.toContain("M8");
  });
});
