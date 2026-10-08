import { inspectStudioFactText } from "../../studio/fact-safety";
import type { ContextItem, FactDecision } from "./contracts";

export type FactGateResult = {
  decision: FactDecision;
  warnings: string[];
  blockedReasons: string[];
  ownershipSummary: Record<ContextItem["ownership"], number>;
};

export class FactGateV2 {
  evaluate(input: { items: ContextItem[]; ownFacts: string[]; proposedText?: string; instruction?: string }): FactGateResult {
    const ownershipSummary = input.items.reduce<FactGateResult["ownershipSummary"]>((summary, item) => {
      summary[item.ownership] += 1;
      return summary;
    }, { OWN_CONFIRMED: 0, EXTERNAL: 0, PENDING: 0, HYPOTHETICAL: 0, PROHIBITED: 0, METHOD_GUIDANCE: 0 });
    const warnings = [
      ...(ownershipSummary.EXTERNAL ? ["外部资料只可作为参考，不能自动写成我方经历、案例或数据。"] : []),
      ...(ownershipSummary.PENDING ? ["待确认信息不能写成确定事实。"] : []),
      ...(ownershipSummary.HYPOTHETICAL ? ["示例和假设必须保留明确的示例语义。"] : []),
      ...(ownershipSummary.METHOD_GUIDANCE ? ["创作方法只指导表达，不作为事实依据。"] : []),
    ];
    const blockedReasons = input.items.filter((item) => item.ownership === "PROHIBITED").map((item) => `${item.objectType}:${item.objectId} 不允许作为事实使用`);
    if (ownershipSummary.EXTERNAL && input.instruction && /(?:写成|改成|包装成|当成).{0,12}(?:我们|我方|自己的).{0,10}(?:案例|事实|数据|成绩|经历)/u.test(input.instruction)) blockedReasons.push("外部内容不能提升为自己的事实");
    if (input.proposedText?.trim()) {
      const inspected = inspectStudioFactText(input.proposedText, input.ownFacts);
      if (inspected.blocked) blockedReasons.push(...inspected.reasons);
    }
    return {
      decision: blockedReasons.length ? "BLOCK" : warnings.length ? "PASS_WITH_WARNINGS" : "PASS",
      warnings: [...new Set(warnings)],
      blockedReasons: [...new Set(blockedReasons)],
      ownershipSummary,
    };
  }
}
