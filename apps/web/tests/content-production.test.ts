import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countSpokenCharacters, estimateSpokenDuration, groundUngroundedPersonalClaims, resolveOwnContribution, sourceDisplayName } from "../lib/content-production";
import { motherContentPreviewSchema, motherContentProviderSchema } from "../server/ai/schemas";

const providerResult = {
  recommendedAngle: "教培短视频的问题不是不会拍，而是没有接进获客链路。",
  alternativeAngles: ["为什么播放不错却没有咨询", "为什么内容应该成为销售前置"],
  recommendedTitle: "视频拍得不错，为什么还是没咨询？",
  alternativeTitles: ["教培短视频最重要的不是拍摄", "校长做内容，先接上获客链路"],
  openingHook: "很多机构没效果，第一反应都是拍摄不行。",
  outline: ["误区", "判断", "行动"],
  body: "很多机构没效果，第一反应都是拍摄不行。真正断掉的，往往是内容和咨询之间的链路。",
  evidenceIds: [],
  sourceItemIds: [],
};

describe("video content production", () => {
  it("keeps one recommended angle, at most two alternatives, three titles and one opening in structured output", () => {
    const parsed = motherContentProviderSchema.parse(providerResult);
    expect(parsed.alternativeAngles).toHaveLength(2);
    expect([parsed.recommendedTitle, ...parsed.alternativeTitles]).toHaveLength(3);
    expect(parsed.openingHook).toBeTruthy();
    expect(() => motherContentProviderSchema.parse({ ...providerResult, alternativeAngles: ["1", "2", "3"] })).toThrow();
  });

  it("calculates character count and duration deterministically", () => {
    expect(countSpokenCharacters("一 二\n三")).toBe(3);
    expect(estimateSpokenDuration("一".repeat(252))).toBe(60);
  });

  it("treats a legacy mother result as body-only instead of fabricating production advice", () => {
    expect(motherContentPreviewSchema.safeParse({ title: "旧稿", outline: [], body: "旧正文", evidenceIds: [], sourceItemIds: [] }).success).toBe(false);
  });

  it("marks sparse creator input as weak and never needs an invented case", () => {
    expect(resolveOwnContribution({ coreMessage: "只讲一个观点", background: "", audience: "校长" })).toBe("WEAK");
    expect(resolveOwnContribution({ coreMessage: "这是我们长期坚持的真实判断，先建立信任再给方法。", background: "我们在真实业务中反复验证过这个沟通顺序，并记录了具体过程。", audience: "校长" })).toBe("MEDIUM");
  });

  it("grounds unsupported first-person social proof when no personal background was supplied", () => {
    const generated = "很多校长跟我聊，说短视频有流量却没转化。我见过一种做法，挺有意思。我们自己做下来以后发现要先建立信任。我们在持续调，不是拿一套模板套所有人。我们的客户、收入、成绩、项目和经历都不能由外部素材授权。";
    const grounded = groundUngroundedPersonalClaims(generated, false);
    expect(grounded).not.toMatch(/跟我聊|我见过|我们自己做下来|我们在持续调/);
    expect(grounded).not.toMatch(/我们的(?:客户|收入|成绩|项目|经历)/);
    expect(grounded).toContain("很多校长都会遇到这样的情况");
    expect(groundUngroundedPersonalClaims(generated, true)).toBe(generated);
  });

  it("uses deterministic material naming fallbacks", () => {
    expect(sourceDisplayName({ title: null, suggestedTitle: "整理后的标题", summary: "摘要", platformLabel: "抖音", createdAt: new Date("2026-09-03") })).toBe("整理后的标题");
    expect(sourceDisplayName({ title: null, summary: "这是一段足够清楚的整理摘要", platformLabel: "抖音", createdAt: new Date("2026-09-03") })).toBe("这是一段足够清楚的整理摘要");
    expect(sourceDisplayName({ title: null, summary: null, platformLabel: "抖音", createdAt: new Date("2026-09-03") })).toMatch(/^抖音资料 · /);
  });

  it("keeps the material workbench non-linear and moves secondary operations behind more", () => {
    const workspace = readFileSync(new URL("../components/library/material-workspace.tsx", import.meta.url), "utf8");
    const analysis = readFileSync(new URL("../components/library/material-analysis-card.tsx", import.meta.url), "utf8");
    const detailPage = readFileSync(new URL("../app/(app)/library/[id]/page.tsx", import.meta.url), "utf8");
    expect(workspace).toContain("当前已有成果");
    expect(workspace).toContain("现在最值得做");
    expect(workspace).toContain("不会强制按顺序研究");
    expect(workspace).toContain('type Tab = "研究成果" | "去创作" | "更多"');
    expect(workspace).toContain('data-testid="material-workspace-scroll-body"');
    expect(workspace).toContain("overflow-y-auto");
    expect(workspace).toContain("material-secondary-grid");
    expect(analysis).toContain("查看原文依据");
    expect(analysis).toContain("历史内容理解");
    expect(analysis).toContain("<details");
    expect(detailPage).toContain("material-transcript-disclosure");
    expect(detailPage).toContain("hasConfirmableInformation");
    expect(detailPage).toContain("recommendedAction");
    expect(detailPage).toContain("内容已准备好");
  });
});
