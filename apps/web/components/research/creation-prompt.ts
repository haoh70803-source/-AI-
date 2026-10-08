export const BORROW_PARTS = ["选题角度", "开头", "内容结构", "表达方式"] as const;
export function researchCreationPrompt(input: { audience: string; goal: string; format: string; borrow: string[]; hasOwnMaterial: boolean }) {
  return [
    "请根据本轮引用的研究和当前项目，形成属于我的一版内容。",
    input.audience.trim() ? "目标受众：" + input.audience.trim() + "。" : "受众未明确时先说明你采用的假设，必要时向我提问。",
    "形式：" + input.format + "。目标：" + (input.goal.trim() || "把研究转成清楚、有用、可继续修改的内容") + "。",
    "我想借鉴：" + (input.borrow.length ? input.borrow.join("、") : "与目标相关的做法") + "；不要照抄原作品的人物、案例和措辞。",
    "段落、分析维度和开头备选数量随实际内容决定，不为凑固定模板补内容。",
    input.hasOwnMaterial ? "结合本轮选中的自有资料；只采用资料实际支持的业务事实。" : "没有自有业务资料：按研究来源能支持的内容写，业务事实缺口保留问题或留白。",
    "不要编造自己的经历、数字、效果或承诺。研究推断仍须注明条件。仅有转录时不声称看过画面；拍摄建议只能作为新方案。",
    "先给可编辑的一版，再简短列出需要我补充的事实。"
  ].join("\n");
}
