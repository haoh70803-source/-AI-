import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { accountResearchFacts, accountResearchPrompt, validateAccountResearchAnswer } from "../server/research/account-research-analysis";
import { planAccountResearch } from "../server/research/account-research-evidence";
import type { AccountEvidence, AccountResearchState } from "../server/research/account-research-contract";
import { accountResearchFixture } from "./account-research-fixture";

function evidence(texts = 1): AccountEvidence {
  return { schemaVersion: "account-evidence-v1", account: { id: "account", name: "账号", platform: "DOUYIN" }, capturedAt: "2026-09-28", fingerprint: `snapshot-${texts}`, collectionRunId: null, from: null, to: null, totalWorks: 3, limited: false, totalComments: 0, comments: [],
    works: [0, 1, 2].map(index => ({ id: `work-${index}`, ref: `W${index}`, sourceItemId: index < texts ? `source-${index}` : null, title: `怎样核对证据${index}`, url: "https://example.test/work", publishedAt: `2026-09-${20 - index}T00:00:00Z`, observedAt: "2026-09-28", metadataHash: `meta-${index}`, metrics: { likes: index === 2 ? null : index * 10, comments: null, shares: null, favorites: null, views: null }, durationMs: null, bodyHash: index < texts ? `body-${index}` : null, bodyText: index < texts ? "先记录真实问题，再用自己的案例解释，最后邀请读者检查证据。" : "", bodyLength: index < texts ? 31 : 0, contentOrigin: "ORIGINAL", contentVersion: null, hasTimecodes: false })) };
}
function prepared(texts = 1) { const state = planAccountResearch(evidence(texts), null, null); return { state, output: accountResearchFixture(accountResearchPrompt(state, null, "研究")) }; }
describe("account research evidence contracts", () => {
  it("works with one body and separately preserves metadata and title-level analysis", () => {
    const { state, output } = prepared(); const result = validateAccountResearchAnswer(output, state, null);
    expect(result.workAnalyses.filter(item => item.basis === "TEXT")).toHaveLength(1);
    expect(accountResearchFacts(state.evidence, result.workAnalyses)).toMatchObject({ workCount: 3, textCount: 1, analyzedTextCount: 1, analyzedTitleCount: 2 });
  });
  it("accepts metadata-only research but refuses invented full-body knowledge and quotes", () => {
    const { state, output } = prepared(0);
    expect(() => validateAccountResearchAnswer(output, state, null)).not.toThrow();
    const invented = structuredClone(output); invented.workAnalyses[0]!.opening = "猜测开头";
    expect(() => validateAccountResearchAnswer(invented, state, null)).toThrow("ACCOUNT_TITLE_IS_NOT_BODY");
    const badQuote = structuredClone(output); badQuote.findings[0]!.citations[0]!.quote = "完全不存在的原文";
    expect(() => validateAccountResearchAnswer(badQuote, state, null)).toThrow("ACCOUNT_QUOTE_NOT_IN_SNAPSHOT");
  });
  it("reuses unchanged analysis and invalidates only added or changed bodies", () => {
    const { state, output } = prepared(1); const result = validateAccountResearchAnswer(output, state, null);
    const old: AccountResearchState = { ...state, workAnalyses: result.workAnalyses, answer: result.answer };
    const same = planAccountResearch(evidence(1), old, "old-run");
    expect(same.analyzedRefs).toEqual([]); expect(same.reusedRefs).toHaveLength(3);
    const update = planAccountResearch(evidence(2), old, "old-run");
    expect(update.analyzedRefs).toEqual(["W1"]); expect(update.reusedRefs).toHaveLength(2);
    expect(update.delta).toMatchObject({ previousTextCount: 1, currentTextCount: 2, updatedText: ["W1"] });
  });
  it("requires both comparison groups, reviews all old findings, and rejects fabricated metrics", () => {
    const { state, output } = prepared(2);
    const bad = structuredClone(output); bad.comparisons[0]!.highRefs = ["W0"];
    expect(() => validateAccountResearchAnswer(bad, state, null)).toThrow("ACCOUNT_COMPARISON_GROUP_MISMATCH");
    const numeric = structuredClone(output); numeric.findings[0]!.statement = "观察到9999999次播放";
    expect(() => validateAccountResearchAnswer(numeric, state, null)).toThrow("ACCOUNT_UNSUPPORTED_NUMBER");
    const result = validateAccountResearchAnswer(output, state, null); const previous = { ...state, workAnalyses: result.workAnalyses, answer: result.answer };
    const update = planAccountResearch(evidence(3), previous, "old"); const answer = accountResearchFixture(accountResearchPrompt(update, previous, "更新")); answer.reviews = [];
    expect(() => validateAccountResearchAnswer(answer, update, previous)).toThrow("ACCOUNT_OLD_FINDINGS_NOT_REVIEWED");
  });
  it("does not produce comment insights without actual comments", () => {
    const { state, output } = prepared();
    output.commentInsights = [{ kind: "NEED", title: "假需求", statement: "未知", citations: [{ ref: "W0", quote: state.evidence.works[0]!.bodyText }], limitation: "样本" }];
    expect(() => validateAccountResearchAnswer(output, state, null)).toThrow("ACCOUNT_COMMENT_EVIDENCE_REQUIRED");
  });
  it("researches one real comment without a sample threshold", () => {
    const current = evidence(1);
    current.comments = [{ id: "comment", ref: "C1", workRef: "W0", text: "能否展示具体的检查步骤？", likes: 1, postedAt: null, hash: "comment-hash" }]; current.totalComments = 1;
    const state = planAccountResearch(current, null, null); const output = accountResearchFixture(accountResearchPrompt(state, null, "评论"));
    output.commentInsights = [{ kind: "QUESTION", title: "希望看到步骤", statement: "这条评论希望看到具体检查步骤。", citations: [{ ref: "C1", quote: current.comments[0]!.text }], limitation: "只代表当前评论，不能推断全部受众。" }];
    expect(() => validateAccountResearchAnswer(output, state, null)).not.toThrow();
  });
  it("invalidates changed titles and removed bodies while preserving the previous snapshot", () => {
    const { state, output } = prepared(2); const result = validateAccountResearchAnswer(output, state, null);
    const previous = { ...state, workAnalyses: result.workAnalyses, answer: result.answer };
    const oldJson = JSON.stringify(previous); const current = evidence(2);
    current.works[0]!.title = "新标题"; current.works[0]!.metadataHash = "changed";
    current.works[1]!.bodyHash = null; current.works[1]!.bodyText = ""; current.works[1]!.bodyLength = 0;
    current.works.pop();
    const plan = planAccountResearch(current, previous, "old");
    expect(plan.analyzedRefs.sort()).toEqual(["W0", "W1"]); expect(plan.delta.removed).toEqual(["W2"]);
    expect(plan.reusedRefs).toEqual([]); expect(JSON.stringify(previous)).toBe(oldJson);
  });

  it("accepts exact system scope counts without whitelisting those numbers as performance claims", () => {
    const { state, output } = prepared();
    output.summary = "本次使用3条作品、1条可读正文、0条评论，结论仅适用于当前样本。";
    expect(() => validateAccountResearchAnswer(output, state, null)).not.toThrow();
    output.summary = "本次使用4条作品。";
    expect(() => validateAccountResearchAnswer(output, state, null)).toThrow("ACCOUNT_UNSUPPORTED_NUMBER");
    output.summary = "这些作品有3次播放。";
    expect(() => validateAccountResearchAnswer(output, state, null)).toThrow("ACCOUNT_UNSUPPORTED_NUMBER");
  });

  it("preserves an omitted optional observation as unavailable instead of inventing content", () => {
    const { state, output } = prepared();
    const sparse = structuredClone(output) as unknown as { workAnalyses: Array<Record<string, unknown>> };
    delete sparse.workAnalyses[0]!.examples;
    expect(validateAccountResearchAnswer(sparse, state, null).workAnalyses[0]!.examples).toBeNull();
  });

});
