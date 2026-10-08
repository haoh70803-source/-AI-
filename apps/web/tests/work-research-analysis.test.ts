import { describe, expect, it } from "vitest";
import { validateWorkDecisionPass, validateWorkDeepAnswer, validateWorkDeepAnswerV2 } from "../server/research/work-research-analysis";
import { sampleAnswer, sampleAnswerV2, sampleBody, sampleDecisionPass, sampleEvidence } from "./work-research-fixture";

describe("single-work dynamic deep analysis", () => {
  it("accepts dynamic blocks with actual transcript timecodes and grounded mechanisms", () => {
    expect(validateWorkDeepAnswer(sampleAnswer(), sampleEvidence).structureBlocks).toHaveLength(3);
  });
  it("rejects invented excerpts and invented timecodes", () => {
    const quote = sampleAnswer(); quote.structureBlocks[0]!.citation.quote = "作品完全没说的话";
    expect(() => validateWorkDeepAnswer(quote, sampleEvidence)).toThrow("WORK_QUOTE_NOT_IN_SNAPSHOT");
    const time = sampleAnswer(); time.structureBlocks[0]!.startMs = 12000; time.structureBlocks[0]!.endMs = 18000;
    expect(() => validateWorkDeepAnswer(time, sampleEvidence)).toThrow("WORK_TIMECODE_NOT_IN_SNAPSHOT");
  });
  it("keeps absent mechanisms absent and refuses made-up performance numbers", () => {
    const noProof = sampleAnswer(); noProof.mechanisms = noProof.mechanisms.filter(item => item.kind !== "PROOF");
    expect(validateWorkDeepAnswer(noProof, sampleEvidence).mechanisms).toHaveLength(1);
    const invented = sampleAnswer(); invented.summary = "这条内容带来999999次转化";
    expect(() => validateWorkDeepAnswer(invented, sampleEvidence)).toThrow("WORK_UNSUPPORTED_NUMBER");
  });
  it("validates decision citations, audience journey and transcript-only visual limits", () => {
    expect(validateWorkDeepAnswerV2(sampleAnswerV2(), sampleEvidence).decision.audienceRoles[0]?.relation).toBe("VIEWER");
    const citation = sampleAnswerV2(); citation.decision.strengths[0]!.citation.quote = "作品没说这句话";
    expect(() => validateWorkDeepAnswerV2(citation, sampleEvidence)).toThrow("WORK_QUOTE_NOT_IN_SNAPSHOT");
    const journey = sampleAnswerV2(); journey.decision.audienceJourney[0]!.afterBlock = 9;
    expect(() => validateWorkDeepAnswerV2(journey, sampleEvidence)).toThrow("WORK_JOURNEY_BLOCK_INVALID");
    const visual = sampleAnswerV2(); visual.decision.packaging.coverOrVisual = "封面写了教程";
    expect(() => validateWorkDeepAnswerV2(visual, sampleEvidence)).toThrow("WORK_VISUAL_EVIDENCE_MISSING");
  });
  it("keeps ASR display corrections separate from immutable source text", () => {
    const corrected = sampleAnswerV2(); corrected.decision.displayCorrections = [{ original: "操作", display: "演示", reason: "疑似转写误识别", citation: { ref: "M1", quote: "接着演示操作" } }];
    expect(validateWorkDeepAnswerV2(corrected, sampleEvidence).decision.displayCorrections).toHaveLength(1);
    expect(sampleEvidence.contentText).toBe(sampleBody);
    const invented = sampleAnswerV2(); invented.decision.displayCorrections = [{ original: "不存在", display: "演示", reason: "猜测", citation: { ref: "M1", quote: "接着演示操作" } }];
    expect(() => validateWorkDeepAnswerV2(invented, sampleEvidence)).toThrow("WORK_DISPLAY_CORRECTION_UNGROUNDED");
  });
  it("separates source limitations from work weaknesses and drops invalid block pointers", () => {
    const asr = sampleAnswerV2(); asr.decision.weaknesses[0]!.finding = "机器转写有识别错误";
    expect(() => validateWorkDeepAnswerV2(asr, sampleEvidence)).toThrow("WORK_SOURCE_LIMIT_IS_NOT_CONTENT_WEAKNESS");
    const pass = sampleDecisionPass(); pass.weaknesses[0]!.finding = "机器转写有识别错误";
    pass.audienceJourney[0]!.afterBlock = 9;
    const result = validateWorkDecisionPass(pass, sampleAnswer(), sampleEvidence);
    expect(result.decision.weaknesses).toHaveLength(0);
    expect(result.decision.audienceJourney).toHaveLength(0);
    expect(result.decision.researchLimits.join(" ")).toContain("机器转写");
  });
});
