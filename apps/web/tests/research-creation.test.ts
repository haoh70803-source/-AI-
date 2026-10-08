import { expect, it } from "vitest";
import { researchCreationPrompt } from "../components/research/creation-prompt";
it("borrows user-selected mechanisms without forcing a script or a fixed Hook count", () => {
  const prompt = researchCreationPrompt({ audience: "运营人员", goal: "解释概念", format: "文章", borrow: ["内容结构"], hasOwnMaterial: true });
  expect(prompt).toContain("形式：文章"); expect(prompt).toContain("我想借鉴：内容结构"); expect(prompt).not.toContain("三个"); expect(prompt).not.toContain("完整可口播"); expect(prompt).toContain("仅有转录时不声称看过画面");
});
it("works without own material while retaining business-fact boundaries", () => {
  const prompt = researchCreationPrompt({ audience: "", goal: "", format: "图文", borrow: [], hasOwnMaterial: false });
  expect(prompt).toContain("没有自有业务资料"); expect(prompt).toContain("留白"); expect(prompt).toContain("不要编造自己的经历、数字、效果或承诺"); expect(prompt).toContain("必要时向我提问");
});
